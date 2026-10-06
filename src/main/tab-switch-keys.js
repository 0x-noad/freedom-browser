/**
 * Next Tab / Previous Tab, answered in the browser process (#556).
 *
 * These two chords used to reach the tab strip on one of two paths, both of
 * which hand the key to a renderer first:
 *
 *   - the chrome renderer's own keydown fallback (tabs.js), which only sees
 *     the key while the chrome itself has focus; and
 *   - the application-menu accelerator, which only fires once the focused
 *     page has seen the keydown, declined it, and Chromium has routed the
 *     unhandled event from the guest back through the embedder to the menu.
 *
 * A tab switch moves keyboard focus into the incoming tab's page on every
 * activation (#304), so from the second press on the key always starts in a
 * guest and everything rides on that second route. On macOS it does not hold
 * up: after a keyboard switch, a rebound chord such as Cmd+Opt+Right switched
 * exactly once and then did nothing until a mouse click on a tab reset focus
 * (#556). The same route also lets any page swallow the chord by calling
 * `preventDefault()` on its keydown.
 *
 * Chrome does not route tab switching through the page at all: its
 * `PreHandleKeyboardEvent` claims the tab-switch commands before the renderer
 * sees them ("Tab switching/closing accelerators aren't sent to the renderer
 * to avoid a hung/malicious renderer from interfering", RenderWidgetHostImpl).
 * Electron surfaces that same hook as `before-input-event`, so this module
 * listens there on the chrome window and on every tab webview, matches the
 * effective binding (a Settings > Shortcuts remap, else the registry default)
 * plus its fixed aliases, and tells the owning window's chrome to switch —
 * the same `tab:next` / `tab:prev` message the menu item sends. Claiming the
 * keydown (`preventDefault`) also stops the menu accelerator and the
 * renderer fallback, so one press is one switch, and Chromium drops the
 * matching keyup and char events on its own once the keydown is pre-handled.
 *
 * One exception: while Settings > Shortcuts is recording a new binding, the
 * page has to receive the chord it is about to record — swapping Next and
 * Previous, say, means recording the chord that is live on the other row
 * right now. The page reports when a recording starts and stops
 * (`shortcuts:set-recording`), and keys bound for that page are left alone
 * in between.
 */

const { BrowserWindow } = require('electron');
const IPC = require('../shared/ipc-channels');
const {
  eventMatchesAccelerator,
  getEffectiveAccelerator,
  getAliasAccelerators,
} = require('../shared/shortcuts');
const { loadSettings } = require('./settings-store');
const { isMainBrowserWindow } = require('./windows/mainWindow');

const TAB_SWITCH_SHORTCUTS = [
  { id: 'tab.next', channel: IPC.TAB_NEXT },
  { id: 'tab.previous', channel: IPC.TAB_PREV },
];

// webContents id → disarm function, for settings pages with a shortcut
// recording armed.
const recordingContents = new Map();

const currentOverrides = () => {
  try {
    return loadSettings()?.shortcutOverrides || {};
  } catch {
    return {};
  }
};

// Electron's `before-input-event` input object → the KeyboardEvent shape the
// shared matcher reads.
const inputAsKeyboardEvent = (input) => ({
  key: input.key,
  code: input.code,
  ctrlKey: Boolean(input.control),
  altKey: Boolean(input.alt),
  shiftKey: Boolean(input.shift),
  metaKey: Boolean(input.meta),
});

/**
 * The tab-switch IPC channel a `before-input-event` input asks for, or null.
 * Only key-downs count (Electron reports Chromium's raw key-down as
 * `keyDown`); auto-repeat does too, so holding the chord keeps cycling the
 * way it does in Chrome. A key still inside an IME composition is the IME's.
 */
function matchTabSwitchInput(input, overrides = {}, platform = process.platform) {
  if (!input || input.type !== 'keyDown' || input.isComposing) return null;
  const event = inputAsKeyboardEvent(input);
  for (const { id, channel } of TAB_SWITCH_SHORTCUTS) {
    const accelerators = [
      getEffectiveAccelerator(id, overrides, platform),
      ...getAliasAccelerators(id, platform),
    ];
    if (accelerators.some((accelerator) => eventMatchesAccelerator(event, accelerator, platform))) {
      return channel;
    }
  }
  return null;
}

// The chrome window a webContents belongs to: itself for the chrome
// renderer, its embedder's window for a tab webview. Null for anything that
// is not one of our browser windows (DevTools, a window mid-teardown).
function chromeWindowFor(contents) {
  try {
    const host = contents.hostWebContents || contents;
    const win = BrowserWindow.fromWebContents(host);
    if (win && !win.isDestroyed() && isMainBrowserWindow(win)) return win;
  } catch {
    // contents may be tearing down
  }
  return null;
}

function attachTabSwitchKeys(contents, { platform = process.platform } = {}) {
  contents.on('before-input-event', (event, input) => {
    if (recordingContents.has(contents.id)) return;
    const channel = matchTabSwitchInput(input, currentOverrides(), platform);
    if (!channel) return;
    const win = chromeWindowFor(contents);
    if (!win) return;
    event.preventDefault();
    win.webContents.send(channel);
  });
}

// Settings > Shortcuts arms/disarms a recording. Cleared again if the page
// goes away mid-recording, so a stale flag can't leave the chords dead on
// whatever that webContents shows next.
function setShortcutRecording(contents, recording) {
  if (!contents || typeof contents.id !== 'number') return;
  const { id } = contents;
  if (!recording) {
    recordingContents.get(id)?.();
    return;
  }
  if (recordingContents.has(id)) return;
  // Electron passes a details object first and the legacy positional
  // arguments after it; only a cross-document main-frame navigation leaves
  // the settings page (its own #hash routing does not).
  const onNavigate = (details, _url, legacyInPlace, legacyIsMainFrame) => {
    const isMainFrame = details?.isMainFrame ?? legacyIsMainFrame;
    const isSameDocument = details?.isSameDocument ?? legacyInPlace;
    if (isMainFrame !== false && !isSameDocument) disarm();
  };
  const disarm = () => {
    recordingContents.delete(id);
    contents.removeListener?.('did-start-navigation', onNavigate);
    contents.removeListener?.('destroyed', disarm);
  };
  recordingContents.set(id, disarm);
  contents.on?.('did-start-navigation', onNavigate);
  contents.once?.('destroyed', disarm);
}

function registerTabSwitchKeysIpc(ipcMain) {
  ipcMain.handle(IPC.SHORTCUTS_SET_RECORDING, (event, recording) => {
    setShortcutRecording(event.sender, recording === true);
    return true;
  });
}

module.exports = {
  attachTabSwitchKeys,
  matchTabSwitchInput,
  setShortcutRecording,
  registerTabSwitchKeysIpc,
  _isRecording: (id) => recordingContents.has(id),
  _resetRecording: () => recordingContents.clear(),
};
