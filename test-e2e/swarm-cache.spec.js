// The Swarm node's cache (#579): the Nodes menu's Cache row, read from
// `GET /debugstore` by the main process, and Settings → Nodes → Swarm cache
// size.
//
// The harness runs no node. The Nodes menu group serves `/debugstore` from a
// fake antd and runs the real main-process cache service (swarm/ant-cache.js)
// against it, with the node's status, spawn time and data dir under the
// test's control, so every state the row has goes through the real parser and
// the real renderer. The Settings group drives the real picker; the restart
// path (a running node) is stubbed at its IPC, since there is no node to
// restart. Set SWARM_CACHE_SHOTS_DIR to keep a screenshot of every state in
// both themes.

const fs = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures');

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const SHOTS = process.env.SWARM_CACHE_SHOTS_DIR || null;

// Ant v0.5.60's `/debugstore` for `used`/`pinned` bytes under a `cap`.
const debugstore = ({ used = 0, pinned = 0, cap = 2 * GIB }) => ({
  Upload: { TotalUploaded: 0, TotalSynced: 0, PendingUpload: 0 },
  Pinning: { TotalCollections: pinned ? 1 : 0, TotalChunks: pinned / 4096 },
  Cache: { Size: used / 4096, Capacity: cap / 4096 },
  Reserve: { SizeWithinRadius: 0, TotalSize: 0, Capacity: 0, LastBinIDs: null, Epoch: 0 },
  ChunkStore: {
    TotalChunks: (used + pinned) / 4096,
    SharedSlots: 0,
    ReferenceCount: (used + pinned) / 4096,
  },
});

// A fake antd answering `/debugstore` with `globalThis.__debugstore` (an
// object, or `{ status, raw }` for a non-JSON / error answer), and the real
// cache service wired to it in place of the app's own.
async function wireFakeNode(electronApp, dataDir) {
  await electronApp.evaluate(async ({ ipcMain, BrowserWindow }, dir) => {
    const load = process.mainModule.require;
    const http = load('http');
    const { createAntCacheService } = load('./src/main/swarm/ant-cache');
    globalThis.__debugstore = null;
    globalThis.__antStatus = 'running';
    globalThis.__spawnedAt = null;
    globalThis.__debugstoreHits = 0;
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/debugstore') {
        globalThis.__debugstoreHits += 1;
        const answer = globalThis.__debugstore;
        if (answer && answer.raw !== undefined) {
          res.writeHead(answer.status, { 'Content-Type': 'text/plain' });
          res.end(answer.raw);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(answer));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"code":404}');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    globalThis.__fakeAntServer = server;
    const base = `http://127.0.0.1:${server.address().port}`;
    const svc = createAntCacheService({
      getNodeStatus: () => ({ status: globalThis.__antStatus, error: null }),
      getApiBase: () => base,
      getSpawnedAt: () => globalThis.__spawnedAt,
      getDataDir: () => dir,
    });
    const replace = (channel, handler) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, handler);
    };
    replace('ant:cache-status', () => svc.getStatus());
    // The menu's own 5 s status poll would otherwise read the harness's
    // stopped node and close the panel.
    replace('ant:getStatus', () => ({ status: globalThis.__antStatus, error: null }));
    globalThis.__pushAntStatus = () => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('ant:statusUpdate', { status: globalThis.__antStatus });
      }
    };
    globalThis.__pushAntStatus();
  }, dataDir);
}

async function feed(electronApp, { status = 'running', answer = null, spawnedAt = null }) {
  await electronApp.evaluate(
    (_e, s) => {
      globalThis.__antStatus = s.status;
      globalThis.__debugstore = s.answer;
      globalThis.__spawnedAt = s.spawnedAt === 'now' ? Date.now() : s.spawnedAt;
      globalThis.__pushAntStatus();
    },
    { status, answer, spawnedAt }
  );
}

async function openNodesMenu(window) {
  await window.locator('#bee-menu-button').click();
  await expect(window.locator('#bee-menu-dropdown')).toHaveClass(/\bopen\b/);
  await expect(window.locator('.bee-info')).toHaveClass(/\bvisible\b/);
}

async function closeNodesMenu(window) {
  await window.keyboard.press('Escape');
  await expect(window.locator('#bee-menu-dropdown')).not.toHaveClass(/\bopen\b/);
}

const setTheme = (window, theme) =>
  window.evaluate((t) => window.electronAPI.saveSettings({ theme: t }), theme);

async function shoot(target, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await target.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function shootMenu(window, name) {
  if (!SHOTS) return;
  for (const theme of ['dark', 'light']) {
    await setTheme(window, theme);
    await window.waitForTimeout(250);
    await shoot(window.locator('#bee-menu-dropdown'), `${theme}-menu-${name}`);
  }
}

test.describe('Nodes menu: the Swarm Cache row', () => {
  test('every state, through the real parser, against a fake antd', async ({
    electronApp,
    window,
  }, testInfo) => {
    const dataDir = testInfo.outputPath('ant-data');
    fs.mkdirSync(dataDir, { recursive: true });
    // A cache file from a previous run, big enough not to be an empty cache.
    fs.writeFileSync(path.join(dataDir, 'chunks.sqlite'), Buffer.alloc(2 * MIB));
    await wireFakeNode(electronApp, dataDir);

    const row = window.locator('#bee-cache-text');
    const note = window.locator('#bee-cache-note');

    // In use, with pinned content.
    await feed(electronApp, { answer: debugstore({ used: 1.3 * GIB, pinned: 120 * MIB }) });
    await openNodesMenu(window);
    await expect(row).toHaveText('1.3 GB of 2 GB · 120 MB pinned');
    await expect(note).toBeHidden();
    await shootMenu(window, 'in-use-pinned');

    // Polled while open: the next reading lands without reopening the menu.
    await feed(electronApp, { answer: debugstore({ used: 300 * MIB }) });
    await expect(row).toHaveText('300 MB of 2 GB', { timeout: 6_000 });
    await shootMenu(window, 'in-use');

    // The disk cache couldn't be opened.
    await feed(electronApp, { answer: debugstore({ cap: 0 }) });
    await expect(row).toHaveText('Unavailable', { timeout: 6_000 });
    await expect(note).toBeVisible();
    await expect(note).toHaveText(/couldn't open its disk cache/);
    await shootMenu(window, 'disk-off');

    // Ant still counting the cache it just opened.
    await feed(electronApp, { answer: debugstore({ used: 0 }), spawnedAt: 'now' });
    await expect(row).toHaveText('Counting… (2 GB max)', { timeout: 6_000 });
    await expect(note).toHaveText(/still counting/);
    await shootMenu(window, 'counting');

    // The same all-zero answer from a node spawned long ago is a real empty cache.
    await feed(electronApp, { answer: debugstore({ used: 0 }), spawnedAt: 1 });
    await expect(row).toHaveText('0 B of 2 GB', { timeout: 6_000 });
    await expect(note).toBeHidden();

    // A node without the route, and garbage.
    await feed(electronApp, { answer: { status: 404, raw: '{"code":404}' } });
    await expect(row).toHaveText('Unknown', { timeout: 6_000 });
    await expect(note).toHaveText(/doesn't report its cache/);
    await shootMenu(window, 'unreadable');
    await feed(electronApp, { answer: { status: 200, raw: '<html>not json' } });
    await expect(row).toHaveText('Unknown', { timeout: 6_000 });

    // Starting: no figure yet, says so.
    await feed(electronApp, { status: 'starting', answer: debugstore({ used: GIB }) });
    await expect(row).toHaveText('Starting…', { timeout: 6_000 });
    await shootMenu(window, 'starting');

    // Stopped: the Swarm details hide, and the node is not asked.
    await feed(electronApp, { status: 'stopped', answer: debugstore({ used: GIB }) });
    await expect(window.locator('.bee-info')).not.toHaveClass(/\bvisible\b/);
    const hits = await electronApp.evaluate(() => globalThis.__debugstoreHits);
    await window.waitForTimeout(3_500);
    expect(await electronApp.evaluate(() => globalThis.__debugstoreHits)).toBe(hits);
    await expect(row).toHaveText('Unknown');

    // Closing the menu stops the polling.
    await feed(electronApp, { answer: debugstore({ used: GIB }) });
    await expect(row).toHaveText('1 GB of 2 GB', { timeout: 6_000 });
    await closeNodesMenu(window);
    const closedHits = await electronApp.evaluate(() => globalThis.__debugstoreHits);
    await window.waitForTimeout(3_500);
    expect(await electronApp.evaluate(() => globalThis.__debugstoreHits)).toBe(closedHits);

    await electronApp.evaluate(() => globalThis.__fakeAntServer.close());
  });
});

// -----------------------------------------------------------------------------
// Settings → Nodes → Swarm cache size
// -----------------------------------------------------------------------------

async function openNodesSettings(window, electronApp) {
  const input = window.locator('[data-test="address-input"]');
  await input.click();
  await input.fill('freedom://settings/nodes');
  await input.press('Enter');
  let page;
  await expect
    .poll(() => {
      page = electronApp.windows().find((p) => p.url().includes('/pages/settings.html'));
      return Boolean(page);
    })
    .toBe(true);
  await expect(page.locator('#swarm-cache-row')).toBeVisible();
  return page;
}

// Replaces the picker's two IPC handlers: `view` is what the main process
// reports, and a set records the size and answers `answer`.
async function stubCacheIpc(electronApp, { view, answer }) {
  await electronApp.evaluate(
    ({ ipcMain }, s) => {
      globalThis.__cacheView = s.view;
      globalThis.__cacheSets = [];
      const replace = (channel, handler) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, handler);
      };
      replace('ant:cache-get-settings', () => globalThis.__cacheView);
      replace('ant:cache-set-size', (_e, bytes) => {
        globalThis.__cacheSets.push(bytes);
        globalThis.__cacheView = { ...globalThis.__cacheView, bytes };
        // Saved as the real handler does, so the settings broadcast agrees.
        if (s.answer.ok) {
          process.mainModule
            .require('./src/main/settings-store')
            .saveSettings({ antCacheCapacityBytes: bytes });
        }
        return s.answer;
      });
    },
    { view, answer }
  );
}

const SIZES = [
  [512 * MIB, '512 MB'],
  [GIB, '1 GB'],
  [2 * GIB, '2 GB (default)'],
  [5 * GIB, '5 GB'],
  [10 * GIB, '10 GB'],
  [16 * GIB, '16 GB'],
].map(([bytes, label]) => ({ bytes, label }));

async function shootSettings(window, page, name) {
  if (!SHOTS) return;
  for (const theme of ['dark', 'light']) {
    await setTheme(window, theme);
    await page.evaluate(() => {
      const row = document.getElementById('swarm-cache-row');
      let box = row.parentElement;
      while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) {
        box = box.parentElement;
      }
      const scroller = box || document.scrollingElement;
      scroller.scrollTop += row.getBoundingClientRect().top - 260;
    });
    await page.waitForTimeout(300);
    // The settings page's own viewport: an element shot inside the webview
    // is not scrolled to.
    await shoot(page, `${theme}-settings-${name}`);
  }
}

test.describe('Settings: Swarm cache size', () => {
  test('the real picker: six sizes, 2 GB default, saved when the node is off', async ({
    electronApp,
    window,
  }) => {
    const page = await openNodesSettings(window, electronApp);
    const select = page.locator('#swarm-cache-size');
    await expect(select).toBeEnabled();
    await expect(page.locator('label[for="swarm-cache-size"]')).toHaveText('Swarm cache size');
    await expect(select.locator('option')).toHaveText(SIZES.map((s) => s.label));
    await expect(select).toHaveValue(String(2 * GIB));
    await shootSettings(window, page, 'picker');

    // The harness runs no node: nothing restarts, so nothing asks first.
    let asked = false;
    page.on('dialog', (dialog) => {
      asked = true;
      dialog.dismiss();
    });
    await select.selectOption(String(GIB));
    await expect(page.locator('#swarm-cache-status')).toHaveText(
      'Swarm cache set to 1 GB. It applies the next time the Swarm node starts.'
    );
    expect(asked).toBe(false);
    const saved = await window.evaluate(() => window.electronAPI.getSettings());
    expect(saved.antCacheCapacityBytes).toBe(GIB);
    await expect(select).toHaveValue(String(GIB));
  });

  test('settings search finds it by cache, storage and disk space', async ({
    electronApp,
    window,
  }) => {
    const page = await openNodesSettings(window, electronApp);
    const field = page.locator('#settings-search');
    for (const query of ['cache', 'storage', 'disk space']) {
      await field.click();
      await field.fill('');
      await field.pressSequentially(query);
      await expect(page.locator('#settings-search-results')).toBeVisible();
      const hit = page
        .locator('#settings-search-list .settings-search-result')
        .filter({ hasText: 'Swarm cache size' });
      await expect(hit).toHaveCount(1);
      await expect(hit.locator('.settings-search-section')).toHaveText('Nodes');
    }
  });

  test('with the node running it asks first, saying it restarts the Swarm node', async ({
    electronApp,
    window,
  }) => {
    await stubCacheIpc(electronApp, {
      view: {
        bytes: 2 * GIB,
        defaultBytes: 2 * GIB,
        sizes: SIZES,
        managed: true,
        reason: '',
        nodeActive: true,
      },
      answer: { ok: true, restarted: true },
    });
    const page = await openNodesSettings(window, electronApp);
    const select = page.locator('#swarm-cache-size');
    await expect(select).toHaveValue(String(2 * GIB));

    // Cancel: the old size comes back and nothing is applied.
    const messages = [];
    let accept = false;
    page.on('dialog', (dialog) => {
      messages.push(dialog.message());
      return accept ? dialog.accept() : dialog.dismiss();
    });
    await select.selectOption(String(512 * MIB));
    await expect.poll(() => messages.length).toBe(1);
    expect(messages[0]).toContain('Set the Swarm cache to 512 MB?');
    expect(messages[0]).toContain('This restarts the Swarm node.');
    await expect(select).toHaveValue(String(2 * GIB));
    expect(await electronApp.evaluate(() => globalThis.__cacheSets)).toEqual([]);

    // OK: applied, and the row says the node restarted.
    accept = true;
    await select.selectOption(String(5 * GIB));
    await expect(page.locator('#swarm-cache-status')).toHaveText(
      'Swarm cache set to 5 GB. The Swarm node restarted.'
    );
    expect(await electronApp.evaluate(() => globalThis.__cacheSets)).toEqual([5 * GIB]);
    await expect(select).toHaveValue(String(5 * GIB));
    await expect(select).toBeEnabled();
    await shootSettings(window, page, 'restarted');
  });

  test('a node Freedom does not run: disabled, with the reason', async ({
    electronApp,
    window,
  }) => {
    const reason = "Freedom doesn't run this Swarm node. Set its cache size where it runs.";
    await stubCacheIpc(electronApp, {
      view: {
        bytes: 2 * GIB,
        defaultBytes: 2 * GIB,
        sizes: SIZES,
        managed: false,
        reason,
        nodeActive: false,
      },
      answer: { ok: false, error: reason },
    });
    const page = await openNodesSettings(window, electronApp);
    await expect(page.locator('#swarm-cache-size')).toBeDisabled();
    await expect(page.locator('#swarm-cache-status')).toHaveText(reason);
    await expect(page.locator('#swarm-cache-row')).toHaveClass(/\bdisabled\b/);
    await shootSettings(window, page, 'external');
  });
});
