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
 * `mimeTypes`), so anything that can run xdg-open can send one — including a
 * page in another browser, behind that browser's own confirmation. It means
 * exactly "raise the already-open profile <id>" and nothing else: no URL is
 * opened, no profile is created or cold-started, its "last opened" mark is
 * left alone, and anything that is not a canonical id of a registered,
 * currently running profile is refused (profile-resolver.js, index.js). It is
 * ignored on macOS and Windows, which never register it.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeProfileId } = require('./profile-catalog');

const PROFILE_SWITCH_SCHEME = 'x-freedom-profile';
const PROFILE_SWITCH_MIME_TYPE = `x-scheme-handler/${PROFILE_SWITCH_SCHEME}`;
const PREFIX = `${PROFILE_SWITCH_SCHEME}:`;

// The installed desktop entry, which is what xdg-mime must name as the
// scheme's handler for xdg-open to reach this app (also the Wayland app_id;
// see linux-desktop-name.js and scripts/linux-desktop-entry.test.js).
const PACKAGED_DESKTOP_NAME = require('../../package.json').desktopName;

// xdg-mime is a short shell script; a query that takes longer than this is
// stuck, and the switch falls back to the file hand-off.
const XDG_MIME_TIMEOUT_MS = 1000;

// The switch's outcome, written into the target profile's userData dir: by the
// switch launch itself as soon as it starts (`received`), and once it is over
// by the running profile when the launch raised its window through the
// single-instance hand-over (`done`), or by the launch when it had to use the
// focus-request file instead (`done` or `failed`; profile-instance-handoff.js).
// The in-app switch waits for it: xdg-open itself confirms only that it
// started something.
const PROFILE_SWITCH_ACK_FILE = 'profile-switch-ack.json';
const PROFILE_SWITCH_STATES = new Set(['received', 'done', 'failed']);
// xdg-open, then a fresh Freedom process up to its first lines of main-process
// code: a few hundred ms normally, more on a cold disk. A launch that has not
// said `received` by then never arrived (the scheme went to something else).
const PROFILE_SWITCH_RECEIVE_TIMEOUT_MS = 3000;
// The whole switch: the launch's instance-lock probe (1 s) and, when that goes
// unanswered, its focus-request file (1.8 s), on top of the start-up above.
const PROFILE_SWITCH_ACK_TIMEOUT_MS = 6000;
const PROFILE_SWITCH_ACK_POLL_MS = 100;

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

// --- Is the scheme's handler this very app? ---------------------------------
//
// xdg-mime naming `freedom.desktop` is not enough: with a .deb installed, an
// AppImage (or a second install of another version) would have xdg-open start
// *that* binary against the same userData root, where it runs its own
// migrations and catalog writes before handing over. So the desktop entry's
// Exec program must resolve to the executable this process runs from (the
// AppImage file itself for an AppImage, which runs from a temporary mount).

function desktopEntryDirs({ env = process.env, homedir = os.homedir() } = {}) {
  const dataHome = env?.XDG_DATA_HOME || path.join(homedir, '.local', 'share');
  const dataDirs = String(env?.XDG_DATA_DIRS || '/usr/local/share:/usr/share')
    .split(':')
    .filter(Boolean);
  return [dataHome, ...dataDirs]
    .filter((dir) => path.isAbsolute(dir))
    .map((dir) => path.join(dir, 'applications'));
}

// The `Exec` value of a desktop entry's [Desktop Entry] group, or null.
function parseDesktopEntryExec(text) {
  let inMainGroup = false;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      inMainGroup = line === '[Desktop Entry]';
      continue;
    }
    if (!inMainGroup) continue;
    const match = /^Exec\s*=\s*(.*)$/.exec(line);
    if (match) return match[1];
  }
  return null;
}

// The program (first argument) of an Exec value, unquoted per the desktop
// entry spec, or null when it can't be read.
function execProgram(execValue) {
  const value = String(execValue || '').trimStart();
  if (!value) return null;
  if (value[0] !== '"') {
    const program = value.split(/\s+/)[0];
    return program || null;
  }
  let program = '';
  for (let i = 1; i < value.length; i += 1) {
    const char = value[i];
    if (char === '\\' && i + 1 < value.length) {
      program += value[i + 1];
      i += 1;
    } else if (char === '"') {
      return program || null;
    } else {
      program += char;
    }
  }
  return null;
}

function resolveExecProgram(program, { env = process.env, fsImpl = fs } = {}) {
  if (!program) return null;
  if (path.isAbsolute(program)) return program;
  if (program.includes('/')) return null;
  for (const dir of String(env?.PATH || '').split(':')) {
    if (!path.isAbsolute(dir)) continue;
    const candidate = path.join(dir, program);
    try {
      fsImpl.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Not here.
    }
  }
  return null;
}

// Whether the installed `desktopName` entry (looked up in the XDG data dirs,
// first match wins, like xdg-open does) starts this executable.
function desktopEntryRunsThisApp({
  desktopName = PACKAGED_DESKTOP_NAME,
  env = process.env,
  homedir = os.homedir(),
  execPath = process.execPath,
  fsImpl = fs,
} = {}) {
  const self = env?.APPIMAGE || execPath;
  let selfReal;
  try {
    selfReal = fsImpl.realpathSync(self);
  } catch {
    return false;
  }
  for (const dir of desktopEntryDirs({ env, homedir })) {
    let text;
    try {
      text = fsImpl.readFileSync(path.join(dir, desktopName), 'utf-8');
    } catch {
      continue;
    }
    const program = resolveExecProgram(execProgram(parseDesktopEntryExec(text)), {
      env,
      fsImpl,
    });
    if (!program) return false;
    try {
      return fsImpl.realpathSync(program) === selfReal;
    } catch {
      return false;
    }
  }
  return false;
}

// Whether an in-app switch to a running profile should go through xdg-open.
// Only where it is both needed and known to arrive: a Wayland session (X11
// lets the running profile raise itself), a packaged build, and an installed
// desktop entry that xdg-mime names as the scheme's handler and that starts
// this same executable — an AppImage without desktop integration, a tarball
// or `npm start` has none, and a different install's entry would start a
// different binary.
async function shouldSwitchProfileViaXdgOpen({
  platform = process.platform,
  env = process.env,
  isPackaged,
  queryDefaultHandler = queryDefaultSchemeHandler,
  desktopName = PACKAGED_DESKTOP_NAME,
  runsThisApp = desktopEntryRunsThisApp,
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
  if (typeof handler !== 'string' || handler.trim() !== desktopName) return false;
  try {
    return runsThisApp({ desktopName, env }) === true;
  } catch {
    return false;
  }
}

// --- Confirmation -----------------------------------------------------------

function profileSwitchAckPath(userDataDir) {
  return path.join(userDataDir, PROFILE_SWITCH_ACK_FILE);
}

// Record the switch's progress (`received`, `done` or `failed`, see above).
function writeProfileSwitchAck(
  userDataDir,
  { state = 'done', now = Date.now(), fsImpl = fs } = {}
) {
  if (!PROFILE_SWITCH_STATES.has(state)) throw new Error(`Invalid switch state: ${state}`);
  const target = profileSwitchAckPath(userDataDir);
  const tmp = `${target}.${process.pid}.${now}.${state}.tmp`;
  fsImpl.writeFileSync(tmp, JSON.stringify({ handledAtMs: now, state, pid: process.pid }), 'utf-8');
  fsImpl.renameSync(tmp, target);
}

// The last recorded { at, state }, or null. An ack without a state (none is
// written that way, but keep it readable) counts as `done`.
function readProfileSwitchAck(userDataDir, fsImpl = fs) {
  try {
    const ack = JSON.parse(fsImpl.readFileSync(profileSwitchAckPath(userDataDir), 'utf-8'));
    const at = Number(ack?.handledAtMs);
    if (!Number.isFinite(at)) return null;
    const state = ack?.state === undefined ? 'done' : ack.state;
    return PROFILE_SWITCH_STATES.has(state) ? { at, state } : null;
  } catch {
    return null;
  }
}

function readProfileSwitchAckTime(userDataDir, fsImpl = fs) {
  return readProfileSwitchAck(userDataDir, fsImpl)?.at ?? null;
}

// Resolves true once the profile in `userDataDir` recorded a switch `done` at
// or after `sinceMs`; false as soon as one is recorded `failed`, when none was
// even `received` within `receiveTimeoutMs`, or after `timeoutMs`. Failing
// early keeps the caller's own fallback (and its error, if any) from waiting
// out the whole budget.
async function waitForProfileSwitchAck(userDataDir, sinceMs, options = {}) {
  const timeoutMs = options.timeoutMs ?? PROFILE_SWITCH_ACK_TIMEOUT_MS;
  const receiveTimeoutMs = options.receiveTimeoutMs ?? PROFILE_SWITCH_RECEIVE_TIMEOUT_MS;
  const pollMs = options.pollIntervalMs ?? PROFILE_SWITCH_ACK_POLL_MS;
  const fsImpl = options.fsImpl || fs;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const receiveDeadline = startedAt + Math.min(receiveTimeoutMs, timeoutMs);
  for (;;) {
    const ack = readProfileSwitchAck(userDataDir, fsImpl);
    const current = ack !== null && ack.at >= sinceMs ? ack.state : null;
    if (current === 'done') return true;
    if (current === 'failed') return false;
    const now = Date.now();
    if (now >= deadline) return false;
    if (current === null && now >= receiveDeadline) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

// Hand a switch to the running profile `target` ({ id, userDataDir }) over
// through xdg-open. Resolves true once the running profile confirmed it raised
// its window, false when this path does not apply, failed, or was never
// confirmed (the profile was deleted or quit meanwhile, the launch went
// somewhere else); the caller then uses the profile-focus file hand-off,
// which reports a switch that cannot land.
async function switchProfileViaXdgOpen(target, deps = {}) {
  let url;
  try {
    url = buildProfileSwitchUrl(target?.id);
  } catch {
    return false;
  }
  if (typeof target?.userDataDir !== 'string' || !target.userDataDir) return false;
  const electron = deps.shell && deps.isPackaged !== undefined ? null : require('electron');
  const shell = deps.shell || electron.shell;
  const isPackaged = deps.isPackaged !== undefined ? deps.isPackaged : electron.app.isPackaged;
  const useXdgOpen = await shouldSwitchProfileViaXdgOpen({ ...deps, isPackaged });
  if (!useXdgOpen) return false;
  const sinceMs = (deps.now || Date.now)();
  try {
    await shell.openExternal(url);
  } catch {
    return false;
  }
  return (deps.waitForAck || waitForProfileSwitchAck)(target.userDataDir, sinceMs, deps.ackOptions);
}

module.exports = {
  PACKAGED_DESKTOP_NAME,
  PROFILE_SWITCH_ACK_FILE,
  PROFILE_SWITCH_ACK_TIMEOUT_MS,
  PROFILE_SWITCH_RECEIVE_TIMEOUT_MS,
  PROFILE_SWITCH_MIME_TYPE,
  PROFILE_SWITCH_SCHEME,
  buildProfileSwitchUrl,
  desktopEntryDirs,
  desktopEntryRunsThisApp,
  execProgram,
  isProfileSwitchArg,
  parseProfileSwitchArgv,
  parseDesktopEntryExec,
  parseProfileSwitchUrl,
  queryDefaultSchemeHandler,
  readProfileSwitchAck,
  readProfileSwitchAckTime,
  shouldSwitchProfileViaXdgOpen,
  switchProfileViaXdgOpen,
  waitForProfileSwitchAck,
  writeProfileSwitchAck,
};
