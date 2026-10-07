const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CACHE_SIZES,
  CHUNK_BYTES,
  DEFAULT_CACHE_BYTES,
  LEGACY_CACHE_BYTES,
  MIN_CACHE_BYTES,
  MAX_CACHE_BYTES,
  COUNTING_WINDOW_MS,
  normalizeCacheBytes,
  resolveCacheBytes,
  cacheCapacityChunks,
  chooseCacheBytes,
  formatCacheBytes,
  cacheSizeLabel,
  parseDebugstore,
  isCounting,
  describeCache,
  cacheFileBytes,
  createAntCacheService,
  cacheSettingsView,
  applyCacheSize,
} = require('./ant-cache');

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

// Ant v0.5.60's `/debugstore` (crates/ant-gateway/src/status.rs `debugstore`).
function debugstore({ size = 0, capacity = (2 * GIB) / 4096, total = size, pins = 0 } = {}) {
  return {
    Upload: { TotalUploaded: 0, TotalSynced: 0, PendingUpload: 0 },
    Pinning: { TotalCollections: pins ? 1 : 0, TotalChunks: pins },
    Cache: { Size: size, Capacity: capacity },
    Reserve: { SizeWithinRadius: 0, TotalSize: 0, Capacity: 0, LastBinIDs: null, Epoch: 0 },
    ChunkStore: { TotalChunks: total, SharedSlots: 0, ReferenceCount: total },
  };
}

describe('cache sizes', () => {
  test('are 512 MB, 1, 2, 5, 10 and 16 GB, MiB/GiB-based, inside Ant’s clamp', () => {
    expect(CACHE_SIZES).toEqual([512 * MIB, GIB, 2 * GIB, 5 * GIB, 10 * GIB, 16 * GIB]);
    for (const bytes of CACHE_SIZES) {
      expect(bytes).toBeGreaterThanOrEqual(MIN_CACHE_BYTES);
      expect(bytes).toBeLessThanOrEqual(MAX_CACHE_BYTES);
      expect(bytes % MIB).toBe(0);
      expect(Number.isInteger(bytes / CHUNK_BYTES)).toBe(true);
    }
  });

  test('default is 2 GB, and the legacy size (Ant’s own default) is one of them', () => {
    expect(DEFAULT_CACHE_BYTES).toBe(2 * GIB);
    expect(LEGACY_CACHE_BYTES).toBe(10 * GIB);
    expect(CACHE_SIZES).toContain(DEFAULT_CACHE_BYTES);
    expect(CACHE_SIZES).toContain(LEGACY_CACHE_BYTES);
  });

  test.each([
    [null],
    [undefined],
    [0],
    [3 * GIB],
    [2 * GIB + 1],
    [String(2 * GIB)],
    [-GIB],
    [NaN],
    [Infinity],
    [{}],
  ])('an unknown stored value (%p) resolves to the default', (stored) => {
    expect(normalizeCacheBytes(stored)).toBeNull();
    expect(resolveCacheBytes(stored)).toBe(DEFAULT_CACHE_BYTES);
  });

  test('a known value resolves to itself', () => {
    for (const bytes of CACHE_SIZES) expect(resolveCacheBytes(bytes)).toBe(bytes);
  });

  test('cache-capacity is the chunk count, bee’s × 4096', () => {
    expect(cacheCapacityChunks(512 * MIB)).toBe(131072);
    expect(cacheCapacityChunks(2 * GIB)).toBe(524288);
    expect(cacheCapacityChunks(16 * GIB)).toBe(4194304);
    // Never anything outside the set.
    expect(cacheCapacityChunks('lots')).toBe(524288);
    expect(cacheCapacityChunks(12345)).toBe(524288);
  });

  test('labels', () => {
    expect(CACHE_SIZES.map(cacheSizeLabel)).toEqual([
      '512 MB',
      '1 GB',
      '2 GB (default)',
      '5 GB',
      '10 GB',
      '16 GB',
    ]);
  });
});

describe('chooseCacheBytes (first start after upgrade)', () => {
  test('a saved size is used as is and not saved again', () => {
    expect(chooseCacheBytes({ stored: GIB, hasExistingCache: true })).toEqual({
      bytes: GIB,
      save: false,
    });
  });

  test('a saved unknown value falls back to the default, not to 10 GB', () => {
    expect(chooseCacheBytes({ stored: 3 * GIB, hasExistingCache: true })).toEqual({
      bytes: DEFAULT_CACHE_BYTES,
      save: false,
    });
  });

  test('a profile whose node already has a cache keeps 10 GB, saved', () => {
    expect(chooseCacheBytes({ stored: null, hasExistingCache: true })).toEqual({
      bytes: LEGACY_CACHE_BYTES,
      save: true,
    });
  });

  test('a new profile gets the default, saved so its new cache never reads as an old one', () => {
    expect(chooseCacheBytes({ stored: undefined, hasExistingCache: false })).toEqual({
      bytes: DEFAULT_CACHE_BYTES,
      save: true,
    });
  });
});

describe('formatCacheBytes', () => {
  test.each([
    [0, '0 B'],
    [-5, '0 B'],
    [NaN, '0 B'],
    [512, '512 B'],
    [4096, '4 KB'],
    [120 * MIB, '120 MB'],
    [1.3 * GIB, '1.3 GB'],
    [2 * GIB, '2 GB'],
    [1023.96 * MIB, '1024 MB'],
  ])('%p → %s', (bytes, text) => {
    expect(formatCacheBytes(bytes)).toBe(text);
  });
});

describe('parseDebugstore', () => {
  test('reads Ant’s answer: unpinned size, capacity, pinned from the chunk store', () => {
    expect(
      parseDebugstore(debugstore({ size: 90, capacity: 131072, total: 100, pins: 12 }))
    ).toEqual({
      diskEnabled: true,
      usedBytes: 90 * 4096,
      capacityBytes: 512 * MIB,
      pinnedBytes: 10 * 4096,
      chunks: 100,
    });
  });

  test('Capacity 0 is a node without a disk cache', () => {
    expect(parseDebugstore(debugstore({ capacity: 0 }))).toMatchObject({
      diskEnabled: false,
      capacityBytes: 0,
    });
  });

  test.each([
    ['null', null],
    ['a string', 'not json'],
    ['an array', [1, 2]],
    ['an error body', { code: 404, message: 'Not Found' }],
    ['Cache not an object', { Cache: 7 }],
    ['no Capacity', { Cache: { Size: 3 } }],
    ['a string Capacity', { Cache: { Size: 3, Capacity: '131072' } }],
    ['a negative Capacity', { Cache: { Size: 3, Capacity: -1 } }],
  ])('garbage (%s) is null', (_label, body) => {
    expect(parseDebugstore(body)).toBeNull();
  });

  test('missing or bad counts read as 0, and pinned is never negative', () => {
    expect(parseDebugstore({ Cache: { Capacity: 1024 } })).toEqual({
      diskEnabled: true,
      usedBytes: 0,
      capacityBytes: 1024 * 4096,
      pinnedBytes: 0,
      chunks: 0,
    });
    expect(
      parseDebugstore({ Cache: { Size: -4, Capacity: 1024 }, ChunkStore: { TotalChunks: 'x' } })
    ).toMatchObject({ usedBytes: 0, pinnedBytes: 0 });
    // A chunk store reading below the cache's (counts landing apart).
    expect(
      parseDebugstore({ Cache: { Size: 50, Capacity: 1024 }, ChunkStore: { TotalChunks: 40 } })
    ).toMatchObject({ usedBytes: 50 * 4096, pinnedBytes: 0, chunks: 50 });
  });
});

describe('isCounting', () => {
  const zero = parseDebugstore(debugstore());
  const big = 5 * MIB;

  test('all zero, just after spawn, over a big file: counting', () => {
    expect(isCounting(zero, { sinceSpawnMs: 5_000, fileBytes: big })).toBe(true);
  });

  test('not past the window', () => {
    expect(isCounting(zero, { sinceSpawnMs: COUNTING_WINDOW_MS, fileBytes: big })).toBe(false);
  });

  test('not over a small or missing file (a genuinely empty cache)', () => {
    expect(isCounting(zero, { sinceSpawnMs: 5_000, fileBytes: 64 * 1024 })).toBe(false);
    expect(isCounting(zero, { sinceSpawnMs: 5_000, fileBytes: null })).toBe(false);
  });

  test('not once anything is counted', () => {
    const some = parseDebugstore(debugstore({ size: 1 }));
    expect(isCounting(some, { sinceSpawnMs: 5_000, fileBytes: big })).toBe(false);
    const pinnedOnly = parseDebugstore(debugstore({ size: 0, total: 3 }));
    expect(isCounting(pinnedOnly, { sinceSpawnMs: 5_000, fileBytes: big })).toBe(false);
  });

  test('not with the disk cache off, an unknown spawn time, or garbage', () => {
    const off = parseDebugstore(debugstore({ capacity: 0 }));
    expect(isCounting(off, { sinceSpawnMs: 5_000, fileBytes: big })).toBe(false);
    expect(isCounting(zero, { sinceSpawnMs: NaN, fileBytes: big })).toBe(false);
    expect(isCounting(zero, { sinceSpawnMs: -1, fileBytes: big })).toBe(false);
    expect(isCounting(null, { sinceSpawnMs: 5_000, fileBytes: big })).toBe(false);
  });
});

describe('describeCache (Settings’ cache usage line)', () => {
  test('"1.3 GB of 2 GB · 120 MB pinned", pinned only when there is some', () => {
    const used = Math.round((1.3 * GIB) / 4096);
    const pinned = (120 * MIB) / 4096;
    const parsed = parseDebugstore(debugstore({ size: used, total: used + pinned }));
    expect(describeCache({ nodeStatus: 'running', parsed })).toMatchObject({
      state: 'ok',
      text: '1.3 GB of 2 GB · 120 MB pinned',
      reason: '',
    });
    const unpinned = parseDebugstore(debugstore({ size: used }));
    expect(describeCache({ nodeStatus: 'running', parsed: unpinned }).text).toBe('1.3 GB of 2 GB');
  });

  test('every state without a figure says why', () => {
    for (const [args, state] of [
      [{ nodeStatus: 'stopped' }, 'not-running'],
      [{ nodeStatus: 'error' }, 'not-running'],
      [{ nodeStatus: 'starting' }, 'starting'],
      [{ nodeStatus: 'running', parsed: null }, 'unreadable'],
      [{ nodeStatus: 'running', parsed: parseDebugstore(debugstore({ capacity: 0 })) }, 'disk-off'],
    ]) {
      const row = describeCache(args);
      expect(row.state).toBe(state);
      expect(row.text).toBeTruthy();
      expect(row.reason).toBeTruthy();
    }
  });

  test('counting reads "Counting… (2 GB max)", never "0 B of 2 GB"', () => {
    const row = describeCache({
      nodeStatus: 'running',
      parsed: parseDebugstore(debugstore()),
      counting: true,
    });
    expect(row).toMatchObject({ state: 'counting', text: 'Counting… (2 GB max)' });
    expect(row.text).not.toMatch(/0 B/);
  });
});

describe('createAntCacheService', () => {
  const response = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    body: { cancel: jest.fn(async () => {}) },
  });

  function service({ status = 'running', answer, spawnedAt = null, dataDir = null, now = 0 } = {}) {
    const fetchImpl = jest.fn(async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    });
    return {
      fetchImpl,
      svc: createAntCacheService({
        getNodeStatus: () => ({ status }),
        getApiBase: () => 'http://127.0.0.1:1633/',
        getSpawnedAt: () => spawnedAt,
        getDataDir: () => dataDir,
        fetchImpl,
        now: () => now,
      }),
    };
  }

  test('reads GET /debugstore from the node', async () => {
    const { svc, fetchImpl } = service({ answer: response(200, debugstore({ size: 256 })) });
    await expect(svc.getStatus()).resolves.toMatchObject({ state: 'ok', text: '1 MB of 2 GB' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:1633/debugstore',
      expect.objectContaining({ method: 'GET' })
    );
  });

  test('does not ask a node that is not running', async () => {
    const { svc, fetchImpl } = service({ status: 'stopped' });
    await expect(svc.getStatus()).resolves.toMatchObject({ state: 'not-running' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    ['a 404 (a node without the route)', () => response(404, { code: 404 })],
    ['garbage', () => response(200, '<html>')],
    ['no answer', () => new Error('ECONNREFUSED')],
  ])('%s is unreadable', async (_label, answer) => {
    const { svc } = service({ answer: answer() });
    await expect(svc.getStatus()).resolves.toMatchObject({ state: 'unreadable' });
  });

  test('counting after spawn, from the size of chunks.sqlite and its WAL', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ant-cache-'));
    try {
      fs.writeFileSync(path.join(dir, 'chunks.sqlite'), Buffer.alloc(700 * 1024));
      fs.writeFileSync(path.join(dir, 'chunks.sqlite-wal'), Buffer.alloc(400 * 1024));
      expect(cacheFileBytes(dir)).toBe(1100 * 1024);
      const early = service({
        answer: response(200, debugstore()),
        spawnedAt: 1_000,
        now: 11_000,
        dataDir: dir,
      });
      await expect(early.svc.getStatus()).resolves.toMatchObject({ state: 'counting' });
      const late = service({
        answer: response(200, debugstore()),
        spawnedAt: 1_000,
        now: 1_000 + COUNTING_WINDOW_MS,
        dataDir: dir,
      });
      await expect(late.svc.getStatus()).resolves.toMatchObject({
        state: 'ok',
        text: '0 B of 2 GB',
      });
      // A node Freedom didn't spawn has no spawn time: never "counting".
      const reused = service({ answer: response(200, debugstore()), dataDir: dir, now: 11_000 });
      await expect(reused.svc.getStatus()).resolves.toMatchObject({ state: 'ok' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a node that stopped while the read was out reads as not running', async () => {
    let status = 'running';
    const svc = createAntCacheService({
      getNodeStatus: () => ({ status }),
      getApiBase: () => 'http://127.0.0.1:1633',
      fetchImpl: async () => {
        status = 'stopped';
        throw new Error('ECONNRESET');
      },
    });
    await expect(svc.getStatus()).resolves.toMatchObject({ state: 'not-running' });
  });
});

describe('cacheSettingsView', () => {
  test('offers the sizes with the current one', () => {
    const view = cacheSettingsView({ stored: 5 * GIB, profileMode: 'managed', nodeActive: true });
    expect(view).toMatchObject({ bytes: 5 * GIB, managed: true, reason: '', nodeActive: true });
    expect(view.sizes.map((s) => s.bytes)).toEqual(CACHE_SIZES);
  });

  test('an unknown stored value shows the default', () => {
    expect(cacheSettingsView({ stored: 7 }).bytes).toBe(DEFAULT_CACHE_BYTES);
  });

  // R2-M2 on #588: storedBytes is what settings hold, raw, so the renderer's
  // broadcast compare matches even for a hand-edited size outside the set.
  test('storedBytes carries a stored value outside the set as is', () => {
    expect(cacheSettingsView({ stored: 3 * GIB })).toMatchObject({
      bytes: DEFAULT_CACHE_BYTES,
      storedBytes: 3 * GIB,
    });
    expect(cacheSettingsView({ stored: undefined }).storedBytes).toBeNull();
  });

  test('before the first start it shows the size that start will write', () => {
    expect(cacheSettingsView({ stored: null, hasExistingCache: true })).toMatchObject({
      bytes: LEGACY_CACHE_BYTES,
      storedBytes: null,
    });
    expect(cacheSettingsView({ stored: null, hasExistingCache: false })).toMatchObject({
      bytes: DEFAULT_CACHE_BYTES,
      storedBytes: null,
    });
    // A stored choice wins over the existing cache.
    expect(cacheSettingsView({ stored: 2 * GIB, hasExistingCache: true })).toMatchObject({
      bytes: 2 * GIB,
      storedBytes: 2 * GIB,
    });
  });

  test.each([
    [{ profileMode: 'external' }],
    [{ profileMode: 'disabled' }],
    [{ profileMode: 'managed', registryMode: 'reused' }],
  ])('a node Freedom doesn’t run (%p) is disabled with a reason', (modes) => {
    const view = cacheSettingsView({ stored: null, nodeActive: true, ...modes });
    expect(view.managed).toBe(false);
    expect(view.reason).toBeTruthy();
    expect(view.nodeActive).toBe(false);
  });
});

describe('applyCacheSize', () => {
  const deps = (overrides = {}) => ({
    getView: () => ({ managed: true, reason: '' }),
    save: jest.fn(() => true),
    isNodeActive: () => true,
    restartNode: jest.fn(async () => ({ ok: true })),
    ...overrides,
  });

  test('saves and restarts a running node', async () => {
    const d = deps();
    await expect(applyCacheSize(GIB, d)).resolves.toEqual({ ok: true, restarted: true });
    expect(d.save).toHaveBeenCalledWith(GIB);
    expect(d.restartNode).toHaveBeenCalledTimes(1);
  });

  test('a restart that left the node down (startAnt set ERROR) is not reported as restarted', async () => {
    let active = true;
    const d = deps({
      isNodeActive: () => active,
      restartNode: jest.fn(async () => {
        active = false;
        return { ok: true };
      }),
      getNodeError: () => 'No available ports for Ant API',
    });
    await expect(applyCacheSize(GIB, d)).resolves.toEqual({
      ok: true,
      restarted: false,
      error: 'The Swarm node did not start again (No available ports for Ant API).',
    });
  });

  // R2-M1 on #588: startAnt returns while antd is STARTING, which counts as
  // active; a node that then exits must not be reported as restarted.
  test('waits for the start to settle and requires a running node', async () => {
    let state = 'running';
    const d = deps({
      isNodeActive: () => state === 'running' || state === 'starting',
      isNodeRunning: () => state === 'running',
      restartNode: jest.fn(async () => {
        state = 'starting';
        return { ok: true };
      }),
      waitForNodeSettled: jest.fn(async () => {
        state = 'stopped';
      }),
      getNodeError: () => 'Exited with code 1',
    });
    await expect(applyCacheSize(GIB, d)).resolves.toEqual({
      ok: true,
      restarted: false,
      error: 'The Swarm node did not start again (Exited with code 1).',
    });
    expect(d.waitForNodeSettled).toHaveBeenCalledTimes(1);
  });

  test('a node still starting when the wait gives up is not reported as restarted', async () => {
    let state = 'running';
    const d = deps({
      isNodeActive: () => state === 'running' || state === 'starting',
      isNodeRunning: () => state === 'running',
      restartNode: jest.fn(async () => {
        state = 'starting';
        return { ok: true };
      }),
      waitForNodeSettled: jest.fn(async () => {}),
    });
    await expect(applyCacheSize(GIB, d)).resolves.toMatchObject({ ok: true, restarted: false });
  });

  test('a start that settles healthy is reported as restarted', async () => {
    let state = 'running';
    const d = deps({
      isNodeActive: () => state === 'running' || state === 'starting',
      isNodeRunning: () => state === 'running',
      restartNode: jest.fn(async () => {
        state = 'starting';
        return { ok: true };
      }),
      waitForNodeSettled: jest.fn(async () => {
        state = 'running';
      }),
    });
    await expect(applyCacheSize(GIB, d)).resolves.toEqual({ ok: true, restarted: true });
  });

  test('a stopped node: saved, applies at its next start', async () => {
    const d = deps({ isNodeActive: () => false });
    await expect(applyCacheSize(GIB, d)).resolves.toEqual({ ok: true, restarted: false });
    expect(d.restartNode).not.toHaveBeenCalled();
  });

  test.each([[3 * GIB], ['1073741824'], [null], [-1]])(
    'refuses a size not in the set (%p) without saving',
    async (bytes) => {
      const d = deps();
      await expect(applyCacheSize(bytes, d)).resolves.toMatchObject({ ok: false });
      expect(d.save).not.toHaveBeenCalled();
      expect(d.restartNode).not.toHaveBeenCalled();
    }
  );

  test('refuses on a node Freedom doesn’t run', async () => {
    const d = deps({ getView: () => ({ managed: false, reason: 'not ours' }) });
    await expect(applyCacheSize(GIB, d)).resolves.toEqual({ ok: false, error: 'not ours' });
    expect(d.save).not.toHaveBeenCalled();
  });

  test('a failed save is reported and nothing restarts', async () => {
    const d = deps({ save: jest.fn(() => false) });
    await expect(applyCacheSize(GIB, d)).resolves.toMatchObject({ ok: false });
    expect(d.restartNode).not.toHaveBeenCalled();
  });

  test('a refused restart (mid-purchase) still saved the size and says why', async () => {
    const d = deps({
      restartNode: jest.fn(async () => ({ ok: false, error: 'Wait for the purchase.' })),
    });
    await expect(applyCacheSize(GIB, d)).resolves.toEqual({
      ok: true,
      restarted: false,
      error: 'Wait for the purchase.',
    });
    expect(d.save).toHaveBeenCalledWith(GIB);
  });
});
