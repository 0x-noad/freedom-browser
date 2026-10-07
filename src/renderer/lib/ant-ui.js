// Bee/Swarm node UI controls
import { state, getDisplayMessage } from './state.js';
import { fetchAntJson } from './wallet/ant-api.js';
import { pushDebug } from './debug.js';
import { UNKNOWN, versionText } from './ui-format.js';

// DOM elements (initialized in initAntUi)
let beeToggleBtn = null;
let beeToggleSwitch = null;
let beePeersCount = null;
let beeNetworkPeers = null;
let beeVersionText = null;
let beeInfoPanel = null;
let beeStatusRow = null;
let beeStatusLabel = null;
let beeStatusValue = null;
let beeCacheText = null;
let beeCacheNote = null;

// How often the Cache row re-reads the node while the menu is open.
export const ANT_CACHE_POLL_MS = 3000;

// Bumped by every cache read and by stopping: a reply that lands after a
// newer read, or after the menu closed, is dropped.
let cacheReadSeq = 0;

// Binary availability state
let beeBinaryAvailable = true;

export const stopAntInfoPolling = () => {
  if (state.antPeersInterval) {
    clearInterval(state.antPeersInterval);
    state.antPeersInterval = null;
  }
  if (state.antVisibleInterval) {
    clearInterval(state.antVisibleInterval);
    state.antVisibleInterval = null;
  }
  if (state.antCacheInterval) {
    clearInterval(state.antCacheInterval);
    state.antCacheInterval = null;
  }
  cacheReadSeq += 1;
  paintCache(null);
  beeInfoPanel?.classList.remove('visible');
  if (beePeersCount) beePeersCount.textContent = '0';
  if (beeNetworkPeers) beeNetworkPeers.textContent = '0';
  if (beeVersionText)
    beeVersionText.textContent = versionText(
      state.antVersionFetched ? state.antVersionValue : ''
    );
};

const fetchConnectedPeers = async () => {
  if (!state.antMenuOpen) return;
  if (state.currentAntStatus === 'stopped') {
    stopAntInfoPolling();
    return;
  }
  if (!beeInfoPanel?.classList.contains('visible')) return;

  try {
    const response = await fetchAntJson('/peers');
    if (!beeInfoPanel?.classList.contains('visible')) return;
    if (response.ok) {
      const peersData = response.data;
      const peers = peersData?.peers || peersData || [];
      const count = Array.isArray(peers) ? peers.length : peers?.total || 0;
      if (beePeersCount) beePeersCount.textContent = String(count ?? 0);
    } else if (beePeersCount) {
      beePeersCount.textContent = '0';
    }
  } catch {
    if (beePeersCount) beePeersCount.textContent = '0';
  }
};

const fetchVisiblePeers = async () => {
  if (!state.antMenuOpen) return;
  if (state.currentAntStatus === 'stopped') {
    stopAntInfoPolling();
    return;
  }
  if (!beeInfoPanel?.classList.contains('visible')) return;

  try {
    const response = await fetchAntJson('/topology');
    if (!beeInfoPanel?.classList.contains('visible')) return;
    if (response.ok) {
      const topologyData = response.data;
      const populationSum = Object.values(topologyData?.bins || {}).reduce(
        (sum, bin) => sum + (bin?.population || 0),
        0
      );
      if (beeNetworkPeers) beeNetworkPeers.textContent = String(populationSum ?? 0);
    } else if (beeNetworkPeers) {
      beeNetworkPeers.textContent = '0';
    }
  } catch {
    if (beeNetworkPeers) beeNetworkPeers.textContent = '0';
  }
};

// The Cache row: the value, and the note under it saying why there is no
// figure (the main process words both, swarm/ant-cache.js). Null paints the
// placeholder the markup starts with.
const paintCache = (cache) => {
  if (beeCacheText) beeCacheText.textContent = cache?.text || UNKNOWN;
  if (beeCacheNote) {
    beeCacheNote.textContent = cache?.reason || '';
    beeCacheNote.hidden = !cache?.reason;
  }
};

const fetchCacheStatus = async () => {
  if (!state.antMenuOpen) return;
  if (state.currentAntStatus === 'stopped') {
    stopAntInfoPolling();
    return;
  }
  if (!beeInfoPanel?.classList.contains('visible')) return;
  const seq = ++cacheReadSeq;
  let cache;
  try {
    cache = (await window.ant?.cacheStatus?.()) || null;
  } catch {
    cache = null;
  }
  if (seq !== cacheReadSeq || !beeInfoPanel?.classList.contains('visible')) return;
  paintCache(cache);
};

const fetchAntVersionOnce = async () => {
  if (state.antVersionFetched) return;
  try {
    const healthResponse = await fetchAntJson('/health');
    if (healthResponse.ok) {
      const healthData = healthResponse.data;
      // antd reports a wire-format version like "antd/0.5.8-<build>"; surface
      // it as the product label "Ant v0.5.8" to match the rest of the UI.
      const rawVersion = (healthData?.version || '').split('-')[0];
      const antSemver = rawVersion.includes('/') ? rawVersion.split('/').pop() : rawVersion;
      state.antVersionValue = antSemver ? `Ant v${antSemver}` : '';
      state.antVersionFetched = true;
      if (beeVersionText) beeVersionText.textContent = versionText(state.antVersionValue);
    } else if (beeVersionText) {
      beeVersionText.textContent = UNKNOWN;
    }
  } catch {
    if (beeVersionText) beeVersionText.textContent = UNKNOWN;
  }
};

export const startAntInfoPolling = () => {
  if (!state.antMenuOpen || state.currentAntStatus === 'stopped') {
    stopAntInfoPolling();
    return;
  }

  beeInfoPanel?.classList.add('visible');

  fetchConnectedPeers();
  fetchVisiblePeers();
  fetchCacheStatus();
  if (!state.antVersionFetched) fetchAntVersionOnce();

  if (state.antPeersInterval) clearInterval(state.antPeersInterval);
  state.antPeersInterval = setInterval(fetchConnectedPeers, 500);

  if (state.antVisibleInterval) clearInterval(state.antVisibleInterval);
  state.antVisibleInterval = setInterval(fetchVisiblePeers, 1000);

  if (state.antCacheInterval) clearInterval(state.antCacheInterval);
  state.antCacheInterval = setInterval(fetchCacheStatus, ANT_CACHE_POLL_MS);
};

export const updateAntUi = (status, error) => {
  if (state.suppressRunningStatus && status === 'running') {
    return;
  }
  if (status === 'stopped' || status === 'error') {
    state.suppressRunningStatus = false;
  }

  const previousStatus = state.currentAntStatus;
  state.currentAntStatus = status;

  // Fetch version immediately when Bee becomes running (don't wait for polling)
  if (status === 'running' && !state.antVersionFetched) {
    fetchAntVersionOnce();
  }

  // Update status line and toggle state from registry
  updateAntStatusLine();
  updateAntToggleState();

  if (!beeToggleBtn || !beeToggleSwitch) return;

  beeToggleSwitch.classList.remove('running');
  switch (status) {
    case 'running':
    case 'starting':
      beeToggleSwitch.classList.add('running');
      break;
    case 'error':
      if (error) pushDebug(`Ant Error: ${error}`);
      break;
    case 'stopping':
    case 'stopped':
    default:
      // Clear status row when stopped
      if (beeStatusRow) beeStatusRow.classList.remove('visible');
      break;
  }

  if (state.antMenuOpen) {
    if (status === 'stopped') {
      stopAntInfoPolling();
    } else if (
      !state.antPeersInterval &&
      !state.antVisibleInterval &&
      !state.antCacheInterval &&
      beeToggleSwitch?.classList.contains('running')
    ) {
      startAntInfoPolling();
    } else if (status !== previousStatus && state.antCacheInterval) {
      // The Cache row follows the node (starting → running) at once rather
      // than on the next poll.
      fetchCacheStatus();
    }
  }
};

export const resetAntVersion = () => {
  state.antVersionFetched = false;
  state.antVersionValue = '';
  if (beeVersionText) beeVersionText.textContent = UNKNOWN;
};

const setToggleDisabled = (disabled) => {
  if (!beeToggleBtn) return;

  if (disabled) {
    beeToggleBtn.classList.add('disabled');
    beeToggleBtn.setAttribute('disabled', 'true');
    beeToggleBtn.setAttribute('title', 'Swarm binary not found');
  } else {
    beeToggleBtn.classList.remove('disabled');
    beeToggleBtn.removeAttribute('disabled');
    beeToggleBtn.removeAttribute('title');
  }
};

// Update the status row from registry
export const updateAntStatusLine = () => {
  if (!beeStatusRow || !beeStatusLabel || !beeStatusValue) return;

  const message = getDisplayMessage('ant');

  if (message) {
    // Parse "Label: value" format
    const colonIndex = message.indexOf(':');
    if (colonIndex > 0) {
      beeStatusLabel.textContent = message.substring(0, colonIndex + 1);
      beeStatusValue.textContent = message.substring(colonIndex + 1).trim();
    } else {
      // Fallback for messages without colon
      beeStatusLabel.textContent = message;
      beeStatusValue.textContent = '';
    }
    beeStatusRow.classList.add('visible');
  } else {
    beeStatusLabel.textContent = '';
    beeStatusValue.textContent = '';
    beeStatusRow.classList.remove('visible');
  }
};

// Update toggle disabled state based on node mode
export const updateAntToggleState = () => {
  if (!beeToggleBtn) return;

  const mode = state.registry?.ant?.mode;
  const isReused = mode === 'reused';

  if (isReused) {
    beeToggleBtn.classList.add('external');
    beeToggleBtn.setAttribute('title', 'Using existing node — cannot be controlled from Freedom');
  } else if (beeBinaryAvailable) {
    beeToggleBtn.classList.remove('external');
    beeToggleBtn.removeAttribute('title');
  }
};

export const initAntUi = () => {
  // Initialize DOM elements
  beeToggleBtn = document.getElementById('bee-toggle-btn');
  beeToggleSwitch = document.getElementById('bee-toggle-switch');
  beePeersCount = document.getElementById('bee-peers-count');
  beeNetworkPeers = document.getElementById('bee-network-peers');
  beeVersionText = document.getElementById('bee-version-text');
  beeInfoPanel = document.querySelector('.bee-info');
  beeStatusRow = document.getElementById('bee-status-row');
  beeStatusLabel = document.getElementById('bee-status-label');
  beeStatusValue = document.getElementById('bee-status-value');
  beeCacheText = document.getElementById('bee-cache-text');
  beeCacheNote = document.getElementById('bee-cache-note');

  // Check binary availability
  if (window.ant) {
    window.ant.checkBinary().then(({ available }) => {
      beeBinaryAvailable = available;
      setToggleDisabled(!available);
      if (!available) {
        pushDebug('Swarm binary not found - toggle disabled');
      }
    });
  }

  // Toggle button listener
  beeToggleBtn?.addEventListener('click', () => {
    if (!beeBinaryAvailable) return;

    // Don't allow toggling when using an external node
    const mode = state.registry?.ant?.mode;
    if (mode === 'reused') return;

    if (state.currentAntStatus === 'running' || state.currentAntStatus === 'starting') {
      state.suppressRunningStatus = true;
      beeToggleSwitch?.classList.remove('running');
      stopAntInfoPolling();
      pushDebug('User toggled Swarm Off');
      window.ant
        .stop()
        .then(({ status, error }) => updateAntUi(status, error))
        .catch((err) => {
          console.error('Failed to toggle Ant', err);
          pushDebug(`Failed to toggle Ant: ${err.message}`);
        });
    } else {
      state.suppressRunningStatus = false;
      beeToggleSwitch?.classList.add('running');
      startAntInfoPolling();
      pushDebug('User toggled Swarm On');
      window.ant
        .start()
        .then(({ status, error }) => updateAntUi(status, error))
        .catch((err) => {
          console.error('Failed to toggle Ant', err);
          pushDebug(`Failed to toggle Ant: ${err.message}`);
        });
    }
  });

  // Listen for status updates from main process
  if (window.ant) {
    const handleStatus = ({ status, error }) => {
      pushDebug(`Ant Status Update: ${status} ${error ? `(${error})` : ''}`);
      updateAntUi(status, error);
    };
    window.ant.onStatusUpdate(handleStatus);

    // Initial status check
    const refreshBeeStatus = () => {
      window.ant.getStatus().then(({ status, error }) => {
        updateAntUi(status, error);
      });
    };
    refreshBeeStatus();
    setInterval(refreshBeeStatus, 5000);
  }
};
