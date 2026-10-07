// Tab audio indicator + click-to-mute — mute via the tab context menu,
// unmute via the on-tab speaker button, and the menu label round-trip.

const { test, expect, hoverOverGuest } = require('./fixtures');

// Right-click a tab and click one of its context-menu actions, exactly once.
// The menu opens over the tab's `<webview>`, so the pointer is first put on the
// item until the browser routes it to the chrome (`hoverOverGuest`). A stray
// window blur (e.g. the previous Electron instance releasing OS focus) can
// close the menu at any point up to the click; only the *opening* is re-done
// for that — an open menu is never reopened (its backdrop would take the
// right-click). The click sits inside the retry too: a Playwright click that
// throws never dispatched (it only sends input once its actionability checks
// pass, and here nothing runs after it), so retrying it cannot act twice.
// `hoverOverGuest`'s 5 s covers its presentation wait as well, so one stalled
// frame still leaves the outer 15 s room to reopen the menu.
async function clickTabContextAction(window, tabLocator, action) {
  const menu = window.locator('#tab-context-menu');
  const item = menu.locator(`[data-action="${action}"]`);
  await expect(async () => {
    if (!(await menu.isVisible())) {
      await tabLocator.click({ button: 'right' });
      await expect(menu).toBeVisible({ timeout: 1000 });
    }
    await hoverOverGuest(item, { timeout: 5000 });
    try {
      await item.click({ timeout: 1000 });
    } catch (error) {
      if (!(await menu.isVisible())) {
        throw new Error(
          `#tab-context-menu closed before "${action}" was clicked (stray window blur?): ${error.message}`,
          { cause: error }
        );
      }
      throw error;
    }
  }).toPass({ timeout: 15_000 });
}

test('Mute Tab context-menu item toggles the muted indicator', async ({ window }) => {
  const tab = window.locator('[data-test="tab"]').first();
  const audioBtn = tab.locator('[data-test="tab-audio"]');

  // No audio state initially: indicator hidden.
  await expect(audioBtn).toBeHidden();

  // Muted via the context menu: indicator shows the muted speaker even
  // without audio playing.
  await clickTabContextAction(window, tab, 'mute');
  await expect(tab).toHaveAttribute('data-audio-state', 'muted');
  await expect(audioBtn).toBeVisible();

  // Clicking the indicator unmutes (and hides it again — nothing audible).
  await audioBtn.click();
  await expect(audioBtn).toBeHidden();

  // Menu label reflects the unmuted state again.
  const muteItem = window.locator('#tab-context-menu [data-action="mute"]');
  await expect(async () => {
    await tab.click({ button: 'right' });
    await expect(muteItem).toHaveText('Mute Tab', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await window.keyboard.press('Escape');
});

test('a muted pinned tab still shows the audio badge', async ({ window }) => {
  const tab = window.locator('[data-test="tab"]').first();
  const audioBtn = tab.locator('[data-test="tab-audio"]');

  await clickTabContextAction(window, tab, 'pin');
  await expect(tab).toHaveClass(/pinned/);

  // Muting a pinned tab must keep an indicator visible — the fixed 36px
  // width hides the inline button, so the badge overlay takes over.
  await clickTabContextAction(window, tab, 'mute');
  await expect(tab).toHaveAttribute('data-audio-state', 'muted');
  await expect(audioBtn).toBeVisible();

  // The badge is still a working mute toggle.
  await audioBtn.click();
  await expect(audioBtn).toBeHidden();
});
