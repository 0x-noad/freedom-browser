// A small request/response host for one lazily spawned `worker_threads`
// worker (#503 items 9 and 12). Used by the web3:// document decoder
// (`onchain/onchain-html-worker.js`) and the chainlist catalog
// (`networks/chain-catalog-worker.js`), so CPU-heavy work on a multi-MB input
// never runs on Electron's main thread, where it freezes every window.
//
// Protocol: main posts `{ id, op, ...payload }`; the worker answers
// `{ id, ok: true, result }` or `{ id, ok: false, error, code }`, and may post
// `{ type: 'log', level, message }` at any time (the worker has no access to
// the main process's log file).
//
// Every request settles:
//   - A worker that cannot start, or dies before it has answered anything, is
//     not retried: every request (then and later) rejects with
//     `TaskWorkerUnavailable`, and the caller does the work on the main thread
//     as it did before the worker existed.
//   - A worker error/exit after it has answered fails its pending requests
//     with `TaskWorkerUnavailable` too (same fallback); the next request
//     spawns a fresh worker.
//   - A request still unanswered after `timeoutMs` terminates the worker and
//     fails with `TaskWorkerTimeout` — not a fallback, since work that slow
//     would freeze the main thread just the same. Requests queued behind it
//     on the same worker fail the same way, for the same reason.
//   - A failure the worker reports (`ok: false`) rejects with an Error carrying
//     the worker's message and `code`.
const { Worker } = require('node:worker_threads');
const log = require('./logger');

class TaskWorkerUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'TaskWorkerUnavailable';
  }
}

class TaskWorkerTimeout extends Error {
  constructor(message) {
    super(message);
    this.name = 'TaskWorkerTimeout';
  }
}

const LOG_LEVELS = new Set(['info', 'warn', 'error']);

/**
 * @param {object} options
 * @param {string} options.name - log prefix, e.g. 'OnchainHtml'
 * @param {string} options.workerPath
 * @param {() => any} [options.workerData] - evaluated at each spawn
 * @param {object} [options.resourceLimits]
 * @param {number} options.timeoutMs
 */
function createTaskWorkerHost({
  name,
  workerPath,
  workerData = () => undefined,
  resourceLimits,
  timeoutMs,
}) {
  let entry = null; // { worker, pending: Map<id, request>, answered, deliberate, terminated }
  let disabled = false;
  let nextId = 1;
  let requestTimeoutMs = timeoutMs;
  let currentWorkerPath = workerPath;

  function failAll(target, makeError) {
    for (const request of target.pending.values()) {
      clearTimeout(request.timer);
      request.reject(makeError());
    }
    target.pending.clear();
  }

  function retire(target, reason, makeError = () => new TaskWorkerUnavailable(reason)) {
    if (target.terminated) return;
    target.terminated = true;
    if (entry === target) entry = null;
    if (!target.answered && !target.deliberate) {
      disabled = true;
      log.warn(`[${name}] worker unavailable (${reason}); running on the main thread`);
    }
    failAll(target, makeError);
    try {
      Promise.resolve(target.worker.terminate()).catch(() => {});
    } catch {
      // Already gone.
    }
  }

  function spawn() {
    const target = {
      worker: null,
      pending: new Map(),
      answered: false,
      // Retired on purpose (timeout, stop), not because it could not run.
      deliberate: false,
      terminated: false,
    };
    target.worker = new Worker(currentWorkerPath, {
      workerData: workerData(),
      execArgv: [],
      resourceLimits,
    });
    target.worker.on('message', (message) => {
      if (message?.type === 'log') {
        const level = LOG_LEVELS.has(message.level) ? message.level : 'info';
        log[level](`[${name}] ${String(message.message).slice(0, 1000)}`);
        return;
      }
      const request = target.pending.get(message?.id);
      if (!request) return;
      target.pending.delete(message.id);
      clearTimeout(request.timer);
      target.answered = true;
      if (message.ok) {
        request.resolve(message.result);
      } else {
        const error = new Error(message.error || `${name} failed`);
        if (message.code) error.code = message.code;
        request.reject(error);
      }
    });
    // Both stay attached through termination: a late worker error must not
    // become an unhandled main-process EventEmitter error.
    target.worker.on('error', (err) => retire(target, `worker error: ${err?.message || err}`));
    target.worker.on('exit', (code) => retire(target, `worker exited (${code})`));
    // An idle worker must not keep the process alive at quit.
    target.worker.unref?.();
    return target;
  }

  /**
   * @returns {Promise<any>} rejects with TaskWorkerUnavailable when the
   *   caller should do the work on the main thread instead
   */
  function run(op, payload = {}) {
    if (disabled) {
      return Promise.reject(new TaskWorkerUnavailable('worker disabled'));
    }
    if (!entry || entry.terminated) {
      try {
        entry = spawn();
      } catch (err) {
        disabled = true;
        log.warn(`[${name}] worker failed to start (${err.message}); running on the main thread`);
        return Promise.reject(new TaskWorkerUnavailable(err.message));
      }
    }
    const target = entry;
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const deadlineMs = requestTimeoutMs;
      const timer = setTimeout(() => {
        if (!target.pending.has(id)) return;
        log.warn(`[${name}] ${op} still running after ${deadlineMs} ms; terminating the worker`);
        target.pending.delete(id);
        reject(new TaskWorkerTimeout(`${name} ${op} timed out after ${deadlineMs} ms`));
        target.deliberate = true;
        retire(
          target,
          'timed out',
          () => new TaskWorkerTimeout(`${name} abandoned: a ${op} timed out ahead of it`)
        );
      }, deadlineMs);
      target.pending.set(id, { resolve, reject, timer });
      try {
        target.worker.postMessage({ id, op, ...payload });
      } catch (err) {
        retire(target, `worker unreachable (${err.message})`);
      }
    });
  }

  /** Terminate the worker (app quitting, tests). */
  function stop() {
    if (!entry) return;
    entry.deliberate = true;
    retire(entry, 'stopped', () => new Error(`${name} stopped`));
  }

  function resetForTest({
    timeoutMs: testTimeoutMs = timeoutMs,
    path: testPath = workerPath,
  } = {}) {
    stop();
    entry = null;
    disabled = false;
    requestTimeoutMs = testTimeoutMs;
    currentWorkerPath = testPath;
  }

  return { run, stop, resetForTest };
}

module.exports = { createTaskWorkerHost, TaskWorkerUnavailable, TaskWorkerTimeout };
