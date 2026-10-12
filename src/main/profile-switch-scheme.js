/**
 * `x-freedom-profile:<id>` — a profile switch handed over through xdg-open
 * (Linux only, issue #142).
 *
 * GNOME on Wayland raises another process's window only with an XDG activation
 * token minted from the user's own input. An in-app profile switch to an
 * already-running profile happens in *this* process, so the running profile's
 * own focus() has no token and mutter answers with "'Freedom' is ready"
 * instead. `shell.openExternal` is the one Electron API that mints a token: it
 * starts xdg-open with XDG_ACTIVATION_TOKEN set, xdg-open launches the
 * installed `freedom.desktop` with `x-freedom-profile:<id>`, and that launch
 * reaches the running profile through Electron's single-instance hand-over
 * (index.js), which passes the token along with its argv.
 *
 * The scheme is registered for the whole desktop (package.json's Linux
 * `mimeTypes`), so anything that can run xdg-open can send one. It means
 * exactly `--profile=<id>` for a profile that already exists in the catalog
 * and nothing else: no URL is opened, no profile is created, anything that is
 * not a canonical profile id is refused (profile-resolver.js). It is ignored on
 * macOS and Windows, which never register it.
 */

const { execFile } = require('child_process');
const { sanitizeProfileId } = require('./profile-catalog');

const PROFILE_SWITCH_SCHEME = 'x-freedom-profile';
const PROFILE_SWITCH_MIME_TYPE = `x-scheme-handler/${PROFILE_SWITCH_SCHEME}`;
const PREFIX = `${PROFILE_SWITCH_SCHEME}:`;

// The installed desktop entry, which is what xdg-mime must name as the
// scheme's handler for xdg-open to reach this app (also the Wayland app_id;
// see linux-desktop-name.js and scripts/linux-desktop-entry.test.js).
const PACKAGED_DESKTOP_NAME = require('../../package.json').desktopName;

const XDG_MIME_TIMEOUT_MS = 2000;

function isProfileSwitchArg(arg) {
  return typeof arg === 'string' && arg.slice(0, PREFIX.length).toLowerCase() === PREFIX;
}

// The id a canonical `x-freedom-profile:<id>` names, or null. Canonical means
// what sanitizeProfileId would produce for it already: lower-case
// `[a-z0-9_-]`, no leading or trailing dash. No percent-decoding, no
// `//authority`, query, fragment or trailing slash: the app only ever writes
// the bare id, so anything else did not come from it.
function parseProfileSwitchUrl(value) {
  if (!isProfileSwitchArg(value)) return null;
  const id = value.slice(PREFIX.length);
  if (!/^[a-z0-9_-]+$/.test(id)) return null;
  let canonical;
  try {
    canonical = sanitizeProfileId(id);
  } catch {
    return null;
  }
  return canonical === id ? id : null;
}

// A profile switch among a launch's arguments, on Linux only.
//   null              — none (or not Linux): an ordinary launch
//   { id }            — a well-formed switch to `id` (still to be checked
//                       against the catalog by the caller)
//   { id: null }      — a switch was asked for but is malformed, or more than
//                       one was given; the caller refuses the launch
// argv[0] (the executable) is skipped, like extractLaunchUrls.
function parseProfileSwitchArgv(argv, { platform = process.platform } = {}) {
  if (platform !== 'linux' || !Array.isArray(argv)) return null;
  const switches = argv.slice(1).filter(isProfileSwitchArg);
  if (switches.length === 0) return null;
  if (switches.length > 1) return { id: null };
  return { id: parseProfileSwitchUrl(switches[0]) };
}

function buildProfileSwitchUrl(profileId) {
  const url = `${PREFIX}${profileId}`;
  if (parseProfileSwitchUrl(url) !== profileId) {
    throw new Error(`Invalid profile id: ${profileId}`);
  }
  return url;
}

function queryDefaultSchemeHandler(mimeType) {
  return new Promise((resolve, reject) => {
    execFile(
      'xdg-mime',
      ['query', 'default', mimeType],
      { timeout: XDG_MIME_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout).trim()))
    );
  });
}

// Whether an in-app switch to a running profile should go through xdg-open.
// Only where it is both needed and known to arrive: a Wayland session (X11
// lets the running profile raise itself), a packaged build, and an installed
// desktop entry that xdg-mime names as the scheme's handler — an AppImage
// without desktop integration, a tarball or `npm start` has none, and there
// xdg-open would fail or open something else while the switch did nothing.
async function shouldSwitchProfileViaXdgOpen({
  platform = process.platform,
  env = process.env,
  isPackaged,
  queryDefaultHandler = queryDefaultSchemeHandler,
  desktopName = PACKAGED_DESKTOP_NAME,
} = {}) {
  if (platform !== 'linux') return false;
  if (
    String(env?.XDG_SESSION_TYPE || '')
      .trim()
      .toLowerCase() !== 'wayland'
  )
    return false;
  if (isPackaged !== true) return false;
  let handler;
  try {
    handler = await queryDefaultHandler(PROFILE_SWITCH_MIME_TYPE);
  } catch {
    return false;
  }
  return typeof handler === 'string' && handler.trim() === desktopName;
}

// Hand a switch to the running profile `profileId` over through xdg-open.
// Resolves true once xdg-open accepted it, false when this path does not apply
// or failed (the caller then uses the profile-focus file hand-off).
async function switchProfileViaXdgOpen(profileId, deps = {}) {
  let url;
  try {
    url = buildProfileSwitchUrl(profileId);
  } catch {
    return false;
  }
  const electron = deps.shell && deps.isPackaged !== undefined ? null : require('electron');
  const shell = deps.shell || electron.shell;
  const isPackaged = deps.isPackaged !== undefined ? deps.isPackaged : electron.app.isPackaged;
  const useXdgOpen = await shouldSwitchProfileViaXdgOpen({ ...deps, isPackaged });
  if (!useXdgOpen) return false;
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  PACKAGED_DESKTOP_NAME,
  PROFILE_SWITCH_MIME_TYPE,
  PROFILE_SWITCH_SCHEME,
  buildProfileSwitchUrl,
  isProfileSwitchArg,
  parseProfileSwitchArgv,
  parseProfileSwitchUrl,
  queryDefaultSchemeHandler,
  shouldSwitchProfileViaXdgOpen,
  switchProfileViaXdgOpen,
};
