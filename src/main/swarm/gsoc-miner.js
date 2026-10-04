// Main-process side of GSOC signer mining (#503): one long-lived, lazily
// spawned worker (`gsoc-miner-worker.js`) runs bee-js's synchronous gsocMine
// so a page choosing a new messaging topic no longer blocks the main thread.
//
// Jobs are dispatched one at a time and queue here, not in the worker: a
// mining loop never yields, so a job's clock has to start when the worker
// actually begins it, or queued jobs would time out behind a slow one.
//
// A job still running after MINE_TIMEOUT_MS is a runaway — bee-js caps its
// search at 0xffff keys, which takes ~5 s on Electron's Node — so the worker
// is terminated, that job fails, and the next job spawns a fresh worker.
// A worker error/exit fails the in-flight job the same way. Every promise
// returned by `mineSigner` therefore settles.
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const log = require('../logger');

const WORKER_PATH = path.join(__dirname, 'gsoc-miner-worker.js');
const MINE_TIMEOUT_MS = 15_000;
const RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  stackSizeMb: 4,
});

class GsocMiningError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = 'GsocMiningError';
    this.reason = reason;
  }
}

let mineTimeoutMs = MINE_TIMEOUT_MS;
let entry = null; // { worker, terminated }
let current = null; // { id, job, resolve, reject, timer, entry }
const queue = [];
let nextJobId = 1;

function terminate(target) {
  if (!target || target.terminated) return;
  target.terminated = true;
  if (entry === target) entry = null;
  try {
    Promise.resolve(target.worker.terminate()).catch(() => {});
  } catch {
    // Already gone; the 'exit' handler stays attached either way.
  }
}

function finishCurrent(fn) {
  const job = current;
  if (!job) return;
  current = null;
  clearTimeout(job.timer);
  fn(job);
  // Deferred: a synchronous dispatch from inside a worker event handler (or
  // from the job's own settle callbacks) would re-enter it.
  queueMicrotask(pump);
}

// The worker is gone (error, exit, or killed by the timeout): fail its job.
function lose(target, reason, code = 'gsoc_mining_failed') {
  terminate(target);
  if (current?.entry === target) {
    finishCurrent((job) => job.reject(new GsocMiningError(`GSOC mining failed: ${reason}`, code)));
  }
}

function spawn() {
  const target = { worker: null, terminated: false };
  target.worker = new Worker(WORKER_PATH, {
    execArgv: [],
    resourceLimits: RESOURCE_LIMITS,
  });
  target.worker.on('message', (message) => {
    if (message?.type !== 'result' || current?.entry !== target || current.id !== message.id) {
      return;
    }
    finishCurrent((job) => {
      if (message.ok && typeof message.signer === 'string') job.resolve(message.signer);
      else job.reject(new GsocMiningError(`GSOC mining failed: ${message.error || 'no signer'}`, 'gsoc_mining_failed'));
    });
  });
  // Keep both attached through termination: a late worker error must not
  // become an unhandled main-process EventEmitter error.
  target.worker.on('error', (err) => lose(target, `worker error: ${err?.message || err}`));
  target.worker.on('exit', (code) => lose(target, `worker exited (${code})`));
  // An idle worker must not keep the process alive at quit. After the
  // listeners: attaching a 'message' listener re-refs the worker's port.
  target.worker.unref?.();
  return target;
}

function pump() {
  if (current || queue.length === 0) return;
  const job = queue.shift();
  try {
    if (!entry || entry.terminated) entry = spawn();
  } catch (err) {
    entry = null;
    job.reject(new GsocMiningError(`GSOC mining worker failed to start: ${err.message}`, 'gsoc_mining_failed'));
    queueMicrotask(pump);
    return;
  }
  const target = entry;
  current = { ...job, entry: target, timer: null };
  const timeoutMs = mineTimeoutMs;
  current.timer = setTimeout(() => {
    log.warn(`[GsocMiner] mining still running after ${timeoutMs} ms; terminating the worker`);
    lose(target, `timed out after ${timeoutMs} ms`, 'gsoc_mining_timeout');
  }, timeoutMs);
  try {
    target.worker.postMessage({
      type: 'mine',
      id: job.id,
      targetOverlay: job.targetOverlay,
      identifier: job.identifier,
      proximity: job.proximity,
    });
  } catch (err) {
    lose(target, `worker unreachable (${err.message})`);
  }
}

/**
 * Mine a GSOC signer off the main thread.
 * @param {Uint8Array} targetOverlay
 * @param {Uint8Array} identifier
 * @param {number} proximity
 * @returns {Promise<string>} the signer's private key, hex
 */
function mineSigner(targetOverlay, identifier, proximity) {
  return new Promise((resolve, reject) => {
    queue.push({
      id: nextJobId++,
      targetOverlay: Uint8Array.from(targetOverlay),
      identifier: Uint8Array.from(identifier),
      proximity,
      resolve,
      reject,
    });
    pump();
  });
}

function resetForTest({ timeoutMs = MINE_TIMEOUT_MS } = {}) {
  mineTimeoutMs = timeoutMs;
  const pending = queue.splice(0);
  for (const job of pending) job.reject(new GsocMiningError('reset', 'gsoc_mining_failed'));
  if (entry) lose(entry, 'test reset');
  if (current) finishCurrent((job) => job.reject(new GsocMiningError('reset', 'gsoc_mining_failed')));
}

module.exports = {
  mineSigner,
  GsocMiningError,
  MINE_TIMEOUT_MS,
  resetForTest,
};
