/**
 * Main-process event-loop watchdog (#498).
 *
 * A blocked main thread freezes every window — the chrome stops painting and
 * ignores input — and leaves nothing in the logs. #495's ~30 s startup freeze
 * (Colibri's WASM verifier running Ant's `eth_getLogs` synchronously) was only
 * noticed as a spinner. This turns such a stall into one log line:
 *
 *   [main] event loop blocked 21034 ms (chain-data: 100 eth_getLogs via colibri, 21040 ms)
 *
 * How: one unref'd interval timer. Each tick measures how late it fired; a
 * timer cannot fire while the loop is blocked, so the lateness *is* the
 * blocked time (to within one interval). The line is written when the loop
 * comes back, which is the only time JavaScript can write anything — so the
 * "what was running" part comes from `describeActivity({ since })`, asked
 * about everything in flight or settled since the last on-time tick (a
 * synchronous stall usually ends exactly when its culprit settles, before the
 * timer phase gets to run).
 *
 * Cost: a 500 ms timer doing a subtraction and a comparison — no histogram,
 * no allocation on a healthy tick. `unref()` so it never keeps the process
 * alive on quit.
 *
 * Log volume: the first stall is logged at once; further stalls within
 * `minReportGapMs` are folded into one summary line (count, worst, total,
 * and the worst one's activity) written once that window has passed. A host
 * that stalls every second for an hour writes ~120 lines, not ~3600.
 */

const { performance } = require('perf_hooks');

const DEFAULT_INTERVAL_MS = 500;
const DEFAULT_THRESHOLD_MS = 1000;
const DEFAULT_MIN_REPORT_GAP_MS = 30_000;

function formatLine(blockedMs, activity) {
  return (
    `[main] event loop blocked ${Math.round(blockedMs)} ms` + (activity ? ` (${activity})` : '')
  );
}

function startEventLoopWatchdog({
  log,
  describeActivity = () => '',
  intervalMs = DEFAULT_INTERVAL_MS,
  thresholdMs = DEFAULT_THRESHOLD_MS,
  minReportGapMs = DEFAULT_MIN_REPORT_GAP_MS,
  now = () => performance.now(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (!log || typeof log.warn !== 'function') throw new Error('startEventLoopWatchdog needs a log');

  let lastTick = now();
  let lastReportAt = -Infinity;
  let suppressed = null; // { count, worstMs, totalMs, worstActivity }

  function safeDescribe(since) {
    try {
      return describeActivity({ since }) || '';
    } catch {
      return '';
    }
  }

  function flushSuppressed(t) {
    if (!suppressed) return;
    const { count, worstMs, totalMs, worstActivity } = suppressed;
    log.warn(
      `[main] event loop blocked ${count} more time${count === 1 ? '' : 's'} ` +
        `>= ${thresholdMs} ms in the last ${Math.round((t - lastReportAt) / 1000)} s ` +
        `(worst ${Math.round(worstMs)} ms, total ${Math.round(totalMs)} ms` +
        (worstActivity ? `; worst during ${worstActivity}` : '') +
        ')'
    );
    suppressed = null;
    lastReportAt = t;
  }

  function tick() {
    const t = now();
    const since = lastTick;
    const blockedMs = t - since - intervalMs;
    lastTick = t;

    if (blockedMs < thresholdMs) {
      if (suppressed && t - lastReportAt >= minReportGapMs) flushSuppressed(t);
      return;
    }

    const activity = safeDescribe(since);
    if (t - lastReportAt >= minReportGapMs) {
      // Anything folded since the last line goes out first, so lines stay in
      // order; then this stall gets its own line.
      if (suppressed) flushSuppressed(t);
      log.warn(formatLine(blockedMs, activity));
      lastReportAt = t;
      return;
    }
    if (!suppressed) suppressed = { count: 0, worstMs: 0, totalMs: 0, worstActivity: '' };
    suppressed.count += 1;
    suppressed.totalMs += blockedMs;
    if (blockedMs > suppressed.worstMs) {
      suppressed.worstMs = blockedMs;
      suppressed.worstActivity = activity;
    }
  }

  const timer = setIntervalFn(tick, intervalMs);
  timer?.unref?.();

  return {
    // Forget the time since the last tick, e.g. on resume from system sleep,
    // where the gap is the machine being suspended, not the loop blocked.
    reset() {
      lastTick = now();
    },
    stop() {
      clearIntervalFn(timer);
    },
    // Exposed for tests.
    tick,
  };
}

module.exports = {
  startEventLoopWatchdog,
  formatLine,
  DEFAULT_INTERVAL_MS,
  DEFAULT_THRESHOLD_MS,
  DEFAULT_MIN_REPORT_GAP_MS,
};
