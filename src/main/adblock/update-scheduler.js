/**
 * Schedules Swarm filter-list update cycles (WP5 5.B3).
 *
 * No cross-process owner-lock is needed: filter lists are written to
 * per-profile userData/adblock/updated, and profile-lock already guarantees a
 * single process per profile — so each profile keeps its own lists fresh
 * independently. (Contrast the app updater, which is global and therefore
 * lock-guarded.)
 *
 * A cycle is a no-op unless the feed trust anchor is configured and both
 * `adblockEnabled` and `adblockAutoUpdate` are on. runUpdateOnce tolerates the
 * node not being ready yet (it just returns feed_unavailable), so the first
 * check is merely delayed to let the Ant node warm up. A check that could not
 * reach the feed or a list is retried after RETRY_DELAY_MS, not the full
 * period: most sessions are shorter than six hours, and an update that keeps
 * missing its one check per launch would never land.
 *
 * Each check schedules the next only once it has finished, so two never run
 * at once (they would share update-manager's staging dir). runUpdateOnce
 * bounds its own network calls, so a check always finishes.
 */

const log = require('../logger');
const { loadSettings } = require('../settings-store');
const { isTrustAnchorConfigured } = require('./feed-config');
const { runUpdateOnce } = require('./update-manager');

// Let the embedded Ant node warm up before the first feed read; lists carry
// 1–4 day expiry, so a 6h cadence keeps clients comfortably fresh.
const INITIAL_DELAY_MS = 45_000;
const PERIOD_MS = 6 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 30 * 60 * 1000;

// Outcomes worth retrying soon: the node or a retrieval was not there yet.
// A rejected manifest, a hash mismatch or a failed engine build would fail
// the same way in half an hour, so they wait for the regular period.
const RETRY_STATUSES = new Set(['feed_unavailable', 'download_failed', 'error']);

let timer = null;
// Bumped by every install and clear: a check still running from before one
// does not schedule another, so there is only ever one chain of checks.
let generation = 0;

function updatesEnabled() {
  const settings = loadSettings();
  return (
    isTrustAnchorConfigured() &&
    settings.adblockEnabled !== false &&
    settings.adblockAutoUpdate !== false
  );
}

async function tick() {
  if (!updatesEnabled()) return null;
  try {
    const result = await runUpdateOnce();
    if (result.status === 'applied') {
      log.info(`[adblock-update] applied filter-list version ${result.version}`);
    }
    return result;
  } catch (err) {
    log.warn(`[adblock-update] update cycle failed: ${err.message}`);
    return { status: 'error', reason: err.message };
  }
}

function delayAfter(result) {
  return result && RETRY_STATUSES.has(result.status) ? RETRY_DELAY_MS : PERIOD_MS;
}

function scheduleCheck(delayMs, chain) {
  if (chain !== generation) return;
  timer = setTimeout(() => runScheduledCheck(chain), delayMs);
  if (timer.unref) timer.unref();
}

async function runScheduledCheck(chain) {
  timer = null;
  const result = await tick();
  scheduleCheck(delayAfter(result), chain);
}

function clearTimers() {
  generation += 1;
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Start the periodic scheduler. No-op (with a log) when there's no anchor. */
function installAdblockUpdater() {
  if (!isTrustAnchorConfigured()) {
    log.info('[adblock-update] no feed trust anchor compiled in — live updates disabled');
    return;
  }
  clearTimers();
  scheduleCheck(INITIAL_DELAY_MS, generation);
  try {
    require('electron').app.on('will-quit', clearTimers);
  } catch {
    // Outside Electron (tests).
  }
}

module.exports = {
  installAdblockUpdater,
  INITIAL_DELAY_MS,
  PERIOD_MS,
  RETRY_DELAY_MS,
  _tick: tick,
  _updatesEnabled: updatesEnabled,
  _clearTimers: clearTimers,
};
