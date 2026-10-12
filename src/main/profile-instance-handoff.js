/**
 * Linux: a second launch of an already-running profile hands over through
 * Electron's single-instance lock (issue #142).
 *
 * Electron keys that lock on the userData directory, and index.js only takes
 * it after profile-resolver.js has pointed userData at the profile's own
 * directory, so there is one lock per profile. A launch of a running profile
 * (the dock, the app grid, `freedom --profile=<id>`, an `x-freedom-profile:`
 * switch through xdg-open) then reaches the running process as a
 * 'second-instance' event — and Electron carries the launch's XDG activation
 * token with it and sets it before the event fires, so the running process's
 * next focus() is allowed to raise its window. GNOME on Wayland refuses
 * activation without one and posts "'Freedom' is ready" instead; the
 * profile-focus file hand-off (profile-focus-handoff.js) has no way to carry
 * the token.
 *
 * The file hand-off stays as the fallback: on macOS and Windows (which keep
 * their own, working, activation paths), and on Linux whenever the running
 * process does not hold the lock (an older Freedom version still running
 * across an upgrade, or the narrow race between taking the profile lock and
 * this one).
 */

const { buildColdStartUrls } = require('./launch-urls');

// For a launch whose profile is locked by a running process: true when the
// launch was handed to that process through the single-instance lock (the
// caller exits), false when the caller should use the file hand-off.
//
// `requestSingleInstanceLock()` returning false *is* the hand-over: Electron
// has passed this process's argv (and activation token) to the lock holder.
// Returning true means no running process listens on it; this process then
// holds the lock only until it exits a moment later.
function handOverToRunningProfile(app, { platform = process.platform } = {}) {
  if (platform !== 'linux') return false;
  return !app.requestSingleInstanceLock();
}

// What a 'second-instance' launch asks the running profile to open: Profile
// settings for a Profiles-manager launch carrying --open-settings, else the
// links among its arguments (checked like any other launch's). A plain launch
// opens nothing and just raises the most recently used window.
function secondInstanceUrls(argv, { settingsUrl }) {
  return buildColdStartUrls(argv, { settingsUrl });
}

// The 'second-instance' listener. Links that land while this process is still
// cold-starting go to the first window bootstrap() is about to open (the same
// queue the file hand-off uses); after that, focusWindow opens them in the
// most recently focused window and raises it. focusWindow is called in the
// same turn as the event when the app is ready, so it activates with the
// token Electron has just set for this launch.
function createSecondInstanceHandler({ app, settingsUrl, firstWindowLinks, focusWindow, logger }) {
  return (_event, argv) => {
    const urls = secondInstanceUrls(argv, { settingsUrl });
    if (firstWindowLinks.queue(urls)) return;
    const focus = () => {
      try {
        focusWindow(urls);
      } catch (error) {
        logger?.error?.('[profile] Could not focus this profile for a second launch:', error);
      }
    };
    if (app.isReady()) focus();
    else app.whenReady().then(focus);
  };
}

// Take this profile's single-instance lock and listen for later launches of
// it. Returns whether this process now holds the lock; when it does not
// (Linux only: see the race above), later launches fall back to the file
// hand-off, which this process keeps watching either way.
function listenForProfileRelaunches(app, options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'linux') return false;
  if (!app.requestSingleInstanceLock()) {
    options.logger?.warn?.(
      "[profile] Another process holds this profile's single-instance lock; " +
        'later launches of it hand over through the focus-request file instead'
    );
    return false;
  }
  app.on('second-instance', createSecondInstanceHandler({ app, ...options }));
  return true;
}

module.exports = {
  createSecondInstanceHandler,
  handOverToRunningProfile,
  listenForProfileRelaunches,
  secondInstanceUrls,
};
