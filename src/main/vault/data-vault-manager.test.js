/**
 * The data vault's main-process host glue.
 *
 * The engine owns the cryptography and the grant arithmetic; what lives here is
 * the boundary — which frame a session belongs to, which origin is authoritative,
 * and whether a remembered grant covers what is being asked for now. So these
 * tests are mostly about refusals.
 */

const ipcHandlers = {};
jest.mock('electron', () => ({
  app: { getPath: () => '/tmp/vault-manager-test' },
  safeStorage: { isEncryptionAvailable: () => false },
  ipcMain: {
    handle: (channel, handler) => {
      ipcHandlers[channel] = handler;
    },
    on: () => {},
    removeHandler: () => {},
  },
  nativeImage: { createFromBuffer: () => null },
}));

jest.mock('../vault-timer', () => ({ resetVaultAutoLockTimer: jest.fn() }));

const { covers, DataVaultManager } = require('./data-vault-manager');
const perms = require('./data-vault-permissions');

const OWNER_NS = 'web:owner.example';
const READER_NS = 'web:reader.example';

const foreignRead = (paths = ['/public']) => ({
  namespace: OWNER_NS,
  origin: 'https://owner.example',
  paths,
});

function remembered(extra = {}) {
  return {
    namespace: READER_NS,
    origin: 'https://reader.example',
    methods: ['vault_getData', 'vault_getPublicData'],
    fields: [{ path: '/own', read: true, write: true }],
    foreignReads: [],
    writePolicy: 'ask-once-per-session',
    ...extra,
  };
}

describe('covers() — when a remembered grant spares the user a prompt', () => {
  const methods = ['vault_getData'];
  const fields = [{ path: '/own' }];

  test('still answers as before when no cross-origin read is requested', () => {
    // Three-argument callers must keep the verdict they had before this existed.
    expect(covers(remembered(), methods, fields)).toBe(true);
    expect(covers(remembered(), ['vault_setData'], fields)).toBe(false);
    expect(covers(remembered(), methods, [{ path: '/other' }])).toBe(false);
  });

  test('refuses when an owner was never granted', () => {
    expect(covers(remembered(), methods, fields, [foreignRead()])).toBe(false);
  });

  test('accepts the same owner and paths', () => {
    expect(covers(remembered({ foreignReads: [foreignRead()] }), methods, fields, [foreignRead()])).toBe(true);
  });

  test('a remembered whole subtree covers a newly named leaf', () => {
    expect(
      covers(remembered({ foreignReads: [foreignRead(['/public'])] }), methods, fields, [
        foreignRead(['/public/profile/displayName']),
      ]),
    ).toBe(true);
  });

  test('a remembered leaf does NOT cover the whole subtree', () => {
    // Otherwise a site that was allowed one field could quietly widen to the
    // owner's entire published area without a second prompt.
    expect(
      covers(remembered({ foreignReads: [foreignRead(['/public/profile/displayName'])] }), methods, fields, [
        foreignRead(['/public']),
      ]),
    ).toBe(false);
  });

  test('matches on pointer tokens, not string prefixes', () => {
    expect(
      covers(remembered({ foreignReads: [foreignRead(['/public/a'])] }), methods, fields, [
        foreignRead(['/public/ab']),
      ]),
    ).toBe(false);
  });

  test('refuses when the paths match but the owner does not', () => {
    const elsewhere = { namespace: 'web:elsewhere.example', origin: 'https://elsewhere.example', paths: ['/public'] };
    expect(covers(remembered({ foreignReads: [elsewhere] }), methods, fields, [foreignRead()])).toBe(false);
  });

  test('treats a legacy record with no foreignReads as none granted', () => {
    const legacy = remembered();
    delete legacy.foreignReads;
    expect(covers(legacy, methods, fields, [])).toBe(true);
    expect(covers(legacy, methods, fields, [foreignRead()])).toBe(false);
  });
});

describe('vault_getPublicData routing', () => {
  let manager;
  let engine;

  beforeEach(() => {
    jest.spyOn(perms, 'getPermission').mockReturnValue(null);
    jest.spyOn(perms, 'updateLastUsed').mockImplementation(() => {});
    manager = new DataVaultManager({
      dataDir: '/tmp/vault-manager-test',
      identityVault: { isUnlocked: () => true, getMnemonic: () => 'x', ensureUnlocked: async () => true },
      promptConsent: async () => ({ approved: true }),
      onPartitionChanged: jest.fn(),
    });
    engine = { localGetPublic: jest.fn().mockResolvedValue({ values: {} }) };
    manager._engine = engine;
  });

  afterEach(() => jest.restoreAllMocks());

  /** A request as it arrives from a webview frame. */
  const event = (webContentsId, url) => ({
    sender: { id: webContentsId, getURL: () => url },
    senderFrame: { url },
  });

  function bindSession(sessionId, { origin, namespace, webContentsId }) {
    manager._sessions.set(sessionId, { origin, namespace, webContentsId });
  }

  test('forwards the owner origin verbatim', async () => {
    bindSession('s1', { origin: 'https://reader.example', namespace: READER_NS, webContentsId: 7 });

    await manager._onRequest(event(7, 'https://reader.example/app'), {
      method: 'vault_getPublicData',
      params: { sessionId: 's1', origin: 'https://owner.example', paths: ['/public/x'] },
    });

    // Not normalised on the way through: `originForNamespace` strips a path
    // where the engine's `deriveOriginNamespace` refuses one, so normalising
    // here would launder an origin the engine would have rejected.
    expect(engine.localGetPublic).toHaveBeenCalledWith('s1', 'https://owner.example', ['/public/x']);
  });

  test('refuses a session belonging to another tab, without reaching the engine', async () => {
    bindSession('s1', { origin: 'https://reader.example', namespace: READER_NS, webContentsId: 7 });

    const res = await manager._onRequest(event(99, 'https://reader.example/app'), {
      method: 'vault_getPublicData',
      params: { sessionId: 's1', origin: 'https://owner.example', paths: ['/public/x'] },
    });

    expect(res.error.code).toBe(4900);
    // The engine must not be consulted at all: this is the host's boundary, and
    // a call that got through would have decrypted an owner's partition.
    expect(engine.localGetPublic).not.toHaveBeenCalled();
  });

  test('refuses a session whose origin no longer matches the frame', async () => {
    bindSession('s1', { origin: 'https://reader.example', namespace: READER_NS, webContentsId: 7 });

    const res = await manager._onRequest(event(7, 'https://evil.example/app'), {
      method: 'vault_getPublicData',
      params: { sessionId: 's1', origin: 'https://owner.example', paths: ['/public/x'] },
    });

    expect(res.error.code).toBe(4900);
    expect(engine.localGetPublic).not.toHaveBeenCalled();
  });

  test('refuses an unknown session id', async () => {
    const res = await manager._onRequest(event(7, 'https://reader.example/app'), {
      method: 'vault_getPublicData',
      params: { sessionId: 'nope', origin: 'https://owner.example', paths: [] },
    });

    expect(res.error.code).toBe(4900);
    expect(engine.localGetPublic).not.toHaveBeenCalled();
  });

  test('does not report a partition change — it is a read', async () => {
    bindSession('s1', { origin: 'https://reader.example', namespace: READER_NS, webContentsId: 7 });

    await manager._onRequest(event(7, 'https://reader.example/app'), {
      method: 'vault_getPublicData',
      params: { sessionId: 's1', origin: 'https://owner.example', paths: ['/public/x'] },
    });

    expect(manager._onPartitionChanged).not.toHaveBeenCalled();
  });

  test('defaults a missing path list rather than passing undefined', async () => {
    bindSession('s1', { origin: 'https://reader.example', namespace: READER_NS, webContentsId: 7 });

    await manager._onRequest(event(7, 'https://reader.example/app'), {
      method: 'vault_getPublicData',
      params: { sessionId: 's1', origin: 'https://owner.example' },
    });

    expect(engine.localGetPublic).toHaveBeenCalledWith('s1', 'https://owner.example', []);
  });
});

describe('the cross-origin method is not granted by default', () => {
  test('is absent from the always-granted set', () => {
    // That set exists for a method telling a caller only about itself. Adding
    // this one would hand every site that ever connected the ability to read
    // other sites, with no prompt and no record of intent.
    const source = require('fs').readFileSync(require.resolve('./data-vault-manager.js'), 'utf8');
    const always = /const ALWAYS_GRANTED_METHODS = \[([^\]]*)\]/.exec(source);
    expect(always).not.toBeNull();
    expect(always[1]).not.toMatch(/getPublicData/);
  });
});

describe('_decideConsent', () => {
  let manager;
  let prompted;

  beforeEach(() => {
    prompted = [];
    jest.spyOn(perms, 'grantPermission').mockImplementation(() => {});
    jest.spyOn(perms, 'updateLastUsed').mockImplementation(() => {});
    manager = new DataVaultManager({
      dataDir: '/tmp/vault-manager-test',
      identityVault: { isUnlocked: () => true, getMnemonic: () => 'x', ensureUnlocked: async () => true },
      promptConsent: async (req) => {
        prompted.push(req);
        return { approved: true, grantedForeignReads: req.foreignReads };
      },
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const request = (foreignReads) => ({
    verification: { namespace: READER_NS, domain: 'https://reader.example' },
    appMetadata: {},
    requestedScopes: [
      {
        methods: ['vault_getData', 'vault_getPublicData'],
        fields: [{ path: '/own', read: true, write: true }],
        // The page's raw text, deliberately DIFFERENT from the resolved list,
        // so a test can tell which one the sheet was shown.
        foreign: [{ origin: 'https://attacker.example', paths: ['/public'] }],
      },
    ],
    foreignReads,
  });

  test('shows the sheet the engine-resolved reads, never the page text', async () => {
    jest.spyOn(perms, 'getPermission').mockReturnValue(null);

    await manager._decideConsent(request([foreignRead()]));

    expect(prompted).toHaveLength(1);
    expect(prompted[0].foreignReads.map((e) => e.origin)).toEqual(['https://owner.example']);
  });

  test('shows the sheet what a grant is made of, and nothing else', async () => {
    jest.spyOn(perms, 'getPermission').mockImplementation((ns) => (ns === OWNER_NS ? remembered() : null));

    await manager._decideConsent(request([foreignRead(['/public/displayName'])]));

    // It used to carry `wholesale` and `known` as hints for a sheet that read
    // them; `known` especially — whether the user holds data for ANOTHER site —
    // has no business crossing to the renderer with no reader.
    expect(prompted[0].foreignReads).toEqual([
      { namespace: OWNER_NS, origin: 'https://owner.example', paths: ['/public/displayName'] },
    ]);
  });

  test('persists and returns what the sheet approved', async () => {
    jest.spyOn(perms, 'getPermission').mockReturnValue(null);

    const decision = await manager._decideConsent(request([foreignRead()]));

    expect(decision.grantedForeignReads).toEqual([expect.objectContaining({ namespace: OWNER_NS })]);
    expect(perms.grantPermission).toHaveBeenCalledWith(
      READER_NS,
      expect.objectContaining({ foreignReads: expect.arrayContaining([expect.objectContaining({ namespace: OWNER_NS })]) }),
      expect.any(Number),
    );
  });

  test('grants none when the sheet returns none, rather than everything asked', async () => {
    jest.spyOn(perms, 'getPermission').mockReturnValue(null);
    manager._promptConsent = async () => ({ approved: true }); // no grantedForeignReads

    const decision = await manager._decideConsent(request([foreignRead()]));

    expect(decision.grantedForeignReads).toEqual([]);
    expect(perms.grantPermission).toHaveBeenCalledWith(
      READER_NS,
      expect.objectContaining({ foreignReads: [] }),
      expect.any(Number),
    );
  });

  test('re-prompts when a remembered grant lacks the requested owner', async () => {
    jest.spyOn(perms, 'getPermission').mockReturnValue(remembered({ foreignReads: [] }));

    await manager._decideConsent(request([foreignRead()]));

    expect(prompted).toHaveLength(1);
  });

  test('does not prompt when a remembered grant already covers the owner', async () => {
    jest.spyOn(perms, 'getPermission').mockReturnValue(remembered({ foreignReads: [foreignRead()] }));

    const decision = await manager._decideConsent(request([foreignRead()]));

    expect(prompted).toHaveLength(0);
    expect(decision.grantedForeignReads).toEqual([foreignRead()]);
  });

  test('a read the user turned off is withheld from the engine, silently', async () => {
    const off = { ...foreignRead(), enabled: false };
    jest.spyOn(perms, 'getPermission').mockReturnValue(remembered({ foreignReads: [off] }));

    const decision = await manager._decideConsent(request([foreignRead()]));

    // Still remembered, so the site is not re-prompted for something the user
    // has deliberately switched off — and not handed over either, or switching
    // it off on the detail page would do nothing.
    expect(prompted).toHaveLength(0);
    expect(decision.grantedForeignReads).toEqual([]);
  });

  test('turning it back on hands it over again', async () => {
    const on = { ...foreignRead(), enabled: true };
    jest.spyOn(perms, 'getPermission').mockReturnValue(remembered({ foreignReads: [on] }));

    const decision = await manager._decideConsent(request([foreignRead()]));

    expect(decision.grantedForeignReads).toEqual([on]);
  });
});

describe('listPartitions', () => {
  let manager;

  beforeEach(() => {
    manager = new DataVaultManager({
      dataDir: '/tmp/vault-manager-test',
      identityVault: { isUnlocked: () => true, getMnemonic: () => 'x', ensureUnlocked: async () => true },
      promptConsent: async () => ({ approved: false }),
    });
    manager._keystore = { isUnlocked: () => true };
    manager._storage = { byteSize: async () => 7 };
  });

  afterEach(() => jest.restoreAllMocks());

  test('carries the same thumbnail pair the launcher tiles use', async () => {
    jest.spyOn(perms, 'getAllPermissions').mockReturnValue([
      {
        namespace: 'web:a.example',
        origin: 'https://a.example',
        appMetadata: { name: 'Alpha' },
        icon: { dataUri: 'data:image/png;base64,AAA' },
      },
      { namespace: 'web:b.example', origin: 'https://b.example', icon: null },
    ]);

    const out = await manager.listPartitions();

    // The pinned data URI, not the icon record: handing the record to an <img>
    // src renders "[object Object]" and shows nothing.
    expect(out.map((p) => p.icon)).toEqual(['data:image/png;base64,AAA', null]);
    // And a monogram for every row, so a site with no icon still has art.
    expect(out.map((p) => p.monogram.letter)).toEqual(['A', 'B']);
    expect(out.every((p) => Number.isInteger(p.monogram.hue))).toBe(true);
  });
});

describe('foreignGrantsFor', () => {
  let manager;

  beforeEach(() => {
    manager = new DataVaultManager({
      dataDir: '/tmp/vault-manager-test',
      identityVault: { isUnlocked: () => true, getMnemonic: () => 'x', ensureUnlocked: async () => true },
      promptConsent: async () => ({ approved: false }),
    });
    manager._keystore = { isUnlocked: () => true };
  });

  afterEach(() => jest.restoreAllMocks());

  test('tells the detail view which held reads are on', () => {
    const off = { ...foreignRead(), enabled: false };
    const legacy = { namespace: 'web:other.example', origin: 'https://other.example', paths: ['/public'] };
    jest.spyOn(perms, 'getPermission').mockReturnValue(remembered({ foreignReads: [off, legacy] }));
    jest.spyOn(perms, 'getAllPermissions').mockReturnValue([]);

    const { reads } = manager.foreignGrantsFor(READER_NS);

    // An entry with no flag is on: that is every grant the sheet writes.
    expect(reads.map((e) => e.enabled)).toEqual([false, true]);
    // Off is not gone — the paths the user approved are still there to restore.
    expect(reads[0].paths).toEqual(['/public']);
  });

  test('tells the OWNER end the same thing, from the reader records', () => {
    const off = { ...foreignRead(), enabled: false };
    jest.spyOn(perms, 'getPermission').mockReturnValue(null);
    jest.spyOn(perms, 'getAllPermissions').mockReturnValue([
      { namespace: READER_NS, origin: 'https://reader.example', foreignReads: [off] },
      {
        namespace: 'web:second.example',
        origin: 'https://second.example',
        foreignReads: [foreignRead()],
      },
    ]);

    const { readers } = manager.foreignGrantsFor(OWNER_NS);

    // One grant, one state: a read the reader switched off must not show on the
    // owner's page as a site that reads them.
    expect(readers.map((e) => [e.readerNamespace, e.enabled])).toEqual([
      [READER_NS, false],
      ['web:second.example', true],
    ]);
  });
});

describe('setForeignReadEnabled', () => {
  let manager;

  beforeEach(() => {
    manager = new DataVaultManager({
      dataDir: '/tmp/vault-manager-test',
      identityVault: { isUnlocked: () => true, getMnemonic: () => 'x', ensureUnlocked: async () => true },
      promptConsent: async () => ({ approved: false }),
    });
    jest.spyOn(manager, '_teardownNamespace').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  test('ends the reader\'s live sessions when the flag actually changed', () => {
    jest.spyOn(perms, 'setForeignReadEnabled').mockReturnValue(true);

    const r = manager.setForeignReadEnabled(READER_NS, OWNER_NS, false);

    // A session already holds its resolved reads, so it has to be rebuilt for
    // either direction of the change to take effect.
    expect(r).toEqual({ changed: true, readerNamespace: READER_NS, ownerNamespace: OWNER_NS, enabled: false });
    expect(manager._teardownNamespace).toHaveBeenCalledWith(READER_NS);
  });

  test('leaves sessions alone when nothing changed', () => {
    jest.spyOn(perms, 'setForeignReadEnabled').mockReturnValue(false);

    expect(manager.setForeignReadEnabled(READER_NS, OWNER_NS, true).changed).toBe(false);
    expect(manager._teardownNamespace).not.toHaveBeenCalled();
  });

  test('refuses a half-named pair without touching the store', () => {
    jest.spyOn(perms, 'setForeignReadEnabled').mockReturnValue(true);

    expect(manager.setForeignReadEnabled('', OWNER_NS, false)).toEqual({ changed: false });
    expect(manager.setForeignReadEnabled(READER_NS, null, false)).toEqual({ changed: false });
    expect(perms.setForeignReadEnabled).not.toHaveBeenCalled();
  });

  test('is NOT revocation: it never drops the entry', () => {
    jest.spyOn(perms, 'removeForeignRead').mockReturnValue(true);
    jest.spyOn(perms, 'setForeignReadEnabled').mockReturnValue(true);

    manager.setForeignReadEnabled(READER_NS, OWNER_NS, false);

    expect(perms.removeForeignRead).not.toHaveBeenCalled();
  });
});
