/**
 * Browser full screen hides the chrome (#78): the renderer half. The main
 * process reports the window's state; this module flips the body class the
 * stylesheet hides the chrome on, hides an open sidebar, shows the exit hint,
 * and lets the chrome's own unclaimed Escape leave full screen.
 */

const { createDocument, createElement } = require('../../../test/helpers/fake-dom.js');

async function load({ platform = 'linux', overrides = {}, modalOpen = false } = {}) {
  jest.resetModules();
  jest.useFakeTimers();

  const hint = createElement('div');
  hint.hidden = true;
  const document = createDocument({ elementsById: { 'fullscreen-exit-hint': hint } });
  document.querySelector = jest.fn((selector) =>
    selector === 'dialog[open]' && modalOpen ? {} : null
  );
  global.document = document;

  let onChange = null;
  const keydown = [];
  const electronAPI = {
    onFullscreenChanged: jest.fn((cb) => {
      onChange = cb;
    }),
    toggleFullscreen: jest.fn(),
  };
  global.window = {
    electronAPI,
    addEventListener: jest.fn((type, handler) => {
      if (type === 'keydown') keydown.push(handler);
    }),
  };
  global.navigator = { platform: '', userAgent: '' };

  const shortcuts = await import('./shortcuts.js');
  shortcuts.configureShortcuts({ platform, overrides });
  const mod = await import('./browser-fullscreen.js');
  const setSidebarConcealed = jest.fn();
  const closeMenus = jest.fn();
  mod.initBrowserFullscreen({ setSidebarConcealed, closeMenus, platform });

  const press = (init = {}) => {
    const event = {
      key: 'Escape',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: jest.fn(),
      ...init,
    };
    keydown.forEach((handler) => handler(event));
    return event;
  };

  return {
    mod,
    hint,
    body: document.body,
    electronAPI,
    setSidebarConcealed,
    closeMenus,
    change: (state) => onChange(state),
    press,
  };
}

afterEach(() => {
  jest.useRealTimers();
  delete global.document;
  delete global.window;
  delete global.navigator;
});

describe('following the window into and out of full screen', () => {
  test('entering hides the chrome, the sidebar and any open menu; leaving restores', async () => {
    const t = await load();
    t.change(true);
    expect(t.body.classList.contains('browser-fullscreen')).toBe(true);
    expect(t.mod.isBrowserFullscreen()).toBe(true);
    expect(t.setSidebarConcealed).toHaveBeenLastCalledWith(true);
    expect(t.closeMenus).toHaveBeenCalledTimes(1);

    t.change(false);
    expect(t.body.classList.contains('browser-fullscreen')).toBe(false);
    expect(t.mod.isBrowserFullscreen()).toBe(false);
    expect(t.setSidebarConcealed).toHaveBeenLastCalledWith(false);
  });

  test('a repeated report of the same state changes nothing', async () => {
    const t = await load();
    t.change(false);
    expect(t.setSidebarConcealed).not.toHaveBeenCalled();
    t.change(true);
    t.change(true);
    expect(t.setSidebarConcealed).toHaveBeenCalledTimes(1);
    expect(t.closeMenus).toHaveBeenCalledTimes(1);
  });

  test('the exit hint names the live binding and goes away on its own', async () => {
    const t = await load();
    t.change(true);
    expect(t.hint.hidden).toBe(false);
    expect(t.hint.textContent).toBe('Press F11 or Esc to exit full screen');
    jest.advanceTimersByTime(t.mod.EXIT_HINT_MS);
    expect(t.hint.hidden).toBe(true);
  });

  test('the hint follows a remap and the platform format', async () => {
    const t = await load({ platform: 'darwin', overrides: { 'view.fullscreen': 'Cmd+Ctrl+F' } });
    t.change(true);
    expect(t.hint.textContent).toBe('Press ⌃⌘F or Esc to exit full screen');
  });

  test('leaving takes the hint down at once', async () => {
    const t = await load();
    t.change(true);
    t.change(false);
    expect(t.hint.hidden).toBe(true);
  });
});

describe("the chrome's Escape", () => {
  test('leaves full screen and is claimed', async () => {
    const t = await load();
    t.change(true);
    const event = t.press();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(t.electronAPI.toggleFullscreen).toHaveBeenCalledTimes(1);
  });

  test('does nothing outside full screen', async () => {
    const t = await load();
    const event = t.press();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(t.electronAPI.toggleFullscreen).not.toHaveBeenCalled();
  });

  test.each([
    ['a menu or the find bar already took it', { defaultPrevented: true }],
    ['it carries a modifier', { shiftKey: true }],
    ['an IME is composing', { isComposing: true }],
    ['it is another key', { key: 'Enter' }],
  ])('stands down when %s', async (_label, init) => {
    const t = await load();
    t.change(true);
    t.press(init);
    expect(t.electronAPI.toggleFullscreen).not.toHaveBeenCalled();
  });

  test('stands down for an open modal dialog', async () => {
    const t = await load({ modalOpen: true });
    t.change(true);
    t.press();
    expect(t.electronAPI.toggleFullscreen).not.toHaveBeenCalled();
  });
});
