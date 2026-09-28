/**
 * The main process's own in-flight dials of the Ant API that go through
 * Electron's `net.request` (and so through `session.webRequest`, where
 * `ant-api-guard.js` would otherwise cancel them).
 *
 * Almost all of the main process's node traffic uses Node's `fetch`, which
 * never reaches `session.webRequest`. The exception is the ENS prefetch of a
 * *remote* external node (`ens-prefetch.js`), which goes through the shared
 * gateway transport so the session's proxy policy applies. In webRequest that
 * dial looks like a worker's request — no frame, no webContents — so the
 * guard cannot tell it apart by shape. Instead the caller announces the exact
 * URL here for the lifetime of the dial, and the guard lets a frameless
 * GET/HEAD of exactly that URL through.
 *
 * Kept free of dependencies so both the guard and its callers can load it.
 */

const pending = new Map();

/**
 * Announce a main-process dial of `url`. Returns a release function; call it
 * once the dial has settled (idempotent).
 */
function announceMainProcessAntDial(url) {
  const key = String(url);
  pending.set(key, (pending.get(key) || 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (pending.get(key) || 0) - 1;
    if (count > 0) pending.set(key, count);
    else pending.delete(key);
  };
}

function isMainProcessAntDial(url) {
  return pending.has(String(url));
}

function _resetMainProcessAntDialsForTests() {
  pending.clear();
}

module.exports = {
  announceMainProcessAntDial,
  isMainProcessAntDial,
  _resetMainProcessAntDialsForTests,
};
