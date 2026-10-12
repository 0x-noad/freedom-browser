const { EventEmitter } = require('events');

// Browser full screen hides the chrome (#78): the main-process half. The
// window's own enter/leave events are reported to its chrome renderer, and an
// Escape typed into a tab's page leaves browser full screen. Both are driven
// through the real listeners the module attaches, the way Electron calls them.

function load({ mainWindows } = {}) {
  let mod;
  const fromWebContents = jest.fn((contents) => contents.__window || null);
  const isMain = () => mainWindows;
  jest.isolateModules(() => {
    jest.doMock('electron', () => ({ BrowserWindow: { fromWebContents } }));
    jest.doMock('./windows/mainWindow', () => ({
      isMainBrowserWindow: (win) => isMain().has(win),
    }));
    mod = require('./browser-fullscreen');
  });
  return mod;
}

function chromeWindow({ fullScreen = false } = {}) {
  const win = new EventEmitter();
  let state = fullScreen;
  win.isDestroyed = () => false;
  win.isFullScreen = () => state;
  win.setFullScreen = jest.fn((next) => {
    state = next;
  });
  win.webContents = new EventEmitter();
  win.webContents.send = jest.fn();
  win.webContents.isDestroyed = () => false;
  return win;
}

let nextId = 1;
function guestOf(win) {
  const contents = new EventEmitter();
  contents.id = nextId++;
  contents.hostWebContents = win ? { __window: win } : null;
  return contents;
}

function press(contents, input) {
  const event = { preventDefault: jest.fn() };
  contents.emit('before-input-event', event, { type: 'keyDown', key: 'Escape', ...input });
  return event;
}

describe('reporting full screen to the chrome', () => {
  test('every enter and leave is sent, whatever started it', () => {
    const win = chromeWindow();
    const mod = load({ mainWindows: new Set([win]) });
    mod.attachFullscreenChromeSync(win);

    win.isFullScreen = () => true;
    win.emit('enter-full-screen');
    win.isFullScreen = () => false;
    win.emit('leave-full-screen');

    expect(win.webContents.send.mock.calls).toEqual([
      ['window:fullscreen-changed', true],
      ['window:fullscreen-changed', false],
    ]);
  });

  test('a reloaded chrome is told the current state', () => {
    const win = chromeWindow({ fullScreen: true });
    const mod = load({ mainWindows: new Set([win]) });
    mod.attachFullscreenChromeSync(win);

    win.webContents.emit('did-finish-load');
    expect(win.webContents.send).toHaveBeenCalledWith('window:fullscreen-changed', true);
  });

  test('a destroyed window is not written to', () => {
    const win = chromeWindow();
    const mod = load({ mainWindows: new Set([win]) });
    mod.attachFullscreenChromeSync(win);
    win.isDestroyed = () => true;
    win.emit('leave-full-screen');
    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});

describe('Escape in a page', () => {
  test('leaves browser full screen and is claimed', () => {
    const win = chromeWindow({ fullScreen: true });
    const mod = load({ mainWindows: new Set([win]) });
    const guest = guestOf(win);
    mod.attachFullscreenEscape(guest);

    const event = press(guest);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(win.setFullScreen).toHaveBeenCalledWith(false);

    // Out of full screen the page has its Escape back.
    const next = press(guest);
    expect(next.preventDefault).not.toHaveBeenCalled();
    expect(win.setFullScreen).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['a key-up', { type: 'keyUp' }],
    ['another key', { key: 'Enter' }],
    ['a modified Escape', { shift: true }],
    ['an IME composition', { isComposing: true }],
  ])('ignores %s', (_label, input) => {
    const win = chromeWindow({ fullScreen: true });
    const mod = load({ mainWindows: new Set([win]) });
    const guest = guestOf(win);
    mod.attachFullscreenEscape(guest);

    const event = press(guest, input);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(win.setFullScreen).not.toHaveBeenCalled();
  });

  test("leaves a page's own Fullscreen API full screen to Chromium", () => {
    const win = chromeWindow({ fullScreen: true });
    const mod = load({ mainWindows: new Set([win]) });
    const guest = guestOf(win);
    mod.attachFullscreenEscape(guest);

    guest.emit('enter-html-full-screen');
    expect(press(guest).preventDefault).not.toHaveBeenCalled();
    expect(win.setFullScreen).not.toHaveBeenCalled();

    guest.emit('leave-html-full-screen');
    expect(press(guest).preventDefault).toHaveBeenCalled();
    expect(win.setFullScreen).toHaveBeenCalledWith(false);
  });

  test('ignores contents that are not a tab of one of our windows', () => {
    const win = chromeWindow({ fullScreen: true });
    const mod = load({ mainWindows: new Set() });
    const guest = guestOf(win);
    const orphan = guestOf(null);
    mod.attachFullscreenEscape(guest);
    mod.attachFullscreenEscape(orphan);

    expect(press(guest).preventDefault).not.toHaveBeenCalled();
    expect(press(orphan).preventDefault).not.toHaveBeenCalled();
    expect(win.setFullScreen).not.toHaveBeenCalled();
  });
});
