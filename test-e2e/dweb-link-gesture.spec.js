// Dweb new-tab gesture gate (docs/security-audit-electron.md, O-12), in real
// Chromium. webview-preload.js intercepts `ipfs:`/`ipns:`/`web3:` link
// activations before Chromium's own popup handling sees them, so it has to
// apply the popup blocker's rules itself:
//
//   - a new tab needs a user gesture, and one gesture opens one tab (Chromium
//     consumes the activation when it lets a popup through);
//   - a named target that already names a tab may be navigated without a
//     gesture (no popup is created), in place and without taking focus.
//
// The unit suite models `isTrusted`/`navigator.userActivation`; this spec
// proves the real events carry them: a trusted mousedown reaches the
// preload's window-capture listener, and a script's `.click()` inside a real
// click handler is untrusted but activated.

const { test, expect, SAMPLE_BZZ_HASH } = require('./fixtures');
const { evalInWebview } = require('./permission-fixtures');
const { cidV0ToV1Base32 } = require('../src/shared/cid-utils');

const FIXTURE_URL = `bzz://${SAMPLE_BZZ_HASH}`;
const CIDS = [
  'QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR',
  'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn',
].map((cid) => `ipfs://${cidV0ToV1Base32(cid)}/`);

const FIXTURE_BODY = [
  '<!doctype html><title>dweb gesture fixture</title>',
  '<style>a, button { display: block; font-size: 24px; margin: 16px; }</style>',
  ...CIDS.map((url, i) => `<a id="blank${i}" target="_blank" href="${url}">blank ${i}</a>`),
  `<a id="named" target="viewer" href="${CIDS[0]}">viewer: first</a>`,
  `<a id="named2" target="viewer" href="${CIDS[1]}">viewer: second</a>`,
  // One real click, three scripted Ctrl+clicks riding on it. Background tabs
  // on purpose: the host only acts on link messages from the *active* tab
  // (tabs.js), so a foreground `_blank` burst stops itself after the first
  // tab takes over; a background burst leaves the opener active and is the
  // shape that actually floods the tab strip.
  '<button id="burst" onclick="for (let i = 0; i < 3; i++) ' +
    'document.getElementById(`blank${i}`).dispatchEvent(new MouseEvent(`click`, ' +
    '{ bubbles: true, cancelable: true, ctrlKey: true, button: 0 }))">burst</button>',
  '<div id="out">ready</div>',
].join('\n');

const tabCount = (window) => window.locator('[data-test="tab"]').count();

const guestUrls = (electronApp) =>
  electronApp.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((wc) => wc.getType() === 'webview')
      .map((wc) => wc.getURL())
  );

async function gotoFixture(window, electronApp) {
  await electronApp.evaluate(
    (_e, { fixtures }) => {
      for (const [url, body] of fixtures) {
        globalThis.__FREEDOM_TEST_HARNESS__.setContentFixture(url, { body });
      }
    },
    {
      fixtures: [
        [`${FIXTURE_URL}/`, FIXTURE_BODY],
        ...CIDS.map((url, i) => [url, `<!doctype html><title>target ${i}</title><p>target ${i}`]),
      ],
    }
  );
  const input = window.locator('[data-test="address-input"]');
  await input.click();
  await input.fill(FIXTURE_URL);
  await input.press('Enter');
  await expect
    .poll(() => evalInWebview(window, "document.getElementById('out')?.textContent || null"), {
      timeout: 10_000,
    })
    .toBe('ready');
}

// A real click: mouse events sent to the guest's own webContents, so Chromium
// marks them trusted and grants the frame user activation.
async function realClick(window, electronApp, id) {
  const box = await evalInWebview(
    window,
    `(() => { const r = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();
      return { x: Math.round(r.left + 10), y: Math.round(r.top + r.height / 2) }; })()`
  );
  expect(box).not.toBeNull();
  await electronApp.evaluate(
    ({ webContents }, { x, y, prefix }) => {
      const guest = webContents
        .getAllWebContents()
        .find((wc) => wc.getType() === 'webview' && wc.getURL().startsWith(prefix));
      if (!guest) throw new Error('fixture guest not found');
      guest.sendInputEvent({ type: 'mouseMove', x, y });
      guest.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      guest.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    },
    { ...box, prefix: FIXTURE_URL }
  );
}

test('one real click opens one dweb tab, however many links the page clicks in it', async ({
  window,
  electronApp,
}) => {
  await gotoFixture(window, electronApp);
  expect(await tabCount(window)).toBe(1);

  await realClick(window, electronApp, 'burst');
  await expect.poll(() => tabCount(window), { timeout: 5_000 }).toBe(2);
  // Background tab: the opener is still the active tab.
  await expect(window.locator('[data-test="tab"]').first()).toHaveClass(/(^|\s)active(\s|$)/);
  // Give any further (wrongly allowed) opens time to land.
  await window.waitForTimeout(1_000);
  expect(await tabCount(window)).toBe(2);
  await window.screenshot({ path: `${process.env.TMPDIR || '/tmp'}/dweb-gesture-burst.png` });

  // A second real click is a new gesture and buys exactly one more.
  await realClick(window, electronApp, 'burst');
  await expect.poll(() => tabCount(window), { timeout: 5_000 }).toBe(3);
  await window.waitForTimeout(1_000);
  expect(await tabCount(window)).toBe(3);
});

test('a gesture-less named-target link navigates the existing named tab but never opens one', async ({
  window,
  electronApp,
}) => {
  await gotoFixture(window, electronApp);

  // No "viewer" tab yet: a scripted click (executeJavaScript carries no
  // gesture) opens nothing.
  await evalInWebview(window, "document.getElementById('named').click(); 'ok'");
  await window.waitForTimeout(1_000);
  expect(await tabCount(window)).toBe(1);

  // A real click opens (and names) it, in the foreground.
  await realClick(window, electronApp, 'named');
  await expect.poll(() => tabCount(window), { timeout: 5_000 }).toBe(2);
  await expect
    .poll(() => guestUrls(electronApp), { timeout: 10_000 })
    .toContainEqual(expect.stringContaining(CIDS[0].replace(/\/$/, '')));

  // Back on the opener, a scripted click on another target="viewer" link
  // re-navigates that tab, without opening a new one or switching to it.
  const opener = window.locator('[data-test="tab"]').first();
  await opener.click();
  await expect(opener).toHaveClass(/(^|\s)active(\s|$)/);
  await evalInWebview(window, "document.getElementById('named2').click(); 'ok'");
  await expect
    .poll(() => guestUrls(electronApp), { timeout: 10_000 })
    .toContainEqual(expect.stringContaining(CIDS[1].replace(/\/$/, '')));
  expect(await tabCount(window)).toBe(2);
  await expect(opener).toHaveClass(/(^|\s)active(\s|$)/);
  expect(await evalInWebview(window, "document.getElementById('out').textContent")).toBe('ready');
  await window.screenshot({ path: `${process.env.TMPDIR || '/tmp'}/dweb-gesture-named.png` });
});
