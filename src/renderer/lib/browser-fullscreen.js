/**
 * Browser full screen hides the chrome (#78).
 *
 * The main process reports the window's full-screen state on every change
 * (src/main/browser-fullscreen.js), whatever started it: F11, View → Enter
 * Full Screen, the hamburger menu's full-screen button, macOS's green button,
 * a page's own Fullscreen API request. While the window is full screen the
 * body carries `browser-fullscreen` and the stylesheet hides the tab strip,
 * toolbar and bookmarks bar, so the active tab's webview takes the screen.
 *
 * Nothing is closed or toggled to get there, only hidden: the bookmarks bar
 * keeps its own on/off setting and an open sidebar stays open underneath
 * (sidebar.js `setFullscreenConcealed`), so leaving full screen puts back
 * exactly what was there before.
 *
 * Escape leaves full screen when nothing in the chrome claimed it first — a
 * menu, the find bar, a modal dialog each close on their own Escape and mark
 * it `defaultPrevented`. Escape typed into the page is claimed in the main
 * process instead, since the page's keys never reach this document.
 */

import { isModalDialogOpen } from './modal-dialog.js';
import { formatAccelerator, getEffectiveAccelerator } from './shortcuts.js';

const BODY_CLASS = 'browser-fullscreen';
// How long the "press … to exit" hint stays up after entering, like Chrome's.
export const EXIT_HINT_MS = 4000;

let active = false;
let hintTimer = null;

const exitHintText = (platform) => {
  const key = formatAccelerator(getEffectiveAccelerator('view.fullscreen'), platform);
  return key ? `Press ${key} or Esc to exit full screen` : 'Press Esc to exit full screen';
};

const hideHint = (hint) => {
  clearTimeout(hintTimer);
  hintTimer = null;
  if (hint) hint.hidden = true;
};

const showHint = (hint, platform) => {
  if (!hint) return;
  hint.textContent = exitHintText(platform);
  hint.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hideHint(hint), EXIT_HINT_MS);
};

export const isBrowserFullscreen = () => active;

/**
 * @param {object} deps
 * @param {(on: boolean) => void} [deps.setSidebarConcealed]
 * @param {() => void} [deps.closeMenus] closes any chrome menu still open
 * @param {string} [deps.platform]
 */
export function initBrowserFullscreen({
  setSidebarConcealed = () => {},
  closeMenus = () => {},
  platform = window.electronAPI?.platform,
} = {}) {
  const hint = document.getElementById('fullscreen-exit-hint');

  const apply = (isFullScreen) => {
    const next = isFullScreen === true;
    if (next === active) return;
    active = next;
    document.body.classList.toggle(BODY_CLASS, active);
    setSidebarConcealed(active);
    if (active) {
      // A menu anchored to the toolbar would float over the page with
      // nothing under it once the toolbar is gone.
      closeMenus();
      showHint(hint, platform);
    } else {
      hideHint(hint);
    }
  };

  window.electronAPI?.onFullscreenChanged?.(apply);

  // Registered before navigation.js's own window-level Escape (stop loading),
  // so a press that leaves full screen does only that.
  window.addEventListener('keydown', (event) => {
    if (!active || event.key !== 'Escape') return;
    if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return;
    if (event.isComposing || event.defaultPrevented || isModalDialogOpen()) return;
    event.preventDefault();
    window.electronAPI?.toggleFullscreen?.();
  });

  return { apply };
}
