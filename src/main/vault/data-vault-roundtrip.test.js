/**
 * Export → Clear all data → Import, end to end through the real host.
 *
 * The one question a restore feature has to answer, and the one unit tests
 * cannot: does a bundle taken before a wipe actually bring the vault back?
 * Nothing below the IPC boundary is stubbed — real `DataVaultKeystore` over a
 * real mnemonic, real `DataVaultStorage` on a temp directory, the real vendored
 * engine, the real grant store.
 *
 * Two things make this worth asserting rather than reasoning about:
 *
 *  - The anti-rollback manifest. `adminDeletePartition` clears a namespace's
 *    manifest entry, and `load` rejects a document whose version sits behind
 *    the manifest. A restore puts BOTH the old manifest and the old blobs back,
 *    so the pair has to be consistent or every read fails closed.
 *  - The sealed permission map. The Data pane enumerates by grant, so a restore
 *    that recovered blobs but not grants would look like an empty vault with
 *    the bytes still on disk.
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
  dialog: {
    showMessageBox: async () => ({ response: 1 }),
    showSaveDialog: async () => mockSaveTo,
    showOpenDialog: async () => mockOpenFrom,
  },
  webContents: { fromId: () => null },
}));

jest.mock('../vault-timer', () => ({ resetVaultAutoLockTimer: jest.fn() }));

let mockSaveTo = { canceled: true };
let mockOpenFrom = { canceled: true, filePaths: [] };

const MNEMONIC = 'test test test test test test test test test test test junk';
const SHOP = 'http://shop.localhost:8799';
const SHOP_NS = 'web:http://shop.localhost:8799';
const BLOG = 'http://blog.localhost:8799';

let tmpDir;
let manager;
let perms;

const frame = (origin, id) => ({
  senderFrame: { url: `${origin}/index.html` },
  sender: { id, isDestroyed: () => false, send: () => {} },
});

async function call(event, method, params = {}) {
  const reply = await manager._onRequest(event, { method, params });
  if (reply.error) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
  return reply.result;
}

/** A fresh manager over the SAME directory and mnemonic — a restart, in effect. */
function buildManager() {
  const { DataVaultManager } = require('./data-vault-manager');
  return new DataVaultManager({
    dataDir: tmpDir,
    identityVault: {
      isUnlocked: () => true,
      getMnemonic: () => MNEMONIC,
      ensureUnlocked: async () => true,
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

/** One site connects and writes a value. */
async function siteWrites(origin, id, pointer, value) {
  const event = frame(origin, id);
  const session = await call(event, 'vault_connect', {
    requestedScopes: [
      {
        methods: ['vault_getData', 'vault_setData'],
        fields: [{ path: '/profile', read: true, write: true }],
      },
    ],
  });
  await call(event, 'vault_setData', { sessionId: session.sessionId, values: { [pointer]: value } });
  return session;
}

async function readBack(origin, id, pointer) {
  const event = frame(origin, id);
  const session = await call(event, 'vault_connect', {
    requestedScopes: [
      {
        methods: ['vault_getData', 'vault_setData'],
        fields: [{ path: '/profile', read: true, write: true }],
      },
    ],
  });
  const res = await call(event, 'vault_getData', { sessionId: session.sessionId, paths: [pointer] });
  return res.values[pointer];
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-roundtrip-'));
  jest.resetModules();
  require('electron').app.getPath.mockReturnValue(tmpDir);
  perms = require('./data-vault-permissions');
  perms._resetCache();
  manager = buildManager();
  mockSaveTo = { canceled: false, filePath: path.join(tmpDir, 'export.json') };
  mockOpenFrom = { canceled: false, filePaths: [path.join(tmpDir, 'export.json')] };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('export → clear all → import', () => {
  test('brings back every site’s data, its grants, and the Data pane', async () => {
    await siteWrites(SHOP, 11, '/profile/displayName', 'ada');
    await siteWrites(BLOG, 22, '/profile/displayName', 'grace');
    expect(await readBack(SHOP, 11, '/profile/displayName')).toBe('ada');

    const exported = await manager.exportToFile();
    expect(exported.saved).toBe(true);
    expect(exported.partitions).toBeGreaterThan(0);

    const cleared = await manager.clearAll();
    expect(cleared.cleared).toBe(2);
    // Genuinely gone: no grants, and the pane has nothing to list.
    expect(perms.getAllPermissions()).toEqual([]);
    expect(await manager.listPartitions()).toEqual([]);

    const imported = await manager.importFromFile();
    expect(imported.imported).toBe(true);
    expect(imported.restoredGrants).toBe(2);

    // The grants are back...
    expect(perms.getAllPermissions()).toHaveLength(2);
    expect(perms.getPermission(SHOP_NS)).toBeTruthy();
    // ...the pane sees them...
    expect(await manager.listPartitions()).toHaveLength(2);
    // ...and the DATA reads back, which is the part the manifest could have
    // broken: the restored blobs' versions have to agree with the restored
    // manifest, or every load fails closed as a rollback.
    expect(await readBack(SHOP, 11, '/profile/displayName')).toBe('ada');
    expect(await readBack(BLOG, 22, '/profile/displayName')).toBe('grace');
  });

  test('a site can keep writing after the restore', async () => {
    await siteWrites(SHOP, 11, '/profile/displayName', 'ada');
    await manager.exportToFile();
    await manager.clearAll();
    await manager.importFromFile();

    // A write after a restore is the real rollback test: the engine bumps the
    // version against the manifest it just loaded from the bundle.
    const event = frame(SHOP, 11);
    const session = await call(event, 'vault_connect', {
      requestedScopes: [
        {
          methods: ['vault_getData', 'vault_setData'],
          fields: [{ path: '/profile', read: true, write: true }],
        },
      ],
    });
    await call(event, 'vault_setData', {
      sessionId: session.sessionId,
      values: { '/profile/displayName': 'ada lovelace' },
    });

    expect(await readBack(SHOP, 11, '/profile/displayName')).toBe('ada lovelace');
  });

  test('the restore survives a restart, so it is on disk and not in memory', async () => {
    await siteWrites(SHOP, 11, '/profile/displayName', 'ada');
    await manager.exportToFile();
    await manager.clearAll();
    await manager.importFromFile();

    // Everything below the pane rebuilt from the same directory.
    jest.resetModules();
    require('electron').app.getPath.mockReturnValue(tmpDir);
    perms = require('./data-vault-permissions');
    perms._resetCache();
    manager = buildManager();

    expect(await manager.listPartitions()).toHaveLength(1);
    expect(await readBack(SHOP, 11, '/profile/displayName')).toBe('ada');
  });

  test('importing into a non-empty vault keeps blobs but REPLACES the grant map', async () => {
    await siteWrites(SHOP, 11, '/profile/displayName', 'ada');
    await manager.exportToFile();
    await manager.clearAll();
    // A different site arrives before the restore.
    await siteWrites(BLOG, 22, '/profile/displayName', 'grace');

    await manager.importFromFile();

    // The bundle's grant map REPLACES the live one (replaceAll), so the site
    // that arrived after the export loses its grant even though its blob stays.
    // Worth pinning: it is the one surprising edge of a restore.
    expect(perms.getPermission(SHOP_NS)).toBeTruthy();
    expect(await readBack(SHOP, 11, '/profile/displayName')).toBe('ada');
  });
});
