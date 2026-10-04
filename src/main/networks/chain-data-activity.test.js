const { createChainDataActivity } = require('./chain-data-activity');

function setup(opts) {
  let t = 0;
  const activity = createChainDataActivity({ now: () => t, ...opts });
  return { activity, at: (ms) => (t = ms) };
}

describe('chain-data activity', () => {
  test('wrapping router.request records chain, method, duration and answering source', async () => {
    const { activity, at } = setup();
    let resolve;
    const router = {
      request: jest.fn(() => new Promise((r) => (resolve = r))),
    };
    expect(activity.instrumentChainDataRouter(router)).toBe(true);
    at(100);
    const pending = router.request(100, 'eth_getLogs', [{}], { background: true });
    at(1300);
    expect(activity.describe({ since: 0 })).toBe('chain-data: 100 eth_getLogs in flight, 1200 ms');
    at(21_134);
    resolve({ result: [], source: 'colibri', verified: true });
    await expect(pending).resolves.toEqual({ result: [], source: 'colibri', verified: true });
    expect(activity.describe({ since: 21_000 })).toBe(
      'chain-data: 100 eth_getLogs via colibri, 21034 ms'
    );
    // Settled before the window: not part of it.
    expect(activity.describe({ since: 21_200 })).toBe('');
  });

  test('passes arguments and this through unchanged, and only wraps once', async () => {
    const { activity } = setup();
    const original = jest.fn(async function () {
      return { result: this.tag, source: 'quorum' };
    });
    const router = { tag: 'me', request: original };
    activity.instrumentChainDataRouter(router);
    expect(activity.instrumentChainDataRouter(router)).toBe(false);
    await expect(router.request(1, 'eth_call', ['x'], { a: 1 })).resolves.toEqual({
      result: 'me',
      source: 'quorum',
    });
    expect(original).toHaveBeenCalledWith(1, 'eth_call', ['x'], { a: 1 });
  });

  test('a rejected or throwing request is recorded as failed and the error propagates', async () => {
    const { activity } = setup();
    const err = new Error('nope');
    const router = { request: jest.fn(async () => Promise.reject(err)) };
    activity.instrumentChainDataRouter(router);
    await expect(router.request(100, 'eth_call')).rejects.toBe(err);
    const sync = {
      request: jest.fn(() => {
        throw err;
      }),
    };
    createChainDataActivity().instrumentChainDataRouter(sync);
    expect(() => sync.request(1, 'eth_call')).toThrow(err);
    expect(activity.describe()).toBe('chain-data: 100 eth_call failed, 0 ms');
  });

  test('lists the longest first and caps the list', () => {
    const { activity, at } = setup({ maxListed: 2 });
    const done = [];
    for (const [ms, method] of [
      [0, 'a'],
      [10, 'b'],
      [20, 'c'],
    ]) {
      at(ms);
      done.push(activity.track(1, method));
    }
    at(100);
    done[1]('myotis');
    expect(activity.describe()).toBe(
      'chain-data: 1 a in flight, 100 ms; 1 b via myotis, 90 ms; +1 more'
    );
  });

  test('keeps a bounded ring of settled reads', () => {
    const { activity } = setup({ keepSettled: 3, maxListed: 100 });
    for (let i = 0; i < 10; i += 1) activity.track(1, `m${i}`)('direct');
    expect(activity.describe().match(/via direct/g)).toHaveLength(3);
  });
});
