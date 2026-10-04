/**
 * Flushing for electron-log's asynchronous file transport (#511).
 *
 * With `log.transports.file.sync = false`, electron-log (5.4.x,
 * `src/node/transports/file/File.js`) pushes each line onto the File's
 * `asyncWriteQueue` and appends the queue with `fs.writeFile`, one batch in
 * flight at a time. It has no flush API, and `fs.writeFile` is an
 * open → write → close chain whose steps continue from the main loop, so
 * lines still queued — or a batch still mid-chain — when the process goes away
 * never reach main.log. Two holes follow, both closed here:
 *
 * - `app.exit()` emits no `will-quit`, `quit` or `process` `'exit'` at all
 *   (probed on Electron 44), so a forced exit must call `flushLogFileSync()`
 *   itself first.
 * - A graceful quit does emit `'exit'` (after `will-quit`), but the wind-down
 *   logs a burst right before it, so a batch is usually still in flight then.
 *   Observed 2026-10-05 on Electron 44.4.5: with only the `'exit'` flush, the
 *   last 8 wind-down lines were still queued at `'exit'` and the in-flight
 *   batch landed *after* them; with neither flush they were missing from
 *   main.log altogether. `drainLogFile()` waits the batch out while the loop
 *   still runs, then turns the transport synchronous so the lines the
 *   remaining quit handlers log land at once, in order.
 *
 * What this does not cover (the price of async, accepted in #511):
 *
 * - A batch already mid-`fs.writeFile` is not retained anywhere electron-log
 *   exposes (`nextAsyncWrite` moves the text into the call), so nothing here
 *   can rewrite it. If the process ends before the loop runs that chain to
 *   completion — `app.exit()` on a second signal, or the shutdown watchdog's
 *   `app.quit()` — that batch is lost, while the newer queued lines are
 *   written. Only the graceful path (`drainLogFile()`) waits it out.
 * - Nothing flushes at all when the main thread wedges (a hung native call)
 *   and the user force-quits, or the process dies on SIGKILL/SIGSEGV: no
 *   handler runs, so every line still queued or in flight is gone. With
 *   electron-log's sync default those last lines were on disk before the
 *   call that hung. When chasing a hang or a native crash (cf. #345, #292),
 *   set `FREEDOM_LOG_SYNC=1` to restore the sync transport.
 *
 * These reach into the File object electron-log returns from
 * `transport.getFile()` (`asyncWriteQueue`, `hasActiveAsyncWriting`,
 * `writeAsync`). log-file-flush.test.js drives the installed electron-log's
 * real File class, so a version that renames them fails there.
 */
const fs = require('fs');

const DRAIN_TIMEOUT_MS = 1000;
const DRAIN_POLL_MS = 5;

function asyncFileOf(fileTransport) {
  let file;
  try {
    file = fileTransport?.getFile?.();
  } catch {
    return null;
  }
  if (!file || (typeof file.isNull === 'function' && file.isNull())) return null;
  if (!Array.isArray(file.asyncWriteQueue) || typeof file.path !== 'string') return null;
  return file;
}

/**
 * Writes every queued line synchronously and makes later lines synchronous.
 * Safe to call any number of times; never throws.
 *
 * A batch still in flight is out of reach (electron-log keeps no copy of it)
 * and is left to finish on its own. It lands only if the event loop keeps
 * running long enough — after it the newer queued lines written here, so out
 * of order. If the process ends first (`app.exit()`, the watchdog's quit), it
 * is lost.
 */
function flushLogFileSync(fileTransport, { fsImpl = fs } = {}) {
  const file = asyncFileOf(fileTransport);
  if (!file) return;
  file.writeAsync = false;
  if (file.asyncWriteQueue.length === 0) return;
  const text = file.asyncWriteQueue.join('');
  file.asyncWriteQueue = [];
  try {
    fsImpl.writeFileSync(file.path, text, file.writeOptions);
    if (typeof file.increaseBytesWrittenCounter === 'function') {
      file.increaseBytesWrittenCounter(text);
    }
  } catch {
    // Nowhere left to report it: the log file is what failed.
  }
}

/**
 * Whether main.log should be written synchronously: only when
 * `FREEDOM_LOG_SYNC` is `1` (trimmed). Async is the default (#511).
 */
function wantsSyncLogFile(env = process.env) {
  return String(env?.FREEDOM_LOG_SYNC ?? '').trim() === '1';
}

/**
 * Waits (bounded) for the in-flight batch to land, then `flushLogFileSync()`.
 * Never rejects.
 */
async function drainLogFile(
  fileTransport,
  { timeoutMs = DRAIN_TIMEOUT_MS, pollMs = DRAIN_POLL_MS, fsImpl = fs } = {}
) {
  const file = asyncFileOf(fileTransport);
  const deadline = Date.now() + timeoutMs;
  while (file?.hasActiveAsyncWriting && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  flushLogFileSync(fileTransport, { fsImpl });
}

module.exports = { drainLogFile, flushLogFileSync, wantsSyncLogFile };
