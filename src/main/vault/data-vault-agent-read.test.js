/**
 * Freedom Agent's published-data reads, end to end through the real host.
 *
 * Same shape as the cross-partition suite beside this one, and for the same
 * reason: the claims worth testing are the ones a wiring mistake would hide.
 * Almost everything here answers `null` by design — an owner the user never
 * approved, a path outside `/shared`, a grant switched off, a site never
 * visited — so a read that is silently reaching nothing looks exactly like the
 * refusals working. These tests pin both halves: the value really does come
 * back when it should, and the shape of a refusal really is indistinguishable
 * from having no data at all.
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
const OTHER_ORIGIN = 'http://other.localhost:8799';

let tmpDir;
let manager;
let perms;
/** Calls the vault made asking for an unlock, which an Agent read must not do. */
let ensureUnlocked;

const frame = (origin, webContentsId) => ({
  senderFrame: { url: `${origin}/index.html` },
  sender: { id: webContentsId, isDestroyed: () => false, send: () => {} },
});

async function call(event, method, params = {}) {
  const reply = await manager._onRequest(event, { method, params });
  if (reply.error) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
  return reply.result;
}

function build({ unlocked = true, agentEnabled = true } = {}) {
  const { DataVaultManager } = require('./data-vault-manager');
  ensureUnlocked = jest.fn(async () => unlocked);
  return new DataVaultManager({
    dataDir: tmpDir,
    isAgentEnabled: () => agentEnabled,
    identityVault: {
      isUnlocked: () => unlocked,
      getMnemonic: () => 'test test test test test test test test test test test junk',
      ensureUnlocked,
    },
    promptConsent: async (req) => ({
      approved: true,
      grantedMethods: (req.requestedScopes || []).flatMap((s) => s.methods || []),
      grantedFields: (req.requestedScopes || []).flatMap((s) => s.fields || []),
      grantedForeignReads: [],
      writePolicy: 'ask-once-per-session',
    }),
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-agent-read-'));
  jest.resetModules();
  require('electron').app.getPath.mockReturnValue(tmpDir);
  perms = require('./data-vault-permissions');
  perms._resetCache();
  manager = build();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

/** The owner connects and writes `values`, publishing whatever is under /shared. */
async function ownerWrites(values) {
  const event = frame(OWNER_ORIGIN, 11);
  const session = await call(event, 'vault_connect', {
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
  await call(event, 'vault_setData', { sessionId: session.sessionId, values });
}

/** The user approves the Agent for `paths` of the owner. */
function userApprovesAgent(paths = ['/shared'], ns = OWNER_NS, origin = OWNER_ORIGIN) {
  return perms.grantAgentRead(ns, origin, paths, Date.now());
}

describe('an approved Agent read returns what the site published', () => {
  test('the named pointer comes back with the published value', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userApprovesAgent(['/shared']);

    const res = await manager.agentGetShared(OWNER_ORIGIN, ['/shared/displayName']);

    expect(res).toEqual({ locked: false, values: { '/shared/displayName': 'ada' } });
  });

  test('a whole-subtree grant covers a leaf named later, as a site’s does', async () => {
    await ownerWrites({ '/shared/profile/city': 'lisbon' });
    userApprovesAgent(['/shared']);

    const res = await manager.agentGetShared(OWNER_ORIGIN, ['/shared/profile/city']);

    expect(res.values['/shared/profile/city']).toBe('lisbon');
  });

  test('a leaf grant does NOT widen to its siblings', async () => {
    await ownerWrites({ '/shared/a': 1, '/shared/b': 2 });
    userApprovesAgent(['/shared/a']);

    const res = await manager.agentGetShared(OWNER_ORIGIN, ['/shared/a', '/shared/b']);

    expect(res.values).toEqual({ '/shared/a': 1, '/shared/b': null });
  });
});

describe('every refusal looks the same as having no data', () => {
  test('no approval at all reads null, though the value is there', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });

    const res = await manager.agentGetShared(OWNER_ORIGIN, ['/shared/displayName']);

    expect(res).toEqual({ locked: false, values: { '/shared/displayName': null } });
  });

  test('a site never visited reads null, not an error', async () => {
    userApprovesAgent(['/shared'], 'web:' + OTHER_ORIGIN, OTHER_ORIGIN);

    const res = await manager.agentGetShared(OTHER_ORIGIN, ['/shared/displayName']);

    expect(res).toEqual({ locked: false, values: { '/shared/displayName': null } });
  });

  test('a path outside /shared reads null even under a whole-partition grant', async () => {
    await ownerWrites({ '/private/secret': 'hunter2', '/shared/ok': 'yes' });
    // The widest thing the user could possibly have approved.
    userApprovesAgent(['/shared', '/private', '/']);

    const res = await manager.agentGetShared(OWNER_ORIGIN, ['/private/secret', '/shared/ok']);

    expect(res.values).toEqual({ '/private/secret': null, '/shared/ok': 'yes' });
  });

  test('turning the grant off reads null, and turning it back on restores it', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userApprovesAgent(['/shared']);

    manager.setForeignReadEnabled(perms.AGENT_NAMESPACE, OWNER_NS, false);
    expect((await manager.agentGetShared(OWNER_ORIGIN, ['/shared/displayName'])).values).toEqual({
      '/shared/displayName': null,
    });

    manager.setForeignReadEnabled(perms.AGENT_NAMESPACE, OWNER_NS, true);
    expect((await manager.agentGetShared(OWNER_ORIGIN, ['/shared/displayName'])).values).toEqual({
      '/shared/displayName': 'ada',
    });
  });
});

describe('a locked vault', () => {
  test('answers locked, with no values and no unlock prompt', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userApprovesAgent(['/shared']);

    jest.resetModules();
    perms._resetCache();
    manager = build({ unlocked: false });

    const res = await manager.agentGetShared(OWNER_ORIGIN, ['/shared/displayName']);

    expect(res).toEqual({ locked: true, values: {} });
    // The Agent may be working while nobody is watching, and a sheet nobody
    // reads is not consent.
    expect(ensureUnlocked).not.toHaveBeenCalled();
  });
});

describe('the request itself is bounded', () => {
  test('refuses more paths than one read may name', async () => {
    userApprovesAgent(['/shared']);
    const many = Array.from({ length: 33 }, (_, i) => `/shared/p${i}`);

    await expect(manager.agentGetShared(OWNER_ORIGIN, many)).rejects.toMatchObject({ code: 4400 });
  });

  test('refuses an origin the engine cannot resolve', async () => {
    await expect(manager.agentGetShared('not-a-url', ['/shared/x'])).rejects.toMatchObject({
      code: 4400,
    });
  });

  test('refuses a malformed pointer rather than treating it as a miss', async () => {
    await expect(
      manager.agentGetShared(OWNER_ORIGIN, ['shared/no-leading-slash'])
    ).rejects.toMatchObject({ code: 4400 });
  });
});

describe('the Agent is a reader, never a site', () => {
  test('it is not a partition in any owner-facing count or list', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userApprovesAgent(['/shared']);

    const partitions = await manager.listPartitions();
    expect(partitions.map((p) => p.namespace)).toEqual([OWNER_NS]);
    expect((await manager.listHomeTiles()).tiles.map((t) => t.namespace)).toEqual([OWNER_NS]);
    expect((await manager.getUsage()).partitionCount).toBe(1);
    expect((await manager.getHomeStatus()).count).toBe(1);
  });

  test('it shows on the owner as a reader row, flagged for the pane to name', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userApprovesAgent(['/shared']);

    const { readers } = manager.foreignGrantsFor(OWNER_NS);

    expect(readers).toEqual([
      {
        readerNamespace: perms.AGENT_NAMESPACE,
        readerOrigin: perms.AGENT_NAMESPACE,
        isAgent: true,
        paths: ['/shared'],
        enabled: true,
      },
    ]);
  });

  test('a site reading the same owner is NOT flagged as the Agent', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userApprovesAgent(['/shared']);
    // A second reader of the same owner, this one an ordinary site.
    perms.grantPermission(
      'web:' + OTHER_ORIGIN,
      {
        origin: OTHER_ORIGIN,
        methods: ['vault_getSharedData'],
        fields: [],
        foreignReads: [{ namespace: OWNER_NS, origin: OWNER_ORIGIN, paths: ['/shared'] }],
      },
      Date.now()
    );

    const { readers } = manager.foreignGrantsFor(OWNER_NS);
    const byNamespace = new Map(readers.map((r) => [r.readerNamespace, r]));

    expect(byNamespace.get(perms.AGENT_NAMESPACE).isAgent).toBe(true);
    expect(byNamespace.get('web:' + OTHER_ORIGIN).isAgent).toBe(false);
  });

  test('listing its sources names only sites the user approved', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userApprovesAgent(['/shared/displayName']);

    expect(manager.agentSharedSources()).toEqual({
      locked: false,
      sources: [{ origin: OWNER_ORIGIN, paths: ['/shared/displayName'] }],
    });
  });

  test('approving a second site keeps the first', async () => {
    userApprovesAgent(['/shared'], OWNER_NS, OWNER_ORIGIN);
    userApprovesAgent(['/shared'], 'web:' + OTHER_ORIGIN, OTHER_ORIGIN);

    expect(
      manager
        .agentSharedSources()
        .sources.map((s) => s.origin)
        .sort()
    ).toEqual([OTHER_ORIGIN, OWNER_ORIGIN].sort());
  });

  test('re-approving unions the paths and switches a disabled entry back on', async () => {
    userApprovesAgent(['/shared/a']);
    manager.setForeignReadEnabled(perms.AGENT_NAMESPACE, OWNER_NS, false);

    userApprovesAgent(['/shared/b']);

    const record = perms.getPermission(perms.AGENT_NAMESPACE);
    expect(record.foreignReads).toEqual([
      {
        namespace: OWNER_NS,
        origin: OWNER_ORIGIN,
        paths: ['/shared/a', '/shared/b'],
        enabled: true,
      },
    ]);
  });
});

describe('deleting data takes the Agent’s reach with it', () => {
  test('deleting the owner’s partition drops the Agent’s grant to it', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userApprovesAgent(['/shared']);

    await manager.deletePartition(OWNER_NS);

    expect(manager.agentSharedSources().sources).toEqual([]);
  });

  test('Clear all data leaves the Agent holding nothing', async () => {
    await ownerWrites({ '/shared/displayName': 'ada' });
    userApprovesAgent(['/shared']);

    await manager.clearAll();

    expect(manager.agentSharedSources().sources).toEqual([]);
    // The record may remain; what must not remain is a grant to anything.
    expect(await manager.listPartitions()).toEqual([]);
  });
});

describe('the owner plane is where the read is switched on', () => {
  test('switching it on grants exactly /shared, and nothing wider', async () => {
    await ownerWrites({ '/shared/ok': 'yes', '/private/secret': 'no' });

    expect(manager.setAgentReadEnabled(OWNER_NS, true)).toMatchObject({
      changed: true,
      enabled: true,
    });

    expect(manager.agentSharedSources().sources).toEqual([
      { origin: OWNER_ORIGIN, paths: ['/shared'] },
    ]);
    const res = await manager.agentGetShared(OWNER_ORIGIN, ['/shared/ok', '/private/secret']);
    expect(res.values).toEqual({ '/shared/ok': 'yes', '/private/secret': null });
  });

  test('switching it off keeps the entry, so it can be switched back on', async () => {
    await ownerWrites({ '/shared/ok': 'yes' });
    manager.setAgentReadEnabled(OWNER_NS, true);

    manager.setAgentReadEnabled(OWNER_NS, false);
    expect((await manager.agentGetShared(OWNER_ORIGIN, ['/shared/ok'])).values).toEqual({
      '/shared/ok': null,
    });
    const held = perms.getPermission(perms.AGENT_NAMESPACE).foreignReads;
    expect(held).toEqual([
      { namespace: OWNER_NS, origin: OWNER_ORIGIN, paths: ['/shared'], enabled: false },
    ]);

    manager.setAgentReadEnabled(OWNER_NS, true);
    expect((await manager.agentGetShared(OWNER_ORIGIN, ['/shared/ok'])).values).toEqual({
      '/shared/ok': 'yes',
    });
  });

  test('a site with no record of its own cannot be granted', () => {
    expect(manager.setAgentReadEnabled('web:never.visited', true)).toEqual({ changed: false });
    expect(manager.agentSharedSources().sources).toEqual([]);
  });

  test('a missing namespace is refused rather than granted to nothing', () => {
    expect(manager.setAgentReadEnabled(undefined, true)).toEqual({ changed: false });
  });
});

describe('the pane is told whether to offer the control', () => {
  test('available when AI is on', async () => {
    await ownerWrites({ '/shared/ok': 'yes' });

    expect(manager.foreignGrantsFor(OWNER_NS).agentAvailable).toBe(true);
  });

  test('not available when AI is off, so the pane asks nothing it cannot answer', async () => {
    await ownerWrites({ '/shared/ok': 'yes' });
    // A second host over the same store: only the flag differs.
    manager = build({ agentEnabled: false });

    expect(manager.foreignGrantsFor(OWNER_NS).agentAvailable).toBe(false);
  });

  test('a host that supplies no reader means no Agent', async () => {
    const { DataVaultManager } = require('./data-vault-manager');
    const bare = new DataVaultManager({
      dataDir: tmpDir,
      identityVault: {
        isUnlocked: () => true,
        getMnemonic: () => 'test test test test test test test test test test test junk',
        ensureUnlocked: async () => true,
      },
      promptConsent: async () => ({ approved: false }),
    });

    expect(bare.foreignGrantsFor(OWNER_NS).agentAvailable).toBe(false);
  });
});

/**
 * The Agent's read offered on the consent sheet, where the user is already
 * deciding what this partition is for. The site cannot ask for it and is never
 * told the answer: it is a second question on the same sheet, which is why the
 * offer is gated on the setting and the answer is re-checked against it here.
 */
describe('the Agent read offered at connect time', () => {
  /** Connect as the owner, answering the sheet with `decision`. */
  async function connectAnswering(decision, { agentEnabled = true } = {}) {
    const seen = [];
    const { DataVaultManager } = require('./data-vault-manager');
    manager = new DataVaultManager({
      dataDir: tmpDir,
      isAgentEnabled: () => agentEnabled,
      identityVault: {
        isUnlocked: () => true,
        getMnemonic: () => 'test test test test test test test test test test test junk',
        ensureUnlocked: async () => true,
      },
      promptConsent: async (req) => {
        seen.push(req);
        return {
          approved: true,
          grantedMethods: ['vault_getData', 'vault_setData'],
          grantedFields: [{ path: '/shared', read: true, write: true }],
          grantedForeignReads: [],
          writePolicy: 'ask-once-per-session',
          ...decision,
        };
      },
    });
    await call(frame(OWNER_ORIGIN, 11), 'vault_connect', {
      requestedScopes: [
        {
          methods: ['vault_getData', 'vault_setData'],
          fields: [{ path: '/shared', read: true, write: true }],
        },
      ],
    });
    return seen[0];
  }

  test('the sheet is told it may offer the read while AI is on', async () => {
    expect((await connectAnswering({})).agentAvailable).toBe(true);
  });

  test('and told not to while AI is off', async () => {
    expect((await connectAnswering({}, { agentEnabled: false })).agentAvailable).toBe(false);
  });

  test('a ticked box grants exactly /shared, the same grant the pane writes', async () => {
    await connectAnswering({ grantAgentRead: true });

    expect(perms.getPermission(perms.AGENT_NAMESPACE).foreignReads).toEqual([
      expect.objectContaining({ namespace: OWNER_NS, origin: OWNER_ORIGIN, paths: ['/shared'] }),
    ]);
  });

  test('the granted read works immediately, without a second visit', async () => {
    await connectAnswering({ grantAgentRead: true });
    const session = await call(frame(OWNER_ORIGIN, 11), 'vault_connect', {
      requestedScopes: [
        {
          methods: ['vault_getData', 'vault_setData'],
          fields: [{ path: '/shared', read: true, write: true }],
        },
      ],
    });
    await call(frame(OWNER_ORIGIN, 11), 'vault_setData', {
      sessionId: session.sessionId,
      values: { '/shared/displayName': 'ada' },
    });

    const res = await manager.agentGetShared(OWNER_ORIGIN, ['/shared/displayName']);

    expect(res.values['/shared/displayName']).toBe('ada');
  });

  test('approving the site without ticking grants nothing', async () => {
    await connectAnswering({});

    expect(perms.getPermission(perms.AGENT_NAMESPACE)).toBeNull();
  });

  test('a renderer claiming it while AI is off still grants nothing', async () => {
    await connectAnswering({ grantAgentRead: true }, { agentEnabled: false });

    expect(perms.getPermission(perms.AGENT_NAMESPACE)).toBeNull();
  });

  test('a rejected connection grants nothing either', async () => {
    const { DataVaultManager } = require('./data-vault-manager');
    manager = new DataVaultManager({
      dataDir: tmpDir,
      isAgentEnabled: () => true,
      identityVault: {
        isUnlocked: () => true,
        getMnemonic: () => 'test test test test test test test test test test test junk',
        ensureUnlocked: async () => true,
      },
      promptConsent: async () => ({ approved: false, grantAgentRead: true }),
    });
    await expect(
      call(frame(OWNER_ORIGIN, 11), 'vault_connect', {
        requestedScopes: [{ methods: ['vault_getData'], fields: [{ path: '/shared', read: true }] }],
      })
    ).rejects.toThrow();

    expect(perms.getPermission(perms.AGENT_NAMESPACE)).toBeNull();
  });
});
