const { startEventLoopWatchdog } = require('./event-loop-watchdog');

function harness(opts = {}) {
  let t = 0;
  const log = { warn: jest.fn() };
  let handle = null;
  const timer = { unref: jest.fn() };
  const watchdog = startEventLoopWatchdog({
    log,
    intervalMs: 500,
    thresholdMs: 1000,
    minReportGapMs: 30_000,
    now: () => t,
    setIntervalFn: (fn) => {
      handle = fn;
      return timer;
    },
    clearIntervalFn: jest.fn(),
    ...opts,
  });
  // Advance the clock by `ms` and fire the (late) timer once.
  const fireAfter = (ms) => {
    t += ms;
    handle();
  };
  return { log, watchdog, fireAfter, timer, advance: (ms) => (t += ms) };
}

describe('event-loop watchdog', () => {
  test('stays silent while ticks arrive roughly on time', () => {
    const { log, fireAfter, timer } = harness();
    for (let i = 0; i < 100; i += 1) fireAfter(500 + (i % 3) * 200);
    expect(log.warn).not.toHaveBeenCalled();
    expect(timer.unref).toHaveBeenCalled();
  });

  test('logs the blocked time once a tick is late by the threshold', () => {
    const { log, fireAfter } = harness();
    fireAfter(500 + 999);
    expect(log.warn).not.toHaveBeenCalled();
    fireAfter(500 + 21034);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith('[main] event loop blocked 21034 ms');
  });

  test('names what was running, asked about the stalled window', () => {
    const describeActivity = jest.fn(() => 'chain-data: 100 eth_getLogs via colibri, 21040 ms');
    const { log, fireAfter } = harness({ describeActivity });
    fireAfter(500); // last on-time tick at t=500
    fireAfter(500 + 2000);
    expect(describeActivity).toHaveBeenCalledWith({ since: 500 });
    expect(log.warn).toHaveBeenCalledWith(
      '[main] event loop blocked 2000 ms (chain-data: 100 eth_getLogs via colibri, 21040 ms)'
    );
  });

  test('a throwing activity source never breaks the watchdog', () => {
    const { log, fireAfter } = harness({
      describeActivity: () => {
        throw new Error('boom');
      },
    });
    fireAfter(3000);
    expect(log.warn).toHaveBeenCalledWith('[main] event loop blocked 2500 ms');
  });

  test('folds repeated stalls into one summary line instead of spamming', () => {
    const activities = ['a', 'worst-one', 'c'];
    let i = 0;
    const { log, fireAfter } = harness({ describeActivity: () => activities[i++] || '' });
    fireAfter(500 + 1500); // reported immediately
    expect(log.warn).toHaveBeenCalledTimes(1);
    fireAfter(500 + 4000); // folded (worst)
    fireAfter(500 + 1200); // folded
    for (let k = 0; k < 10; k += 1) fireAfter(500); // healthy, still inside the gap
    expect(log.warn).toHaveBeenCalledTimes(1);
    for (let k = 0; k < 60; k += 1) fireAfter(500); // gap passes → summary
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn.mock.calls[1][0]).toMatch(
      /^\[main\] event loop blocked 2 more times >= 1000 ms in the last \d+ s \(worst 4000 ms, total 5200 ms; worst during worst-one\)$/
    );
    for (let k = 0; k < 200; k += 1) fireAfter(500);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  test('a stall after the gap flushes the summary first, then gets its own line', () => {
    const { log, fireAfter } = harness();
    fireAfter(2000);
    fireAfter(2000); // folded
    fireAfter(500 + 40_000); // past the gap
    expect(log.warn.mock.calls.map((c) => c[0])).toEqual([
      '[main] event loop blocked 1500 ms',
      expect.stringMatching(/^\[main\] event loop blocked 1 more time >= 1000 ms/),
      '[main] event loop blocked 40000 ms',
    ]);
  });

  test('reset() drops the gap, e.g. across system sleep', () => {
    const { log, fireAfter, watchdog, advance } = harness();
    advance(60_000);
    watchdog.reset();
    fireAfter(500);
    expect(log.warn).not.toHaveBeenCalled();
  });

  test('suspend(): the sleep gap is not reported even when the overdue tick beats resume', () => {
    const { log, fireAfter, watchdog } = harness();
    fireAfter(500);
    watchdog.suspend();
    fireAfter(500); // on time, before the machine actually sleeps
    fireAfter(500 + 3 * 3600_000); // Windows: QPC counted the sleep; resume not yet seen
    watchdog.reset(); // 'resume' lands afterwards
    fireAfter(500);
    expect(log.warn).not.toHaveBeenCalled();
  });

  test('suspend(): only the wake gap is absorbed; a later stall is reported', () => {
    const { log, fireAfter, watchdog } = harness();
    watchdog.suspend();
    fireAfter(500 + 60_000); // the sleep
    fireAfter(500 + 2000); // a real stall, resume never arrived
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith('[main] event loop blocked 2000 ms');
  });

  test('suspend() with no sleep and no resume expires after the grace period', () => {
    const { log, fireAfter, watchdog } = harness({ suspendGraceMs: 10_000 });
    watchdog.suspend();
    for (let k = 0; k < 20; k += 1) fireAfter(500); // vetoed sleep: ticks stay on time
    fireAfter(500 + 2000);
    expect(log.warn).toHaveBeenCalledWith('[main] event loop blocked 2000 ms');
  });

  test('stop() flushes stalls still folded into the pending summary', () => {
    const { log, fireAfter, watchdog } = harness({ describeActivity: () => 'x' });
    fireAfter(500 + 1500); // t=0 stall, logged
    fireAfter(500 + 10_000); // folded
    expect(log.warn).toHaveBeenCalledTimes(1);
    watchdog.stop(); // quit inside the 30 s window
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn.mock.calls[1][0]).toMatch(
      /^\[main\] event loop blocked 1 more time >= 1000 ms .*\(worst 10000 ms, total 10000 ms; worst during x\)$/
    );
    watchdog.stop();
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  test('stop() with nothing folded writes nothing', () => {
    const { log, fireAfter, watchdog } = harness();
    fireAfter(500 + 1500);
    watchdog.stop();
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  test('stop() clears the interval', () => {
    const clearIntervalFn = jest.fn();
    const { watchdog, timer } = harness({ clearIntervalFn });
    watchdog.stop();
    expect(clearIntervalFn).toHaveBeenCalledWith(timer);
  });

  test('real timers: a synchronous busy loop is reported', async () => {
    const log = { warn: jest.fn() };
    const watchdog = startEventLoopWatchdog({ log, intervalMs: 20, thresholdMs: 150 });
    await new Promise((r) => setTimeout(r, 60));
    const end = Date.now() + 400;
    while (Date.now() < end) {
      // block the loop
    }
    await new Promise((r) => setTimeout(r, 60));
    watchdog.stop();
    expect(log.warn).toHaveBeenCalledTimes(1);
    const ms = Number(log.warn.mock.calls[0][0].match(/blocked (\d+) ms/)[1]);
    expect(ms).toBeGreaterThanOrEqual(150);
  });
});
