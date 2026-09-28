/**
 * onBeforeRequest guard that keeps web content away from the Ant node's HTTP
 * API (docs/security-audit-electron.md, O-1; #428).
 *
 * The Ant API listens on loopback (`127.0.0.1:<port>`, 1633 by default) and
 * serves its admin endpoints — `/stamps`, `/chequebook`, `/wallet`, `/stake` —
 * on the same port as content retrieval, with no authentication. Chromium
 * shows no Local Network Access prompt for a webview, so before this guard a
 * plain `fetch('http://127.0.0.1:1633/stamps/1/17', {method: 'POST',
 * mode: 'no-cors'})` from any https:, bzz: or ipfs: page bought a postage
 * batch with the user's node funds.
 *
 * Policy (maintainer decision: a hard block, no prompt, no opt-in). A
 * request to the Ant API is allowed only when it is
 *   - a top-level GET navigation (the user typed or clicked the URL — the
 *     node's own gateway pages still open in a tab), or
 *   - made by one of Freedom's internal pages (`renderer/pages/<file>` from
 *     internal-pages.json, top frame), or
 *   - made by the chrome renderer (`renderer/index.html` in a
 *     BrowserWindow). The chrome's own node calls go over IPC today
 *     (`ant:api-get`), so this is belt-and-braces.
 * Everything else — any frame of any tab, whatever its origin (https:, bzz:,
 * ipfs:, data:, an opaque/sandboxed origin), a service or shared worker, a
 * request Chromium cannot attribute to a frame at all — is cancelled. That
 * includes non-GET top-level navigations (a cross-site `<form method=post>`)
 * and sub-frame navigations. dApps that need the node use `window.swarm`.
 *
 * The main process's own node traffic (bzz: handler, publishing, probes) goes
 * over Node's fetch and never reaches `session.webRequest`, so it is not
 * affected. The one exception is the ENS prefetch of a *remote* external
 * node, which dials through Electron's `net.request` (for the session's proxy
 * policy) — and `net.request` does pass through `session.webRequest`, with no
 * frame and no webContents, exactly like a worker's request. That dial
 * announces its exact URL in `ant-api-main-dials.js` for its lifetime, and
 * only a frameless GET/HEAD of that exact URL is let through.
 *
 * Which requests count as "to the Ant API":
 *   - any loopback host — `localhost`, `*.localhost`, `127.0.0.0/8`,
 *     `0.0.0.0`, `[::1]`, `[::]`, IPv4-mapped loopback — on an Ant API port;
 *   - any other host at all — DNS name *or* IP literal — on an Ant API
 *     port. The guard runs before DNS, so a name (`127.0.0.1.nip.io`, a
 *     rebinding domain) may resolve to loopback; and a node bound to
 *     `0.0.0.0` (a reused/Docker Bee with `-p 1633:1633`) also answers on
 *     every other address of this machine — the docker bridge
 *     (`172.17.0.1`), the LAN IP, a public IP. The guard cannot enumerate
 *     those (NAT, port forwards, interfaces coming and going), so it does not
 *     try: on the node's port, every host is the node. A top-level GET
 *     navigation to such a URL is still allowed (see below). The one
 *     exception is a node on a scheme-default port (80/443 — an external
 *     `https://localhost` behind a reverse proxy): that port is every
 *     website's too, so there only the loopback spellings are guarded, and a
 *     rebinding name or another address of this machine on 80/443 is not;
 *   - the exact origin of a configured external Ant API.
 * The Ant API ports are the default (1633), the port the node was configured
 * or started on, and every port the node has used this session (a restart
 * onto a fallback port must not reopen the previous one while an older
 * daemon may still be listening there). Schemes: http, https, ws, wss.
 */

const log = require('../logger');
const { DEFAULTS, getAntApiUrl } = require('../service-registry');
const { registerWebRequestHandler } = require('../webrequest-dispatcher');
const { internalPageFileForUrl, isChromeIndexUrl } = require('../ipc-sender-policy');
const {
  isMainProcessAntDial,
  _resetMainProcessAntDialsForTests,
} = require('./ant-api-main-dials');

const GUARDED_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:']);
const DEFAULT_PORTS = { 'http:': '80', 'ws:': '80', 'https:': '443', 'wss:': '443' };
// The scheme-default ports: shared with every website, so never "all hosts".
const SHARED_WEB_PORTS = new Set(Object.values(DEFAULT_PORTS));

// Ports the node has listened on (sticky for the session) and non-loopback
// API origins it has been configured with.
const knownPorts = new Set([String(DEFAULTS.ant.apiPort)]);
const knownRemoteOrigins = new Set();

function effectivePort(parsed) {
  return parsed.port || DEFAULT_PORTS[parsed.protocol] || '';
}

function stripBrackets(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isIpv4Literal(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * True for every host spelling Chromium connects to this machine's loopback
 * interface without a DNS lookup. `hostname` is WHATWG-canonical (lower-case,
 * IPv4 shorthand/hex/octal already normalised to dotted decimal, IPv6
 * compressed and bracketed).
 */
function isLoopbackHostname(rawHostname) {
  if (!rawHostname) return false;
  const hostname = rawHostname.replace(/\.$/, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (isIpv4Literal(hostname)) {
    return hostname.startsWith('127.') || hostname === '0.0.0.0';
  }
  const v6 = stripBrackets(hostname);
  if (v6 === hostname) return false;
  if (v6 === '::1' || v6 === '::') return true;
  // IPv4-mapped (`::ffff:7f00:1`) / -compatible loopback and 0.0.0.0.
  const mapped = v6.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const high = parseInt(mapped[1], 16);
    return high >> 8 === 127 || (high === 0 && parseInt(mapped[2], 16) === 0);
  }
  return false;
}

function isAntApiPort(port) {
  if (knownPorts.has(port)) return true;
  const live = currentApiUrl();
  return Boolean(live && live.port === port && isLoopbackHostname(live.hostname));
}

function currentApiUrl() {
  const raw = getAntApiUrl();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return { hostname: parsed.hostname, port: effectivePort(parsed), origin: parsed.origin };
  } catch {
    return null;
  }
}

/**
 * Record an API URL the node is (about to be) served on. Called by
 * ant-manager whenever it picks a URL — before the node is healthy, which is
 * when the registry learns it — so there is no window where the port is live
 * but unguarded.
 */
function noteAntApiUrl(rawUrl) {
  if (!rawUrl) return;
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return;
  }
  if (!GUARDED_PROTOCOLS.has(parsed.protocol)) return;
  if (isLoopbackHostname(parsed.hostname)) {
    knownPorts.add(effectivePort(parsed));
  } else {
    knownRemoteOrigins.add(`${parsed.hostname}:${effectivePort(parsed)}`);
  }
}

/** True when `rawUrl` addresses the Ant API (see the file header). */
function isAntApiRequestUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!GUARDED_PROTOCOLS.has(parsed.protocol)) return false;
  const hostname = parsed.hostname.toLowerCase();
  const port = effectivePort(parsed);

  if (knownRemoteOrigins.has(`${hostname}:${port}`)) return true;
  const live = currentApiUrl();
  if (live && live.hostname === hostname && live.port === port) return true;

  if (!isAntApiPort(port)) return false;
  // 80/443 are every website's port. A node served on one of them (an
  // external `https://localhost` behind a reverse proxy) is guarded on its
  // loopback spellings only; "every host is the node" there would cancel
  // every page's subresources for the rest of the session (#445 R2-F1).
  if (SHARED_WEB_PORTS.has(port)) return isLoopbackHostname(hostname);
  // On the node's port every host is the node: a DNS name may resolve to
  // loopback (this runs before DNS), and a node bound to 0.0.0.0 answers on
  // every other address of this machine too (see the file header).
  return true;
}

function frameUrlOf(details) {
  try {
    return details?.frame?.url || null;
  } catch {
    // A WebFrameMain whose frame is gone throws on access.
    return null;
  }
}

function isTopFrame(details) {
  try {
    return details?.frame ? details.frame.parent === null : false;
  } catch {
    return false;
  }
}

function webContentsType(details) {
  try {
    return details?.webContents?.getType?.() || null;
  } catch {
    return null;
  }
}

function isAnnouncedMainProcessDial(details, method) {
  if (method !== 'GET' && method !== 'HEAD') return false;
  // A request from a page, a frame or a worker's webContents is never the
  // main process's own dial.
  if (details?.webContentsId !== undefined && details?.webContentsId !== null) return false;
  if (details?.webContents || details?.frame) return false;
  return isMainProcessAntDial(details.url);
}

function isAllowedInitiator(details) {
  const method = String(details?.method || 'GET').toUpperCase();
  if (details?.resourceType === 'mainFrame' && method === 'GET') return true;
  if (isAnnouncedMainProcessDial(details, method)) return true;
  if (!isTopFrame(details)) return false;
  const frameUrl = frameUrlOf(details);
  const type = webContentsType(details);
  if (type === 'webview' && internalPageFileForUrl(frameUrl)) return true;
  if (type === 'window' && isChromeIndexUrl(frameUrl)) return true;
  return false;
}

/**
 * The onBeforeRequest handler. Registered failClosed: a throw cancels.
 */
function guardAntApiRequest(details) {
  if (!details?.url || !isAntApiRequestUrl(details.url)) return null;
  if (isAllowedInitiator(details)) return null;
  log.warn(
    `[ant-api-guard] Blocked a ${String(details.method || 'GET').toUpperCase()} ` +
      `${details.resourceType || 'request'} to the Ant API from web content`
  );
  return { cancel: true };
}

let installed = false;

/**
 * Register the guard with the webRequest dispatcher. Must run before
 * `attachWebRequestDispatcher()` for each session (the handler registry is
 * process-wide), and before the request rewriter so a rewrite can't skip it.
 */
function installAntApiGuard() {
  if (installed) return;
  registerWebRequestHandler('onBeforeRequest', 'ant-api-guard', guardAntApiRequest, {
    failClosed: true,
  });
  installed = true;
}

function _resetAntApiGuardForTests() {
  installed = false;
  knownPorts.clear();
  knownPorts.add(String(DEFAULTS.ant.apiPort));
  knownRemoteOrigins.clear();
  _resetMainProcessAntDialsForTests();
}

module.exports = {
  installAntApiGuard,
  guardAntApiRequest,
  isAntApiRequestUrl,
  isLoopbackHostname,
  noteAntApiUrl,
  _resetAntApiGuardForTests,
};
