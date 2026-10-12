// Browser full screen hides the chrome (#78).
//
// F11, View → Enter Full Screen and the hamburger menu's full-screen button
// used to make only the *window* full screen, with the tab strip, toolbar,
// bookmarks bar and sidebar still stacked over the page. Now the chrome steps
// aside and the active tab's webview fills the window, and leaving full screen
// (the same three, plus Escape) puts back exactly the chrome that was there.
//
// Every entry point is driven for real: the toolbar button by a click, the
// View-menu item through the live application menu, F11 through the chrome's
// keydown fallback (synthetic CDP keys never reach native menu accelerators,
// see zoom.spec.js), and Escape in the page through `sendInputEvent` on the
// guest's own webContents — where `before-input-event` sees it, the same as an
// OS key press (see tab-switch-shortcut.spec.js).
//
// Under xvfb there is no window manager, so the window is not actually
// resized; Electron still enters full screen and fires the events the chrome
// follows, and the assertions are on the chrome's layout inside the window.

const { test, expect, SAMPLE_BZZ_HASH } = require('./fixtures');

const PAGE = `bzz://${SAMPLE_BZZ_HASH}/`;
const PAGE_BODY =
  '<!doctype html><title>Full screen fixture</title>' +
  '<p id="p">full screen fixture</p>' +
  '<script>window.escapes = 0; document.addEventListener("keydown", (e) => {' +
  ' if (e.key === "Escape") window.escapes++; });</script>';

const CHROME = {
  tabBar: '.title-bar',
  toolbar: '.toolbar',
  bookmarks: '[data-test="bookmarks-bar"]',
};

const windowFullScreen = (electronApp) =>
  electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());

const menuLabel = (electronApp) =>
  electronApp.evaluate(
    ({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('fullscreen')?.label ?? null
  );

const clickMenuItem = (electronApp, id) =>
  electronApp.evaluate(({ Menu }, itemId) => {
    Menu.getApplicationMenu()?.getMenuItemById(itemId)?.click();
  }, id);

// Where the active webview sits in the window, and how big the window is.
const layout = (window) =>
  window.evaluate(() => {
    const r = document.querySelector('webview:not(.hidden)').getBoundingClientRect();
    return {
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    };
  });

async function expectChromeHidden(window, electronApp) {
  await expect.poll(() => windowFullScreen(electronApp)).toBe(true);
  for (const selector of Object.values(CHROME)) {
    await expect(window.locator(selector)).toBeHidden();
  }
  await expect(window.locator('#sidebar')).toBeHidden();
  const box = await layout(window);
  expect(box.top).toBe(0);
  expect(box.left).toBe(0);
  expect(box.width).toBe(box.innerWidth);
  expect(box.height).toBe(box.innerHeight);
  await expect.poll(() => menuLabel(electronApp)).toBe('Exit Full Screen');
}

async function expectChromeShown(window, electronApp) {
  await expect.poll(() => windowFullScreen(electronApp)).toBe(false);
  await expect(window.locator(CHROME.tabBar)).toBeVisible();
  await expect(window.locator(CHROME.toolbar)).toBeVisible();
  const box = await layout(window);
  expect(box.top).toBeGreaterThan(0);
  await expect.poll(() => menuLabel(electronApp)).toBe('Enter Full Screen');
}

async function loadPage(window, harness) {
  await harness.setContentFixture(PAGE, { body: PAGE_BODY });
  const input = window.locator('[data-test="address-input"]');
  await input.click();
  await input.fill(PAGE);
  await input.press('Enter');
  await expect
    .poll(
      () =>
        window.evaluate(async () => {
          try {
            return await document
              .querySelector('webview:not(.hidden)')
              .executeJavaScript('document.title');
          } catch {
            return null;
          }
        }),
      { message: 'Waiting for the fixture page', timeout: 15_000 }
    )
    .toBe('Full screen fixture');
}

const pageEval = (window, script) =>
  window.evaluate(
    (src) => document.querySelector('webview:not(.hidden)').executeJavaScript(src),
    script
  );

// Escape pressed on the active tab's page, from the main process.
async function pressEscapeInPage(window, electronApp) {
  const guestId = await window.evaluate(() =>
    document.querySelector('webview:not(.hidden)').getWebContentsId()
  );
  await electronApp.evaluate(({ webContents }, id) => {
    const guest = webContents.fromId(id);
    guest.focus();
    guest.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    guest.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  }, guestId);
}

async function enterViaToolbarButton(window) {
  await window.locator('#menu-button').click();
  await window.locator('#fullscreen-btn').click();
}

test.describe('with the bookmarks bar on and the sidebar open', () => {
  test.use({ seedSettings: { showBookmarkBar: true, enableIdentityWallet: true } });

  test('the toolbar button hides all of it and leaving restores it as it was', async ({
    window,
    electronApp,
  }) => {
    await expect(window.locator(CHROME.bookmarks)).toBeVisible();
    await window.locator('#wallet-toggle-btn').click();
    await expect(window.locator('#sidebar')).not.toHaveClass(/collapsed/);
    // The panel slides open (a width transition); wait for it to settle.
    const sidebarWidth = () => window.locator('#sidebar').evaluate((el) => el.offsetWidth);
    await expect.poll(sidebarWidth).toBe(320);

    await enterViaToolbarButton(window);
    await expectChromeHidden(window, electronApp);
    // Hidden, not closed: the sidebar is still open underneath.
    await expect(window.locator('#sidebar')).not.toHaveClass(/collapsed/);
    await expect(window.locator('[data-test="fullscreen-exit-hint"]')).toHaveText(
      'Press F11 or Esc to exit full screen'
    );

    await clickMenuItem(electronApp, 'fullscreen');
    await expectChromeShown(window, electronApp);
    await expect(window.locator(CHROME.bookmarks)).toBeVisible();
    await expect(window.locator('#sidebar')).toBeVisible();
    await expect.poll(sidebarWidth).toBe(320);
    await expect(window.locator('[data-test="fullscreen-exit-hint"]')).toBeHidden();
  });

  test('a sidebar request in full screen shows the panel over the page', async ({
    window,
    electronApp,
  }) => {
    await window.locator('#wallet-toggle-btn').click();
    await expect(window.locator('#sidebar')).not.toHaveClass(/collapsed/);
    await clickMenuItem(electronApp, 'fullscreen');
    await expectChromeHidden(window, electronApp);

    // The shortcut (or an approval opening the panel) brings it back into
    // view rather than closing what the user cannot see.
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+Shift+W');
    await expect(window.locator('#sidebar')).toBeVisible();
    await expect(window.locator('#sidebar')).not.toHaveClass(/collapsed/);
    await expect(window.locator(CHROME.toolbar)).toBeHidden();
  });
});

test.describe('with the bookmarks bar off', () => {
  test.use({ seedSettings: { showBookmarkBar: false } });

  test('F11 enters and Escape in the chrome leaves; the bar stays off', async ({
    window,
    electronApp,
    harness,
  }) => {
    // On a real page: the new-tab page shows the bar whatever the setting.
    await loadPage(window, harness);
    await expect(window.locator(CHROME.bookmarks)).toBeHidden();
    await window.locator('[data-test="address-input"]').click();
    await window.keyboard.press('F11');
    await expectChromeHidden(window, electronApp);

    // The address bar went away with the toolbar, so the chrome's own
    // document now has the keyboard: its Escape leaves full screen.
    await window.keyboard.press('Escape');
    await expectChromeShown(window, electronApp);
    await expect(window.locator(CHROME.bookmarks)).toBeHidden();

    // F11 again leaves too.
    await window.locator('[data-test="address-input"]').click();
    await window.keyboard.press('F11');
    await expectChromeHidden(window, electronApp);
    await window.keyboard.press('F11');
    await expectChromeShown(window, electronApp);
  });
});

test('Escape in the page leaves full screen and is not also handed to the page', async ({
  window,
  electronApp,
  harness,
}) => {
  await loadPage(window, harness);
  await clickMenuItem(electronApp, 'fullscreen');
  await expectChromeHidden(window, electronApp);

  await pressEscapeInPage(window, electronApp);
  await expectChromeShown(window, electronApp);
  expect(await pageEval(window, 'window.escapes')).toBe(0);

  // Out of full screen, Escape is the page's again.
  await pressEscapeInPage(window, electronApp);
  await expect.poll(() => pageEval(window, 'window.escapes')).toBe(1);
  expect(await windowFullScreen(electronApp)).toBe(false);
});

test('Escape closes the find bar first and leaves full screen on the next press', async ({
  window,
  electronApp,
  harness,
}) => {
  await loadPage(window, harness);
  // The find bar sits over the page, not in the chrome, so it stays up.
  await window.locator('[data-test="address-input"]').click();
  await window.keyboard.press('ControlOrMeta+f');
  await expect(window.locator('[data-test="find-bar"]')).toBeVisible();
  await clickMenuItem(electronApp, 'fullscreen');
  await expectChromeHidden(window, electronApp);
  await expect(window.locator('[data-test="find-bar"]')).toBeVisible();

  await window.locator('[data-test="find-bar-input"]').press('Escape');
  await expect(window.locator('[data-test="find-bar"]')).toBeHidden();
  expect(await windowFullScreen(electronApp)).toBe(true);
  await expect(window.locator(CHROME.toolbar)).toBeHidden();

  // The find bar hands the keyboard back to the page; Escape there leaves.
  await pressEscapeInPage(window, electronApp);
  await expectChromeShown(window, electronApp);
});

test("a page's own Fullscreen API still works, inside browser full screen too", async ({
  window,
  electronApp,
  harness,
}) => {
  await loadPage(window, harness);
  const fullscreenElement = () =>
    pageEval(window, 'document.fullscreenElement ? document.fullscreenElement.id : null');
  const request = () =>
    window.evaluate(() =>
      document
        .querySelector('webview:not(.hidden)')
        .executeJavaScript(
          'document.getElementById("p").requestFullscreen().then(() => "ok")',
          true
        )
    );

  // From a normal window.
  expect(await request()).toBe('ok');
  await expect.poll(fullscreenElement).toBe('p');
  await pageEval(window, 'document.exitFullscreen()');
  await expect.poll(fullscreenElement).toBe(null);
  await expectChromeShown(window, electronApp);

  // From browser full screen: leaving the page's full screen keeps the
  // browser's, and the page's Escape is Chromium's to leave its own with.
  await clickMenuItem(electronApp, 'fullscreen');
  await expectChromeHidden(window, electronApp);
  expect(await request()).toBe('ok');
  await expect.poll(fullscreenElement).toBe('p');
  await pageEval(window, 'document.exitFullscreen()');
  await expect.poll(fullscreenElement).toBe(null);
  await expectChromeHidden(window, electronApp);
});

test("Escape in a page's own full screen leaves only that, not the browser's", async ({
  window,
  electronApp,
  harness,
}) => {
  await loadPage(window, harness);
  const fullscreenElement = () =>
    pageEval(window, 'document.fullscreenElement ? document.fullscreenElement.id : null');

  await clickMenuItem(electronApp, 'fullscreen');
  await expectChromeHidden(window, electronApp);
  expect(
    await window.evaluate(() =>
      document
        .querySelector('webview:not(.hidden)')
        .executeJavaScript(
          'document.getElementById("p").requestFullscreen().then(() => "ok")',
          true
        )
    )
  ).toBe('ok');
  await expect.poll(fullscreenElement).toBe('p');

  await pressEscapeInPage(window, electronApp);
  await expect.poll(fullscreenElement).toBe(null);
  await expectChromeHidden(window, electronApp);

  // The next one is the browser's.
  await pressEscapeInPage(window, electronApp);
  await expectChromeShown(window, electronApp);
});

test("Escape closes the page's context menu first, then leaves full screen", async ({
  window,
  electronApp,
  harness,
}) => {
  await loadPage(window, harness);
  await clickMenuItem(electronApp, 'fullscreen');
  await expectChromeHidden(window, electronApp);

  // A right-click in the page: the preload forwards it and the shell draws
  // the menu, which takes the keyboard while open (page-context-menu.js).
  await pageEval(
    window,
    `document.body.dispatchEvent(new MouseEvent('contextmenu',
      { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))`
  );
  const pageMenu = window.locator('#page-context-menu');
  await expect(pageMenu).toBeVisible();

  await window.keyboard.press('Escape');
  await expect(pageMenu).toBeHidden();
  expect(await windowFullScreen(electronApp)).toBe(true);
  await expect(window.locator(CHROME.toolbar)).toBeHidden();

  await pressEscapeInPage(window, electronApp);
  await expectChromeShown(window, electronApp);
});
