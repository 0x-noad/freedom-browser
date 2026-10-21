/**
 * Cross-partition published reads, end to end through the real host.
 *
 * Every other suite here stubs something: the keystore, the blob store, or the
 * engine itself. This one stubs nothing below the IPC boundary — real
 * `DataVaultKeystore` over a real mnemonic, real `DataVaultStorage` over a temp
 * directory, the real vendored engine, the real remembered-grant store — and
 * drives it the way a page does, through `_onRequest` with an authoritative
 * `senderFrame.url`.
 *
 * It exists because the one claim the feature rests on is the hardest to see in
 * a unit test: that a granted cross-origin read comes back with the owner's
 * VALUE in it. Everything around that answers `null` by design — an unapproved
 * owner, a path outside `/shared`, a site never visited — so a wiring mistake
 * anywhere in the chain looks exactly like the no-oracle behaviour working.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const ipcHandlers = {};
jest.mock('electron', () => ({
  app: { getPath: jest.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: {
    handle: (channel, handler) => {
      ipcHandlers[channel] = handler;
    },
    on: () => {},
    removeHandler: () => {},
  },
  nativeImage: { createFromBuffer: () => null },
  dialog: { showMessageBox: async () => ({ response: 1 }) },
  webContents: { fromId: () => null },
}));

jest.mock('../vault-timer', () => ({ resetVaultAutoLockTimer: jest.fn() }));

const OWNER_ORIGIN = 'http://owner.localhost:8799';
const OWNER_NS = 'web:http://owner.localhost:8799';
const READER_ORIGIN = 'http://reader.localhost:8799';
const READER_NS = 'web:http://reader.localhost:8799';

let tmpDir;
let manager;
let perms;
/** Every consent request the host raised, in order. */
let prompted;

/** A page's IPC event: the origin comes from the frame, never from the page. */
const frame = (origin, webContentsId) => ({
  senderFrame: { url: `${origin}/index.html` },
  sender: { id: webContentsId, isDestroyed: () => false, send: () => {} },
});

/** Call the provider the way `vault:provider-request` does, and unwrap it. */
async function call(event, method, params = {}) {
  const reply = await manager._onRequest(event, { method, params });
  if (reply.error) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
  return reply.result;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-crossread-'));
  jest.resetModules();
  require('electron').app.getPath.mockReturnValue(tmpDir);
  perms = require('./data-vault-permissions');
  perms._resetCache();
  const { DataVaultManager } = require('./data-vault-manager');

  prompted = [];
  manager = new DataVaultManager({
    dataDir: tmpDir,
    identityVault: {
      isUnlocked: () => true,
      // Any string: the keystore HKDFs it into the data-vault DEK.
      getMnemonic: () => 'test test test test test test test test test test test junk',
      ensureUnlocked: async () => true,
    },
    // Stands in for the Data pane: approves exactly what was asked, including
    // every cross-origin read the ENGINE resolved.
    promptConsent: async (req) => {
      prompted.push(req);
      return {
        approved: true,
        grantedMethods: (req.requestedScopes || []).flatMap((s) => s.methods || []),
        grantedFields: (req.requestedScopes || []).flatMap((s) => s.fields || []),
        grantedForeignReads: (req.foreignReads || []).map((e) => ({
          namespace: e.namespace,
          origin: e.origin,
          paths: e.paths,
        })),
        writePolicy: 'ask-once-per-session',
      };
    },
  });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

/** The owner connects, publishes `value`, and returns its session id. */
async function ownerPublishes(value, pointer = '/shared/displayName') {
  const event = frame(OWNER_ORIGIN, 11);
  const session = await call(event, 'vault_connect', {
    requestedScopes: [
      {
        methods: ['vault_getData', 'vault_setData'],
        // Publishing needs a grant rooted at or below /shared: that is the gate.
        fields: [{ path: '/shared', read: true, write: true }],
      },
    ],
  });
  await call(event, 'vault_setData', { sessionId: session.sessionId, values: { [pointer]: value } });
  return session;
}

/** The reader connects naming `owner`, and returns its session id. */
async function readerConnects(paths = ['/shared/displayName'], owner = OWNER_ORIGIN) {
  const event = frame(READER_ORIGIN, 22);
  const session = await call(event, 'vault_connect', {
    requestedScopes: [
      {
        methods: ['vault_getData', 'vault_setData', 'vault_getSharedData'],
        fields: [{ path: '/own/seen', read: true, write: true }],
        foreign: [{ origin: owner, paths }],
      },
    ],
  });
  return { event, session };
}

describe('a granted cross-partition read returns the owner’s value', () => {
  test('the named pointer comes back, with the value the owner published', async () => {
    await ownerPublishes('ada');
    const { event, session } = await readerConnects();

    const res = await call(event, 'vault_getSharedData', {
      sessionId: session.sessionId,
      origin: OWNER_ORIGIN,
      paths: ['/shared/displayName'],
    });

    expect(res.values).toEqual({ '/shared/displayName': 'ada' });
    // No etag: a version over another partition moves when the owner writes,
    // which is a write-activity oracle even when every value reads null.
    expect(Object.keys(res)).toEqual(['values']);
  });

  test('the two sites really are two partitions', async () => {
    await ownerPublishes('ada');
    const { session } = await readerConnects();

    expect(session.namespace).toBe(READER_NS);
    expect(perms.getPermission(OWNER_NS)).toBeTruthy();
    expect(perms.getPermission(READER_NS).foreignReads).toEqual([
      { namespace: OWNER_NS, origin: OWNER_ORIGIN, paths: ['/shared/displayName'] },
    ]);
  });

  test('a wholesale grant keeps up with what the owner publishes later', async () => {
    await ownerPublishes('ada');
    const { event, session } = await readerConnects(['/shared']);

    // Published AFTER the grant was made.
    const owner = frame(OWNER_ORIGIN, 11);
    const ownerSession = await call(owner, 'vault_connect', {
      requestedScopes: [
        { methods: ['vault_getData', 'vault_setData'], fields: [{ path: '/shared', read: true, write: true }] },
      ],
    });
    await call(owner, 'vault_setData', {
      sessionId: ownerSession.sessionId,
      values: { '/shared/bio': 'later' },
    });

    const res = await call(event, 'vault_getSharedData', {
      sessionId: session.sessionId,
      origin: OWNER_ORIGIN,
      paths: ['/shared/displayName', '/shared/bio'],
    });

    expect(res.values).toEqual({ '/shared/displayName': 'ada', '/shared/bio': 'later' });
  });

  test('the owner’s private data does not cross, and does not error', async () => {
    const owner = frame(OWNER_ORIGIN, 11);
    const session = await call(owner, 'vault_connect', {
      requestedScopes: [
        {
          methods: ['vault_getData', 'vault_setData'],
          fields: [
            { path: '/shared', read: true, write: true },
            { path: '/private', read: true, write: true },
          ],
        },
      ],
    });
    await call(owner, 'vault_setData', {
      sessionId: session.sessionId,
      values: { '/shared/displayName': 'ada', '/private/notes': 'not for sharing' },
    });

    const reader = await readerConnects(['/shared/displayName']);
    const res = await call(reader.event, 'vault_getSharedData', {
      sessionId: reader.session.sessionId,
      origin: OWNER_ORIGIN,
      paths: ['/shared/displayName', '/private/notes'],
    });

    // Null rather than a refusal: an error would say the path exists.
    expect(res.values).toEqual({ '/shared/displayName': 'ada', '/private/notes': null });
  });

  test('an owner the user never approved is indistinguishable from one that does not exist', async () => {
    await ownerPublishes('ada');
    const { event, session } = await readerConnects();

    const unapproved = await call(event, 'vault_getSharedData', {
      sessionId: session.sessionId,
      origin: 'http://third.localhost:8799',
      paths: ['/shared/displayName'],
    });
    const nonexistent = await call(event, 'vault_getSharedData', {
      sessionId: session.sessionId,
      origin: 'https://nothing-here.invalid',
      paths: ['/shared/displayName'],
    });

    expect(unapproved).toEqual(nonexistent);
    expect(unapproved.values).toEqual({ '/shared/displayName': null });
  });

  test('switching the read off in the Data pane stops it, and on restores it', async () => {
    await ownerPublishes('ada');
    const { session } = await readerConnects();
    const read = async (sessionId) =>
      (
        await call(frame(READER_ORIGIN, 22), 'vault_getSharedData', {
          sessionId,
          origin: OWNER_ORIGIN,
          paths: ['/shared/displayName'],
        })
      ).values['/shared/displayName'];

    expect(await read(session.sessionId)).toBe('ada');

    // The Data pane's checkbox. It tears the session down, so the page has to
    // reconnect — which it does without a prompt, the grant being remembered.
    manager.setForeignReadEnabled(READER_NS, OWNER_NS, false);
    const off = await readerConnects();
    expect(prompted).toHaveLength(2); // owner + reader, and no re-prompt since
    expect(await read(off.session.sessionId)).toBe(null);

    manager.setForeignReadEnabled(READER_NS, OWNER_NS, true);
    const on = await readerConnects();
    expect(prompted).toHaveLength(2);
    expect(await read(on.session.sessionId)).toBe('ada');
  });

  test('deleting the owner’s partition makes the reader ask again', async () => {
    await ownerPublishes('ada');
    const { event, session } = await readerConnects();
    expect(prompted).toHaveLength(2);

    await manager.deletePartition(OWNER_NS);

    // The reader's sessions end with the sweep, so its live one is refused —
    // it does not get to spend an approval to a partition that is gone.
    await expect(
      call(event, 'vault_getSharedData', {
        sessionId: session.sessionId,
        origin: OWNER_ORIGIN,
        paths: ['/shared/displayName'],
      }),
    ).rejects.toThrow(/session/i);

    // And the grant itself was swept, so reconnecting PROMPTS rather than
    // silently appearing to still hold it. Its own data is untouched: the
    // user deleted someone else's partition, not this site's.
    const again = await readerConnects();
    expect(prompted).toHaveLength(3);
    expect(perms.getPermission(READER_NS).fields).toEqual([
      { path: '/own/seen', read: true, write: true },
    ]);

    const res = await call(again.event, 'vault_getSharedData', {
      sessionId: again.session.sessionId,
      origin: OWNER_ORIGIN,
      paths: ['/shared/displayName'],
    });
    expect(res.values).toEqual({ '/shared/displayName': null });
  });
});

describe('the publish gate', () => {
  test('a whole-document grant cannot write under /shared', async () => {
    const event = frame(OWNER_ORIGIN, 11);
    const session = await call(event, 'vault_connect', {
      requestedScopes: [
        { methods: ['vault_getData', 'vault_setData'], fields: [{ path: '', read: true, write: true }] },
      ],
    });

    // The empty pointer covers every path, `/shared` included — so without an
    // explicit gate a site could publish without the word ever reaching its
    // consent sheet, and "location is the mark" would not be true.
    await expect(
      call(event, 'vault_setData', {
        sessionId: session.sessionId,
        values: { '/shared/sneaky': 1 },
      }),
    ).rejects.toThrow();

    // The same grant still writes everywhere else.
    await expect(
      call(event, 'vault_setData', {
        sessionId: session.sessionId,
        values: { '/elsewhere/fine': 1 },
      }),
    ).resolves.toBeTruthy();
  });
});
