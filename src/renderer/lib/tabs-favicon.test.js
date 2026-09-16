// What tabs.js does with the webview's own `page-favicon-updated` report
// (#75).
//
// Before #75 this event was honoured for internal pages only, and every
// external site's icon was discovered by the main process re-downloading the
// page URL — cookielessly, on top of the webview's cookied load — just to
// regex `<link rel="icon">` out of the HTML. The event already carries what
// that fetch was after, so it is now forwarded to navigation.js, which hands
// the URL to main; main fetches that icon and nothing else.
//
// Driven through the real tabs.js on the fake-DOM harness, dispatching the
// event on the webview element the module created, rather than calling an
// internal hook: the handler's internal/external split and its active-tab
// filter are exactly what a future edit could silently drop.

const { createDocument, createElement } = require('../../../test/helpers/fake-dom.js');

const originalWindow = global.window;
const originalDocument = global.document;

const HOME_URL = 'freedom://home';
const INTERNAL_PAGE = 'file:///app/pages/history.html';
const EXTERNAL_PAGE = 'https://shop.example/items/42';

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const createWebview = (createdWebviews) => {
  const webview = createElement('webview');
  webview.getURL = jest.fn(() => webview.src || 'about:blank');
  webview.canGoBack = jest.fn(() => false);
  webview.canGoForward = jest.fn(() => false);
  webview.focus = jest.fn();
  createdWebviews.push(webview);
  return webview;
};

const loadTabs = async () => {
  jest.resetModules();

  const createdWebviews = [];
  const document = createDocument({
    elementsById: {
      'tab-bar': createElement('div'),
      'new-tab-btn': createElement('button'),
      'webview-container': createElement('div'),
      'tab-context-menu': createElement('div'),
      'bzz-webview': createElement('webview'),
      'address-input': createElement('input'),
    },
    createElementOverride: (tagName) =>
      tagName === 'webview' ? createWebview(createdWebviews) : createElement(tagName),
  });

  global.window = {
    electronAPI: {
      setWindowTitle: jest.fn(),
      updateTabMenuState: jest.fn(),
      closeWindow: jest.fn(),
      getWebviewPreloadPath: jest.fn().mockResolvedValue('/tmp/webview-preload.js'),
      // No cached icon: nothing else can paint the strip during these tests.
      getCachedFavicon: jest.fn().mockResolvedValue(''),
    },
    innerWidth: 800,
    innerHeight: 600,
    location: { href: 'file:///app/index.html', search: '' },
    addEventListener: jest.fn(),
  };
  global.document = document;

  jest.doMock('./debug.js', () => ({ pushDebug: jest.fn() }));
  jest.doMock('./menus.js', () => ({ closeMenus: jest.fn() }));
  jest.doMock('./bookmarks-ui.js', () => ({ hideBookmarkContextMenu: jest.fn() }));
  jest.doMock('./menu-backdrop.js', () => ({
    showMenuBackdrop: jest.fn(),
    hideMenuBackdrop: jest.fn(),
  }));
  jest.doMock('./page-context-menu.js', () => ({
    setupWebviewContextMenu: jest.fn(),
    notifyPageContextMenuNavigated: jest.fn(),
  }));
  jest.doMock('./link-status.js', () => ({
    clearLinkStatus: jest.fn(),
    clearHoverStatus: jest.fn(),
    showLinkStatus: jest.fn(),
    setLinkStatusSide: jest.fn(),
  }));
  jest.doMock('./page-urls.js', () => ({
    homeUrl: HOME_URL,
    getOnchainInterstitialTarget: () => null,
    internalPages: {},
    getInternalPageName: () => null,
    isNewTabPageUrl: (url) => url === HOME_URL || url === 'freedom://private',
    isNewTabPageName: (pageName) => pageName === 'home' || pageName === 'private',
  }));

  const tabs = await import('./tabs.js');
  const onWebviewEvent = jest.fn();
  tabs.setWebviewEventHandler(onWebviewEvent);
  await tabs.initTabs();
  await flushMicrotasks();

  return { tabs, onWebviewEvent, webview: createdWebviews[0], createdWebviews };
};

// Only the favicon forwards matter here; the harness's other lifecycle events
// (did-navigate, did-stop-loading…) go through the same handler.
const faviconForwards = (onWebviewEvent) =>
  onWebviewEvent.mock.calls.filter(([name]) => name === 'page-favicon-updated');

describe('tabs page-favicon-updated handling (#75)', () => {
  afterEach(() => {
    global.window = originalWindow;
    global.document = originalDocument;
    jest.restoreAllMocks();
  });

  test('an external page forwards the reported icon URL for fetching', async () => {
    const ctx = await loadTabs();
    ctx.webview.src = EXTERNAL_PAGE;

    ctx.webview.dispatch('page-favicon-updated', {
      favicons: [`${EXTERNAL_PAGE}/icon.png`, 'https://shop.example/apple-touch-icon.png'],
    });

    expect(faviconForwards(ctx.onWebviewEvent)).toEqual([
      [
        'page-favicon-updated',
        {
          tabId: ctx.tabs.getActiveTab().id,
          pageUrl: EXTERNAL_PAGE,
          // The first reported candidate, as Chromium orders them.
          iconUrl: `${EXTERNAL_PAGE}/icon.png`,
        },
      ],
    ]);
    // The remote URL is never painted into the strip directly: the strip
    // shows the per-domain cached copy main fetches and stores, so a chrome
    // <img> never dials the site itself.
    expect(ctx.tabs.getActiveTab().favicon).toBeFalsy();
  });

  test('an internal page paints its own icon and forwards nothing', async () => {
    const ctx = await loadTabs();
    ctx.webview.src = INTERNAL_PAGE;

    ctx.webview.dispatch('page-favicon-updated', {
      favicons: ['file:///app/pages/icons/history.png'],
    });

    expect(ctx.tabs.getActiveTab().favicon).toBe('file:///app/pages/icons/history.png');
    expect(faviconForwards(ctx.onWebviewEvent)).toHaveLength(0);
  });

  test('a background tab reports nothing for fetching', async () => {
    const ctx = await loadTabs();
    // A second tab opened in the background (#303): it is not the tab whose
    // address bar supplies the cache key, so its report is dropped — the
    // same as before #75, where only the foreground tab fetched an icon.
    ctx.tabs.createTab(EXTERNAL_PAGE, { background: true });
    await flushMicrotasks();
    const background = ctx.createdWebviews[ctx.createdWebviews.length - 1];
    background.src = EXTERNAL_PAGE;

    background.dispatch('page-favicon-updated', { favicons: [`${EXTERNAL_PAGE}/icon.png`] });

    expect(faviconForwards(ctx.onWebviewEvent)).toHaveLength(0);
  });

  test('an event with no favicons forwards nothing', async () => {
    const ctx = await loadTabs();
    ctx.webview.src = EXTERNAL_PAGE;

    ctx.webview.dispatch('page-favicon-updated', { favicons: [] });

    expect(faviconForwards(ctx.onWebviewEvent)).toHaveLength(0);
  });
});
