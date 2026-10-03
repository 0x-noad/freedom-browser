jest.mock('electron', () => ({ ipcMain: { handle: jest.fn() }, app: { getPath: jest.fn() } }));
jest.mock('../logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createBrowsingCreditService,
  createSpendStore,
  recordSettlements,
  spendWithin,
  formatPlur,
  BUCKET_MS,
  DAY_MS,
  WEEK_MS,
  SAMPLE_MS,
  BALANCE_MAX_AGE_MS,
} = require('./browsing-credit-service');

const XBZZ = 10n ** 16n;
const plur = (xbzz) => (BigInt(Math.round(xbzz * 1e6)) * XBZZ / 1_000_000n).toString();
const CHEQUEBOOK = '0x' + 'ab'.repeat(20);
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);

function memoryStore() {
  const data = {};
  return { get: (k) => data[k] || null, set: jest.fn((k, v) => { data[k] = v; }), data };
}

describe('recordSettlements', () => {
  test('the first reading is a baseline, not spend', () => {
    const { ledger } = recordSettlements(null, [{ peer: 'aa', sent: plur(0.5) }], T0);
    expect(ledger.since).toBe(T0);
    expect(ledger.peers).toEqual({ aa: plur(0.5) });
    expect(spendWithin(ledger, WEEK_MS, T0)).toBe(0n);
  });

  test('growth per peer is spend, bucketed by hour', () => {
    let { ledger } = recordSettlements(null, [{ peer: 'aa', sent: '100' }], T0);
    ({ ledger } = recordSettlements(ledger, [{ peer: 'aa', sent: '150' }, { peer: 'bb', sent: '30' }], T0 + 60_000));
    ({ ledger } = recordSettlements(ledger, [{ peer: 'aa', sent: '170' }], T0 + 120_000));
    expect(ledger.buckets).toEqual([[Math.floor(T0 / BUCKET_MS) * BUCKET_MS, '100']]);
    expect(spendWithin(ledger, DAY_MS, T0 + 120_000)).toBe(100n);
  });

  test('a peer that drops out and comes back with the same figure adds nothing', () => {
    // /settlements lists the peers the node knows now, so totalSent can fall
    // and rise again without any new cheque.
    let { ledger } = recordSettlements(null, [{ peer: 'aa', sent: '100' }, { peer: 'bb', sent: '50' }], T0);
    let changed;
    ({ ledger, changed } = recordSettlements(ledger, [{ peer: 'aa', sent: '100' }], T0 + 1000));
    expect(changed).toBe(false);
    ({ ledger } = recordSettlements(ledger, [{ peer: 'aa', sent: '100' }, { peer: 'BB', sent: '50' }], T0 + 2000));
    expect(spendWithin(ledger, WEEK_MS, T0 + 2000)).toBe(0n);
  });

  test('a lower figure never counts as negative spend', () => {
    let { ledger } = recordSettlements(null, [{ peer: 'aa', sent: '100' }], T0);
    ({ ledger } = recordSettlements(ledger, [{ peer: 'aa', sent: '40' }], T0 + 1000));
    expect(ledger.peers.aa).toBe('100');
    ({ ledger } = recordSettlements(ledger, [{ peer: 'aa', sent: '130' }], T0 + 2000));
    expect(spendWithin(ledger, DAY_MS, T0 + 2000)).toBe(30n);
  });

  test('day and week windows, and old buckets are dropped', () => {
    let { ledger } = recordSettlements(null, [], T0);
    ({ ledger } = recordSettlements(ledger, [{ peer: 'aa', sent: '10' }], T0));
    ({ ledger } = recordSettlements(ledger, [{ peer: 'aa', sent: '30' }], T0 + 3 * DAY_MS));
    const at = T0 + 3 * DAY_MS + 1000;
    expect(spendWithin(ledger, DAY_MS, at)).toBe(20n);
    expect(spendWithin(ledger, WEEK_MS, at)).toBe(30n);

    ({ ledger } = recordSettlements(ledger, [{ peer: 'aa', sent: '31' }], T0 + 9 * DAY_MS));
    // The day-0 bucket is past the kept 8 days; day 3's is inside the week.
    expect(ledger.buckets.map(([, v]) => v)).toEqual(['20', '1']);
    expect(spendWithin(ledger, WEEK_MS, T0 + 9 * DAY_MS)).toBe(21n);
    expect(spendWithin(ledger, DAY_MS, T0 + 9 * DAY_MS)).toBe(1n);
  });

  test('ignores malformed rows', () => {
    const { ledger } = recordSettlements(null, [{ peer: 'aa', sent: 'x' }, { sent: '1' }, null, { peer: 'bb', sent: '-5' }], T0);
    expect(ledger.peers).toEqual({});
  });
});

describe('formatPlur', () => {
  test('xBZZ has 16 decimals', () => {
    expect(formatPlur(plur(0.001))).toBe('0.001');
    expect(formatPlur('11000000000')).toBe('0.000001');
    expect(formatPlur('0')).toBe('0');
    expect(formatPlur('nope')).toBeNull();
  });
});

describe('createSpendStore', () => {
  test('persists per chequebook and survives a reload', () => {
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'credit-'));
    const file = path.join(dir, 'spend.json');
    const store = createSpendStore(file);
    expect(store.get(CHEQUEBOOK)).toBeNull();
    store.set(CHEQUEBOOK, { since: 1, peers: { aa: '5' }, buckets: [] });
    expect(createSpendStore(file).get(CHEQUEBOOK)).toEqual({ since: 1, peers: { aa: '5' }, buckets: [] });
    fs.writeFileSync(file, '{broken');
    expect(createSpendStore(file).get(CHEQUEBOOK)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

function makeService(overrides = {}) {
  let now = T0;
  let swap = overrides.swapEnable ?? true;
  let status = overrides.status ?? 'running';
  const api = {
    getChequebookAddress: jest.fn(async () => ({ ok: true, data: { chequebookAddress: overrides.address ?? CHEQUEBOOK } })),
    getChequebookBalance: jest.fn(async () => ({
      ok: true,
      data: overrides.balance ?? { totalBalance: plur(0.001), availableBalance: plur(0.0004) },
    })),
    getSettlements: jest.fn(async () => ({ ok: true, data: { totalSent: '0', settlements: overrides.rows?.() ?? [] } })),
  };
  const store = memoryStore();
  const intervals = [];
  const deps = {
    api,
    getNodeStatus: () => ({ status }),
    getSwapSupport: jest.fn(async () => overrides.support ?? 'supported'),
    isSwapEnabled: () => swap,
    setSwapEnabled: jest.fn((v) => {
      swap = v;
      return true;
    }),
    restartNode: overrides.restartNode ?? jest.fn(async () => ({ ok: true, error: null })),
    store,
    now: () => now,
    setIntervalFn: jest.fn((fn, ms) => {
      intervals.push({ fn, ms });
      return intervals.length;
    }),
    clearIntervalFn: jest.fn(),
  };
  const svc = createBrowsingCreditService(deps);
  return {
    svc,
    api,
    deps,
    store,
    intervals,
    advance: (ms) => {
      now += ms;
    },
    setStatus: (s) => {
      status = s;
    },
    swap: () => swap,
  };
}

describe('createBrowsingCreditService', () => {
  test('reports the chequebook, its spendable balance and the spend', async () => {
    let sent = '0';
    const ctx = makeService({ rows: () => [{ peer: 'aa', sent }] });
    let state = await ctx.svc.getState();
    expect(state).toMatchObject({
      node: 'running',
      support: 'supported',
      swapEnable: true,
      chequebook: {
        address: CHEQUEBOOK,
        total: '0.001',
        available: '0.0004',
        availablePlur: plur(0.0004),
        availableExact: true,
      },
      spend: { day: '0', week: '0', since: T0 },
    });

    sent = plur(0.0006);
    ctx.advance(BALANCE_MAX_AGE_MS);
    state = await ctx.svc.getState();
    expect(state.spend).toMatchObject({ day: '0.0006', week: '0.0006' });
  });

  test('throttles the chain reads behind the card', async () => {
    const ctx = makeService();
    await ctx.svc.getState();
    await ctx.svc.getState();
    expect(ctx.api.getChequebookBalance).toHaveBeenCalledTimes(1);
    expect(ctx.api.getSettlements).toHaveBeenCalledTimes(1);
    ctx.advance(BALANCE_MAX_AGE_MS);
    await ctx.svc.getState();
    expect(ctx.api.getChequebookBalance).toHaveBeenCalledTimes(2);
  });

  test('no chequebook reads as null; an unread one as undefined', async () => {
    const none = makeService({ address: '0x' + '0'.repeat(40) });
    expect((await none.svc.getState()).chequebook).toBeNull();
    expect(none.api.getSettlements).not.toHaveBeenCalled();

    const failing = makeService();
    failing.api.getChequebookBalance.mockResolvedValue({ ok: false, status: 503 });
    expect((await failing.svc.getState()).chequebook).toBeUndefined();

    const stopped = makeService({ status: 'stopped' });
    const state = await stopped.svc.getState();
    expect(state.chequebook).toBeUndefined();
    expect(stopped.api.getChequebookBalance).not.toHaveBeenCalled();
  });

  test('says when availableBalance is only the on-chain upper bound', async () => {
    const ctx = makeService({
      balance: { totalBalance: '5', availableBalance: '5', availableBalanceError: 'ledger unreadable' },
    });
    expect((await ctx.svc.getState()).chequebook.availableExact).toBe(false);
  });

  test('samples /settlements in the background only while the node runs', async () => {
    const ctx = makeService();
    ctx.svc.handleNodeStatus();
    expect(ctx.intervals).toHaveLength(1);
    expect(ctx.intervals[0].ms).toBe(SAMPLE_MS);
    ctx.svc.handleNodeStatus();
    expect(ctx.intervals).toHaveLength(1);
    ctx.setStatus('stopped');
    ctx.svc.handleNodeStatus();
    expect(ctx.deps.clearIntervalFn).toHaveBeenCalledWith(1);
  });

  describe('setSwapEnable', () => {
    test('saves the setting and restarts the running node', async () => {
      const ctx = makeService();
      const result = await ctx.svc.setSwapEnable(false);
      expect(result.ok).toBe(true);
      expect(ctx.deps.setSwapEnabled).toHaveBeenCalledWith(false);
      expect(ctx.deps.restartNode).toHaveBeenCalledTimes(1);
      expect(result.state).toMatchObject({ swapEnable: false, toggle: { inProgress: false, error: null } });
    });

    test('a stopped node takes it at its next start, without a restart', async () => {
      const ctx = makeService({ status: 'stopped' });
      expect((await ctx.svc.setSwapEnable(false)).ok).toBe(true);
      expect(ctx.deps.restartNode).not.toHaveBeenCalled();
      expect(ctx.swap()).toBe(false);
    });

    test('no change, no restart', async () => {
      const ctx = makeService();
      expect((await ctx.svc.setSwapEnable(true)).ok).toBe(true);
      expect(ctx.deps.setSwapEnabled).not.toHaveBeenCalled();
      expect(ctx.deps.restartNode).not.toHaveBeenCalled();
    });

    test.each([
      ['unsupported', 'Not supported by this node version.'],
      ['unknown', 'Not supported by this node version.'],
      ['unmanaged', 'Freedom does not manage this Swarm node.'],
    ])('refuses on a %s node and changes nothing', async (support, error) => {
      const ctx = makeService({ support });
      expect(await ctx.svc.setSwapEnable(false)).toEqual({ ok: false, error });
      expect(ctx.deps.setSwapEnabled).not.toHaveBeenCalled();
      expect(ctx.deps.restartNode).not.toHaveBeenCalled();
    });

    test('a refused restart puts the setting back to what the node runs with', async () => {
      const ctx = makeService({
        restartNode: jest.fn(async () => ({
          ok: false,
          error: 'Wait for the purchase to finish before restarting the node.',
        })),
      });
      const result = await ctx.svc.setSwapEnable(false);
      expect(result.ok).toBe(false);
      expect(ctx.swap()).toBe(true);
      expect(result.state.toggle.error).toMatch(/purchase/);
    });

    test('one change at a time', async () => {
      let finish;
      const ctx = makeService({
        restartNode: jest.fn(() => new Promise((resolve) => { finish = resolve; })),
      });
      const first = ctx.svc.setSwapEnable(false);
      await new Promise((r) => setImmediate(r));
      expect((await ctx.svc.getState()).toggle.inProgress).toBe(true);
      expect(await ctx.svc.setSwapEnable(true)).toEqual({
        ok: false,
        error: 'The Swarm node is already restarting.',
      });
      finish({ ok: true });
      expect((await first).ok).toBe(true);
    });

    test('rejects a non-boolean', async () => {
      const ctx = makeService();
      expect((await ctx.svc.setSwapEnable('false')).ok).toBe(false);
    });
  });
});
