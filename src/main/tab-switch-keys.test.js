const { EventEmitter } = require('events');

// Next/Previous Tab are claimed in the browser process (#556). These tests
// drive the real `before-input-event` listener the module attaches, the way
// Electron calls it, rather than poking the matcher alone — the bug was a
// second press going missing, so every test presses more than once.

function load({ overrides = {}, mainWindows } = {}) {
  let mod;
  const settings = { shortcutOverrides: overrides };
  const chromeWindow = {
    isDestroyed: () => false,
    webContents: { send: jest.fn() },
  };
  const isMain = mainWindows || new Set([chromeWindow]);
  const fromWebContents = jest.fn((contents) => contents.__window || null);
  jest.isolateModules(() => {
    jest.doMock('electron', () => ({ BrowserWindow: { fromWebContents } }));
    jest.doMock('./settings-store', () => ({ loadSettings: () => settings }));
    jest.doMock('./windows/mainWindow', () => ({
      isMainBrowserWindow: (win) => isMain.has(win),
    }));
    mod = require('./tab-switch-keys');
  });
  return { mod, settings, chromeWindow, fromWebContents };
}

let nextId = 1;
function contentsMock({ hostWebContents = null, window = null } = {}) {
  const contents = new EventEmitter();
  contents.id = nextId++;
  contents.hostWebContents = hostWebContents;
  contents.__window = window;
  return contents;
}

// One press as Electron reports it to `before-input-event`.
function press(contents, input) {
  const event = { preventDefault: jest.fn() };
  contents.emit('before-input-event', event, { type: 'keyDown', ...input });
  return event;
}

const CMD_OPT_RIGHT = { key: 'ArrowRight', code: 'ArrowRight', meta: true, alt: true };
const CMD_OPT_LEFT = { key: 'ArrowLeft', code: 'ArrowLeft', meta: true, alt: true };

afterEach(() => {
  jest.resetModules();
  jest.dontMock('electron');
  jest.dontMock('./settings-store');
  jest.dontMock('./windows/mainWindow');
});

describe('matchTabSwitchInput', () => {
  const { mod } = load();
  const match = (input, overrides, platform) =>
    mod.matchTabSwitchInput({ type: 'keyDown', ...input }, overrides, platform);

  test('matches the registry defaults and fixed aliases', () => {
    expect(match({ key: 'PageDown', code: 'PageDown', control: true }, {}, 'darwin')).toBe(
      'tab:next'
    );
    expect(match({ key: 'PageUp', code: 'PageUp', control: true }, {}, 'linux')).toBe('tab:prev');
    expect(match({ key: 'Tab', code: 'Tab', control: true }, {}, 'win32')).toBe('tab:next');
    expect(match({ key: 'Tab', code: 'Tab', control: true, shift: true }, {}, 'linux')).toBe(
      'tab:prev'
    );
    expect(match({ key: '}', code: 'BracketRight', meta: true, shift: true }, {}, 'darwin')).toBe(
      'tab:next'
    );
    // Cmd+Shift+] is a macOS-only alias.
    expect(
      match({ key: '}', code: 'BracketRight', meta: true, shift: true }, {}, 'linux')
    ).toBeNull();
  });

  test('matches a Settings > Shortcuts remap (the #556 Cmd+Opt+Arrow binding)', () => {
    const overrides = { 'tab.next': 'Cmd+Alt+Right', 'tab.previous': 'Cmd+Alt+Left' };
    expect(match(CMD_OPT_RIGHT, overrides, 'darwin')).toBe('tab:next');
    expect(match(CMD_OPT_LEFT, overrides, 'darwin')).toBe('tab:prev');
    // The remap replaces the default primary chord; the aliases stay live.
    expect(match({ key: 'PageDown', code: 'PageDown', control: true }, overrides, 'darwin')).toBe(
      null
    );
    expect(match({ key: 'Tab', code: 'Tab', control: true }, overrides, 'darwin')).toBe('tab:next');
    // Without the remap the chord is nobody's.
    expect(match(CMD_OPT_RIGHT, {}, 'darwin')).toBeNull();
  });

  test('requires an exact modifier match', () => {
    const overrides = { 'tab.next': 'Cmd+Alt+Right' };
    expect(match({ ...CMD_OPT_RIGHT, shift: true }, overrides, 'darwin')).toBeNull();
    expect(match({ ...CMD_OPT_RIGHT, alt: false }, overrides, 'darwin')).toBeNull();
  });

  test('ignores key-ups, IME composition and non-key input', () => {
    const overrides = { 'tab.next': 'Cmd+Alt+Right' };
    expect(mod.matchTabSwitchInput({ type: 'keyUp', ...CMD_OPT_RIGHT }, overrides, 'darwin')).toBe(
      null
    );
    expect(
      mod.matchTabSwitchInput(
        { type: 'keyDown', isComposing: true, ...CMD_OPT_RIGHT },
        overrides,
        'darwin'
      )
    ).toBeNull();
    expect(mod.matchTabSwitchInput({ type: 'mouseDown' }, overrides, 'darwin')).toBeNull();
    expect(mod.matchTabSwitchInput(null, overrides, 'darwin')).toBeNull();
  });

  test('keeps cycling on auto-repeat, like Chrome', () => {
    expect(match({ key: 'Tab', code: 'Tab', control: true, isAutoRepeat: true }, {}, 'linux')).toBe(
      'tab:next'
    );
  });
});

describe('matchTabKeyInput: select tab by position (#717)', () => {
  const { mod } = load();
  const match = (input, overrides = {}, platform = 'linux') =>
    mod.matchTabKeyInput({ type: 'keyDown', ...input }, overrides, platform);
  const digit = (n, extra = {}) => ({ key: String(n), code: `Digit${n}`, ...extra });

  test('Cmd/Ctrl+1…8 select by position and Cmd/Ctrl+9 the last tab', () => {
    for (let n = 1; n <= 8; n++) {
      expect(match(digit(n, { control: true }), {}, 'linux')).toEqual({
        channel: 'tab:select',
        args: [n],
      });
      expect(match(digit(n, { control: true }), {}, 'win32')).toEqual({
        channel: 'tab:select',
        args: [n],
      });
      expect(match(digit(n, { meta: true }), {}, 'darwin')).toEqual({
        channel: 'tab:select',
        args: [n],
      });
    }
    expect(match(digit(9, { control: true }))).toEqual({ channel: 'tab:select', args: ['last'] });
    expect(match(digit(9, { meta: true }), {}, 'darwin')).toEqual({
      channel: 'tab:select',
      args: ['last'],
    });
    // Ctrl is not Cmd on macOS, and modifiers must match exactly.
    expect(match(digit(2, { control: true }), {}, 'darwin')).toBeNull();
    expect(match(digit(2, { control: true, shift: true }))).toBeNull();
    expect(match(digit(0, { control: true }))).toBeNull();
    // The matchTabSwitchInput shape still reports the channel.
    expect(
      mod.matchTabSwitchInput({ type: 'keyDown', ...digit(3, { control: true }) }, {}, 'linux')
    ).toBe('tab:select');
  });

  test('Alt+1…9 also select on Linux only, as in Chrome', () => {
    expect(match(digit(3, { alt: true }), {}, 'linux')).toEqual({
      channel: 'tab:select',
      args: [3],
    });
    expect(match(digit(9, { alt: true }), {}, 'linux')).toEqual({
      channel: 'tab:select',
      args: ['last'],
    });
    expect(match(digit(3, { alt: true }), {}, 'win32')).toBeNull();
    expect(match(digit(3, { alt: true }), {}, 'darwin')).toBeNull();
  });

  test('matches the physical digit key, so AZERTY needs no Shift', () => {
    expect(match({ key: '&', code: 'Digit1', control: true })).toEqual({
      channel: 'tab:select',
      args: [1],
    });
    expect(match({ key: 'é', code: 'Digit2', meta: true }, {}, 'darwin')).toEqual({
      channel: 'tab:select',
      args: [2],
    });
    expect(match({ key: 'ç', code: 'Digit9', control: true })).toEqual({
      channel: 'tab:select',
      args: ['last'],
    });
  });

  test("hands the AZERTY Ctrl+6 press (key '-') to Zoom Out and dispatches it", () => {
    // Zoom Out's own `-` binding: answered here with the menu item's message,
    // since with a page focused neither the menu accelerator (Chromium sees
    // VKEY_6) nor the chrome's keydown fallback would ever see it.
    const zoomOut = { channel: 'page:zoom-out', args: [] };
    expect(match({ key: '-', code: 'Digit6', control: true })).toEqual(zoomOut);
    expect(match({ key: '-', code: 'Digit6', control: true }, {}, 'win32')).toEqual(zoomOut);
    expect(match({ key: '-', code: 'Digit6', meta: true }, {}, 'darwin')).toEqual(zoomOut);
    // A US-layout Ctrl+6 is still Select Tab 6…
    expect(match(digit(6, { control: true }))).toEqual({ channel: 'tab:select', args: [6] });
    // …and once Zoom Out is remapped off `-`, the AZERTY press is the tab's.
    expect(
      match({ key: '-', code: 'Digit6', control: true }, { 'page.zoomOut': 'Ctrl+Shift+U' })
    ).toEqual({ channel: 'tab:select', args: [6] });
    // A press that is a remapped Zoom Out goes to Zoom Out too.
    expect(match(digit(6, { control: true }), { 'page.zoomOut': 'Ctrl+6' })).toEqual(zoomOut);
    // The Linux Alt+6 alias has no zoom sharing it.
    expect(match({ key: '-', code: 'Digit6', alt: true })).toEqual({
      channel: 'tab:select',
      args: [6],
    });
  });

  test("keeps the Czech Ctrl+1 press (key '+') for Select Tab 1", () => {
    // Czech's unshifted `1` key types `+`, which Zoom In accepts only through
    // its fixed `CmdOrCtrl+Plus` alias. Zoom In keeps its own `=` key there
    // (Czech `Minus` position); Select Tab 1 has no other key, so it wins.
    const czech1 = { key: '+', code: 'Digit1', control: true };
    expect(match(czech1)).toEqual({ channel: 'tab:select', args: [1] });
    expect(match({ ...czech1, control: false, meta: true }, {}, 'darwin')).toEqual({
      channel: 'tab:select',
      args: [1],
    });
    // Remapping Zoom In onto `+` makes the press its own binding again.
    expect(match(czech1, { 'page.zoomIn': 'Ctrl+Plus' })).toEqual({
      channel: 'page:zoom-in',
      args: [],
    });
  });

  test('follows a remap', () => {
    const overrides = { 'tab.select2': 'Ctrl+Alt+2', 'tab.selectLast': 'Ctrl+Shift+L' };
    expect(match(digit(2, { control: true }), overrides)).toBeNull();
    expect(match(digit(2, { control: true, alt: true }), overrides)).toEqual({
      channel: 'tab:select',
      args: [2],
    });
    // The Linux Alt alias stays live next to the remap.
    expect(match(digit(2, { alt: true }), overrides)).toEqual({ channel: 'tab:select', args: [2] });
    expect(match({ key: 'L', code: 'KeyL', control: true, shift: true }, overrides)).toEqual({
      channel: 'tab:select',
      args: ['last'],
    });
  });
});

describe('attachTabSwitchKeys', () => {
  const overrides = { 'tab.next': 'Cmd+Alt+Right', 'tab.previous': 'Cmd+Alt+Left' };

  test('every press from a focused tab page switches, not just the first', () => {
    const { mod, chromeWindow } = load({ overrides });
    const chrome = contentsMock({ window: chromeWindow });
    const guest = contentsMock({ hostWebContents: chrome });
    mod.attachTabSwitchKeys(guest, { platform: 'darwin' });

    const presses = [CMD_OPT_RIGHT, CMD_OPT_RIGHT, CMD_OPT_RIGHT, CMD_OPT_LEFT].map((input) =>
      press(guest, input)
    );

    expect(chromeWindow.webContents.send.mock.calls).toEqual([
      ['tab:next'],
      ['tab:next'],
      ['tab:next'],
      ['tab:prev'],
    ]);
    // Claimed before the page, the menu accelerator and the chrome's keydown
    // fallback — so one press is one switch.
    for (const event of presses) expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  test('claims Cmd/Ctrl+digit from a focused page and sends the position (#717)', () => {
    const { mod, chromeWindow } = load();
    const guest = contentsMock({ hostWebContents: contentsMock({ window: chromeWindow }) });
    mod.attachTabSwitchKeys(guest, { platform: 'darwin' });

    const presses = [2, 9, 5, 2].map((n) =>
      press(guest, { key: String(n), code: `Digit${n}`, meta: true })
    );

    expect(chromeWindow.webContents.send.mock.calls).toEqual([
      ['tab:select', 2],
      ['tab:select', 'last'],
      ['tab:select', 5],
      ['tab:select', 2],
    ]);
    for (const event of presses) expect(event.preventDefault).toHaveBeenCalledTimes(1);
    // The AZERTY `-` press is Zoom Out's: claimed here too and sent as the
    // menu item's message, since from a focused page neither the Ctrl+-
    // accelerator nor the chrome's keydown fallback would ever see it.
    const azerty6 = press(guest, { key: '-', code: 'Digit6', meta: true });
    expect(azerty6.preventDefault).toHaveBeenCalledTimes(1);
    expect(chromeWindow.webContents.send).toHaveBeenCalledTimes(5);
    expect(chromeWindow.webContents.send).toHaveBeenLastCalledWith('page:zoom-out');
  });

  test('also answers on the chrome renderer itself', () => {
    const { mod, chromeWindow } = load();
    const chrome = contentsMock({ window: chromeWindow });
    mod.attachTabSwitchKeys(chrome, { platform: 'linux' });

    press(chrome, { key: 'PageDown', code: 'PageDown', control: true });
    press(chrome, { key: 'PageUp', code: 'PageUp', control: true });

    expect(chromeWindow.webContents.send.mock.calls).toEqual([['tab:next'], ['tab:prev']]);
  });

  test('follows a remap made while the app is running', () => {
    const { mod, settings, chromeWindow } = load();
    const chrome = contentsMock({ window: chromeWindow });
    const guest = contentsMock({ hostWebContents: chrome });
    mod.attachTabSwitchKeys(guest, { platform: 'darwin' });

    expect(press(guest, CMD_OPT_RIGHT).preventDefault).not.toHaveBeenCalled();
    settings.shortcutOverrides = overrides;
    expect(press(guest, CMD_OPT_RIGHT).preventDefault).toHaveBeenCalled();
    expect(chromeWindow.webContents.send).toHaveBeenCalledWith('tab:next');
  });

  test('leaves every other key to the page', () => {
    const { mod, chromeWindow } = load({ overrides });
    const guest = contentsMock({ hostWebContents: contentsMock({ window: chromeWindow }) });
    mod.attachTabSwitchKeys(guest, { platform: 'darwin' });

    const event = press(guest, { key: 'ArrowRight', code: 'ArrowRight', meta: true });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(chromeWindow.webContents.send).not.toHaveBeenCalled();
  });

  test('does nothing outside a browser window (DevTools, a closing window)', () => {
    const { mod, chromeWindow } = load({ overrides, mainWindows: new Set() });
    const guest = contentsMock({ hostWebContents: contentsMock({ window: chromeWindow }) });
    const orphan = contentsMock();
    mod.attachTabSwitchKeys(guest, { platform: 'darwin' });
    mod.attachTabSwitchKeys(orphan, { platform: 'darwin' });

    expect(press(guest, CMD_OPT_RIGHT).preventDefault).not.toHaveBeenCalled();
    expect(press(orphan, CMD_OPT_RIGHT).preventDefault).not.toHaveBeenCalled();
    expect(chromeWindow.webContents.send).not.toHaveBeenCalled();
  });
});

describe('a Settings > Shortcuts recording', () => {
  const overrides = { 'tab.next': 'Cmd+Alt+Right' };

  function setup() {
    const ctx = load({ overrides });
    const chrome = contentsMock({ window: ctx.chromeWindow });
    const settingsPage = contentsMock({ hostWebContents: chrome });
    const otherTab = contentsMock({ hostWebContents: chrome });
    ctx.mod.attachTabSwitchKeys(settingsPage, { platform: 'darwin' });
    ctx.mod.attachTabSwitchKeys(otherTab, { platform: 'darwin' });
    return { ...ctx, settingsPage, otherTab };
  }

  test('lets the recording page receive the chord, and only while armed', () => {
    const { mod, chromeWindow, settingsPage, otherTab } = setup();

    mod.setShortcutRecording(settingsPage, true);
    expect(press(settingsPage, CMD_OPT_RIGHT).preventDefault).not.toHaveBeenCalled();
    expect(chromeWindow.webContents.send).not.toHaveBeenCalled();
    // Scoped to that page: another tab still switches.
    expect(press(otherTab, CMD_OPT_RIGHT).preventDefault).toHaveBeenCalled();
    expect(chromeWindow.webContents.send).toHaveBeenCalledTimes(1);

    mod.setShortcutRecording(settingsPage, false);
    expect(press(settingsPage, CMD_OPT_RIGHT).preventDefault).toHaveBeenCalled();
    expect(chromeWindow.webContents.send).toHaveBeenCalledTimes(2);
  });

  test('is disarmed when the page is replaced or goes away', () => {
    const { mod, chromeWindow, settingsPage } = setup();
    const LISTENED = ['did-navigate', 'did-fail-load', 'destroyed'];

    mod.setShortcutRecording(settingsPage, true);
    // A main-frame navigation that starts but never commits (Stop, a link
    // that becomes a download, an external-protocol link) leaves the page
    // and its armed recorder in place, so the chord still reaches it.
    settingsPage.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    settingsPage.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'https://x.test/a.zip', true);
    // Its own #hash routing and a subframe's failed load keep it armed too.
    settingsPage.emit('did-navigate-in-page', {}, 'file:///settings.html#shortcuts', true);
    settingsPage.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://x.test/', false);
    expect(mod._isRecording(settingsPage.id)).toBe(true);
    expect(press(settingsPage, CMD_OPT_RIGHT).preventDefault).not.toHaveBeenCalled();
    expect(chromeWindow.webContents.send).not.toHaveBeenCalled();

    // A committed main-frame cross-document navigation disarms.
    settingsPage.emit('did-navigate', {}, 'https://example.test/', 200, 'OK');
    expect(mod._isRecording(settingsPage.id)).toBe(false);
    for (const name of LISTENED) expect(settingsPage.listenerCount(name)).toBe(0);
    expect(press(settingsPage, CMD_OPT_RIGHT).preventDefault).toHaveBeenCalled();

    // So does an error page committed over it (a main-frame failure other
    // than ERR_ABORTED).
    mod.setShortcutRecording(settingsPage, true);
    settingsPage.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://x.test/', true);
    expect(mod._isRecording(settingsPage.id)).toBe(false);
    for (const name of LISTENED) expect(settingsPage.listenerCount(name)).toBe(0);

    mod.setShortcutRecording(settingsPage, true);
    settingsPage.emit('destroyed');
    expect(mod._isRecording(settingsPage.id)).toBe(false);
    for (const name of LISTENED) expect(settingsPage.listenerCount(name)).toBe(0);
  });

  test('re-arming does not stack listeners', () => {
    const { mod, settingsPage } = setup();
    for (let i = 0; i < 3; i++) {
      mod.setShortcutRecording(settingsPage, true);
      mod.setShortcutRecording(settingsPage, true);
      mod.setShortcutRecording(settingsPage, false);
    }
    for (const name of ['did-navigate', 'did-fail-load', 'destroyed']) {
      expect(settingsPage.listenerCount(name)).toBe(0);
    }
  });

  test('is set through the shortcuts:set-recording IPC from the sender', () => {
    const { mod, settingsPage } = setup();
    const handlers = new Map();
    mod.registerTabSwitchKeysIpc({ handle: (channel, fn) => handlers.set(channel, fn) });
    const handler = handlers.get('shortcuts:set-recording');

    handler({ sender: settingsPage }, true);
    expect(mod._isRecording(settingsPage.id)).toBe(true);
    handler({ sender: settingsPage }, false);
    expect(mod._isRecording(settingsPage.id)).toBe(false);
    // Only a literal `true` arms it.
    handler({ sender: settingsPage }, 'yes');
    expect(mod._isRecording(settingsPage.id)).toBe(false);
  });
});
