/**
 * The Swarm node's chunk cache (#579): how big it may grow, and what it holds.
 *
 * Size. Ant reads bee's `cache-capacity` key (a chunk count, × 4096 bytes)
 * from the config.yaml Freedom writes (ant-manager.js buildAntConfigContent).
 * There is no runtime resize over the HTTP API, so a new size applies when the
 * node restarts. The size is one of a fixed set, so a value Ant would reject
 * (a malformed `cache-capacity` is a startup error) can never reach the file:
 * anything else read from settings falls back to the default.
 *
 * Status. `GET /debugstore` (bee's `debugStorage` shape, Ant v0.5.60+) gives
 * chunk counts: `Cache.Size` unpinned chunks, `Cache.Capacity` the cap ÷ 4096,
 * `ChunkStore.TotalChunks` every chunk on disk, pinned or not. The main
 * process reads it — the chrome's Ant API allowlist (ant-api-chrome.js) and
 * web content's guard (ant-api-guard.js) stay as they are — and hands
 * Settings → Nodes → Swarm cache one summary line over a settings-only channel.
 *
 * Clearing the cache is not here: Ant has no HTTP endpoint for it yet
 * (freedom-hq/ant#149), and deleting chunks.sqlite would lose pins.
 */

const fs = require('fs');
const path = require('path');

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

// Bee's chunk size, the factor `cache-capacity` and `/debugstore` count in.
const CHUNK_BYTES = 4096;

// Ant's FFI clamp (64 MiB–16 GiB); every size here sits inside it.
const MIN_CACHE_BYTES = 64 * MIB;
const MAX_CACHE_BYTES = 16 * GIB;

const CACHE_SIZES = Object.freeze([512 * MIB, 1 * GIB, 2 * GIB, 5 * GIB, 10 * GIB, 16 * GIB]);

const DEFAULT_CACHE_BYTES = 2 * GIB;

// What Ant uses with no cache key at all (`--disk-cache-max-gb`'s default),
// so what every install had before Freedom wrote the key.
const LEGACY_CACHE_BYTES = 10 * GIB;

// Ant counts an existing cache in the background after it opens it, and
// `/debugstore` reads 0 meanwhile (Ant documents ~30 s). Within this window of
// the spawn, an all-zero answer over a cache file at least this big is Ant
// still counting, not an empty cache. Same bounds as Android (#413).
const COUNTING_WINDOW_MS = 60_000;
const COUNTING_MIN_FILE_BYTES = 1 * MIB;

const STATUS_TIMEOUT_MS = 5_000;

/** `bytes` when it is one of the sizes, else null. */
function normalizeCacheBytes(bytes) {
  return CACHE_SIZES.includes(bytes) ? bytes : null;
}

/** The size to use for a stored value: the value if it is a size, else the default. */
function resolveCacheBytes(stored) {
  return normalizeCacheBytes(stored) ?? DEFAULT_CACHE_BYTES;
}

/** `cache-capacity`'s chunk count for a size (any input resolves to a size first). */
function cacheCapacityChunks(bytes) {
  return resolveCacheBytes(bytes) / CHUNK_BYTES;
}

/**
 * The cache size to write for this start, and whether to save it.
 *
 * `stored` is the `antCacheCapacityBytes` setting (null until a size is
 * chosen). `hasExistingCache` is whether this profile's data dir already holds
 * a chunks.sqlite.
 *
 * A profile whose node already built a cache under an older Freedom has been
 * running at Ant's 10 GiB. It keeps 10 GB until the user picks: dropping to
 * 2 GB on upgrade would throw away up to 8 GB of cached pages, and a cache
 * file made before Ant v0.5.60 does not hand that space back to the disk
 * right away, so the user would lose the cache without getting the space. A
 * profile with no cache yet gets the default. Either way the choice is saved
 * on this first start, so a cache built from now on doesn't later read as an
 * old one, and Settings shows what the node uses.
 *
 * (The config file can't tell the two apart: identity injection rewrites
 * config.yaml without a cache key on new profiles too.)
 */
function chooseCacheBytes({ stored, hasExistingCache }) {
  if (stored !== null && stored !== undefined) {
    return { bytes: resolveCacheBytes(stored), save: false };
  }
  return { bytes: hasExistingCache ? LEGACY_CACHE_BYTES : DEFAULT_CACHE_BYTES, save: true };
}

/** "512 MB", "2 GB", "1.3 GB": binary units, a decimal only when it isn't whole. */
function formatCacheBytes(bytes) {
  const value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit++;
  }
  const rounded = Math.round(scaled * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${units[unit]}`;
}

/** The size as the picker names it, "(default)" on the default. */
function cacheSizeLabel(bytes) {
  const label = formatCacheBytes(bytes);
  return bytes === DEFAULT_CACHE_BYTES ? `${label} (default)` : label;
}

function chunkCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/**
 * `/debugstore`'s body as `{ diskEnabled, usedBytes, capacityBytes,
 * pinnedBytes, chunks }`, or null when it isn't bee's shape (garbage, an
 * error body, a node too old to have the route).
 *
 * Bytes are chunk counts × 4096, bee's own conversion, so they are close to
 * (a little under) what is on disk. `Cache.Capacity` 0 means Ant has no disk
 * cache (it couldn't open it, or runs with `--no-disk-cache`). Pinned chunks
 * are every chunk on disk minus the unpinned ones; `Pinning.TotalChunks` is
 * not used because it counts a chunk once per pin that holds it.
 */
function parseDebugstore(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const cache = data.Cache;
  if (!cache || typeof cache !== 'object') return null;
  const capacity = chunkCount(cache.Capacity);
  if (capacity === null) return null;
  const size = chunkCount(cache.Size) ?? 0;
  const total = chunkCount(data.ChunkStore?.TotalChunks);
  const pinned = total !== null && total > size ? total - size : 0;
  return {
    diskEnabled: capacity > 0,
    usedBytes: size * CHUNK_BYTES,
    capacityBytes: capacity * CHUNK_BYTES,
    pinnedBytes: pinned * CHUNK_BYTES,
    chunks: size + pinned,
  };
}

/**
 * Whether an all-zero reading is Ant still counting the cache it just opened:
 * the disk cache is on, nothing counted, the node was spawned less than a
 * minute ago, and the cache file is big enough not to be empty. Only known for
 * the node Freedom spawned (its spawn time and data dir); otherwise false.
 */
function isCounting(parsed, { sinceSpawnMs, fileBytes }) {
  if (!parsed?.diskEnabled) return false;
  if (parsed.chunks > 0) return false;
  if (!Number.isFinite(sinceSpawnMs) || sinceSpawnMs < 0 || sinceSpawnMs >= COUNTING_WINDOW_MS) {
    return false;
  }
  return Number.isFinite(fileBytes) && fileBytes >= COUNTING_MIN_FILE_BYTES;
}

/** "1.3 GB of 2 GB · 120 MB pinned", the pinned part only when there is some. */
function cacheSummary({ usedBytes, capacityBytes, pinnedBytes }) {
  const used = `${formatCacheBytes(usedBytes)} of ${formatCacheBytes(capacityBytes)}`;
  return pinnedBytes > 0 ? `${used} · ${formatCacheBytes(pinnedBytes)} pinned` : used;
}

// Settings' cache usage line for each state: `text` is the value, `reason`
// the line under it saying why there is no figure (empty when there is one).
const STATE_COPY = {
  'not-running': { text: 'Not running', reason: 'Shown while the Swarm node is running.' },
  starting: { text: 'Starting…', reason: 'Shown once the Swarm node is running.' },
  'disk-off': {
    text: 'Unavailable',
    reason: "The node couldn't open its disk cache. Restarting the node tries again.",
  },
  unreadable: { text: 'Unknown', reason: "This Swarm node doesn't report its cache." },
};

/**
 * The usage line for a node `status` and its `/debugstore` answer.
 *
 * @returns {{ state: string, text: string, reason: string, usedBytes?: number,
 *   capacityBytes?: number, pinnedBytes?: number }}
 */
function describeCache({ nodeStatus, parsed, counting = false }) {
  if (nodeStatus === 'starting') return { state: 'starting', ...STATE_COPY.starting };
  if (nodeStatus !== 'running') return { state: 'not-running', ...STATE_COPY['not-running'] };
  if (!parsed) return { state: 'unreadable', ...STATE_COPY.unreadable };
  if (!parsed.diskEnabled) return { state: 'disk-off', ...STATE_COPY['disk-off'] };
  const figures = {
    usedBytes: parsed.usedBytes,
    capacityBytes: parsed.capacityBytes,
    pinnedBytes: parsed.pinnedBytes,
  };
  if (counting) {
    return {
      state: 'counting',
      text: `Counting… (${formatCacheBytes(parsed.capacityBytes)} max)`,
      reason: 'The node is still counting its cache after starting.',
      ...figures,
    };
  }
  return { state: 'ok', text: cacheSummary(parsed), reason: '', ...figures };
}

/** Size of chunks.sqlite with its WAL, or null when there is no file. */
function cacheFileBytes(dataDir) {
  if (!dataDir) return null;
  let total = null;
  for (const name of ['chunks.sqlite', 'chunks.sqlite-wal']) {
    try {
      total = (total ?? 0) + fs.statSync(path.join(dataDir, name)).size;
    } catch {
      // Missing file: contributes nothing.
    }
  }
  return total;
}

/**
 * The usage line, read live. Dependencies are injectable for tests and for the
 * e2e's fake node.
 */
function createAntCacheService({
  getNodeStatus,
  getApiBase,
  getSpawnedAt = () => null,
  getDataDir = () => null,
  fetchImpl = (...args) => fetch(...args),
  now = Date.now,
  timeoutMs = STATUS_TIMEOUT_MS,
} = {}) {
  async function readDebugstore() {
    const base = getApiBase();
    if (typeof base !== 'string' || !base) return null;
    try {
      const response = await fetchImpl(`${base.replace(/\/$/, '')}/debugstore`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        await response.body?.cancel?.().catch(() => {});
        return null;
      }
      return parseDebugstore(JSON.parse(await response.text()));
    } catch {
      return null;
    }
  }

  async function getStatus() {
    const nodeStatus = getNodeStatus()?.status;
    if (nodeStatus !== 'running') return describeCache({ nodeStatus });
    const parsed = await readDebugstore();
    // The status can change while the read is out; a node that stopped
    // meanwhile reads as not running, not as unreadable.
    if (getNodeStatus()?.status !== 'running') return describeCache({ nodeStatus: 'stopped' });
    const spawnedAt = getSpawnedAt();
    const counting =
      Number.isFinite(spawnedAt) &&
      isCounting(parsed, {
        sinceSpawnMs: now() - spawnedAt,
        fileBytes: parsed?.diskEnabled && parsed.chunks === 0 ? cacheFileBytes(getDataDir()) : null,
      });
    return describeCache({ nodeStatus: 'running', parsed, counting });
  }

  return { getStatus };
}

/**
 * Settings → Nodes → Swarm cache size: what the picker shows and whether it
 * can change anything. `managed` false (an external, disabled or reused node)
 * comes with the reason. `nodeActive`: the node Freedom runs is up, so a new
 * size restarts it. `hasExistingCache`: this profile's data dir already holds
 * a chunks.sqlite, which decides the size the first start writes.
 */
function cacheSettingsView({
  stored,
  hasExistingCache = false,
  profileMode,
  registryMode,
  nodeActive = false,
}) {
  let reason = '';
  if (profileMode === 'external' || registryMode === 'reused') {
    reason = "Freedom doesn't run this Swarm node. Set its cache size where it runs.";
  } else if (profileMode === 'disabled') {
    reason = 'The Swarm node is off for this profile under Settings → Nodes.';
  }
  // Before the first start there is no stored size yet; show the one that
  // start will write (chooseCacheBytes), so an upgrader with an old cache sees
  // 10 GB and can pick 2 GB before the node ever starts.
  return {
    bytes: chooseCacheBytes({ stored, hasExistingCache }).bytes,
    // What settings hold (null until chosen or first start): the renderer
    // compares a settings broadcast against this, not against `bytes`.
    // The raw stored value, not the normalized one: a hand-edited size
    // outside the set would otherwise read as null here and never match.
    storedBytes: stored ?? null,
    defaultBytes: DEFAULT_CACHE_BYTES,
    sizes: CACHE_SIZES.map((bytes) => ({ bytes, label: cacheSizeLabel(bytes) })),
    managed: !reason,
    reason,
    // Applying a size restarts the node now (the picker asks first).
    nodeActive: !reason && nodeActive === true,
  };
}

/**
 * Saves a new size and restarts the node Freedom runs so it takes effect.
 * Refuses anything not in the set, and a node Freedom doesn't manage.
 *
 * @returns {Promise<{ ok: boolean, restarted?: boolean, error?: string }>}
 */
async function applyCacheSize(
  bytes,
  {
    getView,
    save,
    isNodeActive,
    restartNode,
    getNodeError = null,
    // Resolves once the node has left STARTING (healthy, failed or exited),
    // or after a timeout. startAnt returns as soon as antd is spawned, so
    // without this a node that spawns and then dies reads as restarted.
    waitForNodeSettled = null,
    // Up and healthy (RUNNING), not merely coming up; defaults to isNodeActive.
    isNodeRunning = null,
  }
) {
  const size = normalizeCacheBytes(bytes);
  if (size === null) return { ok: false, error: 'That cache size is not one Freedom offers.' };
  const view = getView();
  if (!view.managed) return { ok: false, error: view.reason };
  if (save(size) === false) return { ok: false, error: 'The cache size could not be saved.' };
  if (!isNodeActive()) return { ok: true, restarted: false };
  const result = await restartNode();
  if (result && result.ok === false) {
    return { ok: true, restarted: false, error: result.error || 'The Swarm node did not restart.' };
  }
  // startAnt reports a failed start (a port clash, a config error) through the
  // node's state rather than by throwing, so a restart that "succeeded" can
  // still have left the node down. It also returns while antd is still
  // starting, so wait for the start to settle and require it to be healthy.
  if (waitForNodeSettled) await waitForNodeSettled();
  if (!(isNodeRunning || isNodeActive)()) {
    const reason = getNodeError?.();
    return {
      ok: true,
      restarted: false,
      error: reason
        ? `The Swarm node did not start again (${reason}).`
        : 'The Swarm node did not start again.',
    };
  }
  return { ok: true, restarted: true };
}

module.exports = {
  CACHE_SIZES,
  CHUNK_BYTES,
  DEFAULT_CACHE_BYTES,
  LEGACY_CACHE_BYTES,
  MIN_CACHE_BYTES,
  MAX_CACHE_BYTES,
  COUNTING_WINDOW_MS,
  COUNTING_MIN_FILE_BYTES,
  normalizeCacheBytes,
  resolveCacheBytes,
  cacheCapacityChunks,
  chooseCacheBytes,
  formatCacheBytes,
  cacheSizeLabel,
  parseDebugstore,
  isCounting,
  cacheSummary,
  describeCache,
  cacheFileBytes,
  createAntCacheService,
  cacheSettingsView,
  applyCacheSize,
};
