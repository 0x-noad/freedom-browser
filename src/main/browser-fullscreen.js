/**
 * Browser full screen: the chrome steps aside for the page (#78).
 *
 * F11, View → Enter Full Screen and the hamburger menu's full-screen button
 * all call `BrowserWindow.setFullScreen()`. On its own that only makes the
 * *window* fill the screen, with the tab strip, toolbar, bookmarks bar and
 * sidebar still stacked above the page. Every browser instead hides its own
 * chrome and lets the active page have the screen, so the window's state is
 * reported to its chrome renderer, which hides itself (lib/browser-fullscreen.js).
 *
 * The report rides the window's own `enter-full-screen`/`leave-full-screen`
 * events rather than the three call sites, so every way into or out of full
 * screen is covered the same: the menu, F11 (accelerator or the renderer's
 * fallback), the toolbar button, macOS's green button and a page's own
 * Fullscreen API request. It is re-sent whenever the chrome finishes loading,
 * so a reloaded chrome starts in the right state.
 *
 * Escape leaves browser full screen too. Keys typed into the page never reach
 * the chrome's keydown handlers, so the press is claimed here, on the page's
 * `before-input-event`, the same hook tab-switch-keys.js uses (#556). It is
 * claimed (`preventDefault`) so one press does one thing; a page that is in
 * its *own* (Fullscreen API) full screen keeps its Escape, which Chromium
 * uses to leave that, and the next Escape leaves the browser's. The chrome's
 * own Escape goes through its renderer instead, after its menus and find bar
 * have had their turn.
 */

const { BrowserWindow } = require('electron');
const IPC = require('../shared/ipc-channels');
const { isMainBrowserWindow } = require('./windows/mainWindow');

// webContents ids of pages currently in their own (Fullscreen API) full screen.
const htmlFullscreenContents = new Set();

function sendFullscreenState(win) {
  if (!win || win.isDestroyed()) return;
  const contents = win.webContents;
  if (!contents || contents.isDestroyed?.()) return;
  contents.send(IPC.WINDOW_FULLSCREEN_CHANGED, win.isFullScreen());
}

/**
 * Report a chrome window's full-screen state to its renderer, now and on
 * every change.
 */
function attachFullscreenChromeSync(win) {
  win.on('enter-full-screen', () => sendFullscreenState(win));
  win.on('leave-full-screen', () => sendFullscreenState(win));
  win.webContents?.on('did-finish-load', () => sendFullscreenState(win));
}

// The chrome window a tab webview belongs to, or null.
function chromeWindowFor(contents) {
  try {
    const host = contents.hostWebContents;
    if (!host) return null;
    const win = BrowserWindow.fromWebContents(host);
    if (win && !win.isDestroyed() && isMainBrowserWindow(win)) return win;
  } catch {
    // contents may be tearing down
  }
  return null;
}

const isPlainEscapeDown = (input) =>
  Boolean(input) &&
  input.type === 'keyDown' &&
  input.key === 'Escape' &&
  !input.isComposing &&
  !input.control &&
  !input.alt &&
  !input.shift &&
  !input.meta;

/**
 * Let Escape typed into a tab's page leave browser full screen.
 */
function attachFullscreenEscape(contents) {
  const { id } = contents;
  contents.on('enter-html-full-screen', () => htmlFullscreenContents.add(id));
  contents.on('leave-html-full-screen', () => htmlFullscreenContents.delete(id));
  contents.once('destroyed', () => htmlFullscreenContents.delete(id));

  contents.on('before-input-event', (event, input) => {
    if (!isPlainEscapeDown(input)) return;
    // The page's own full screen: Chromium's Escape leaves that one. As of
    // Electron 44.7 (observed 2026-10) Chromium consumes that key-down before
    // `before-input-event` fires at all, so this is a guard against that
    // changing, not the thing keeping one press from leaving both today.
    if (htmlFullscreenContents.has(id)) return;
    const win = chromeWindowFor(contents);
    if (!win || !win.isFullScreen()) return;
    event.preventDefault();
    win.setFullScreen(false);
  });
}

module.exports = {
  attachFullscreenChromeSync,
  attachFullscreenEscape,
  isPlainEscapeDown,
};
