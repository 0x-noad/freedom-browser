/**
 * Data pane tests.
 *
 * The pane renders strings the SITE chose — JSON Pointer field paths from its own
 * `connect` request — inside the privileged shell renderer, so the property under
 * test is that none of them can become markup. A hand-rolled DOM (the pattern the
 * sibling wallet suites use; `jest-environment-jsdom` is not a dependency here)
 * would normally be a weak place to assert escaping, since it would only prove the
 * fake escapes. So `FakeElement` records `innerHTML` writes instead of emulating
 * them, and the assertions are about which API the module reaches for: a path that
 * survives as `textContent` cannot have been parsed, and `assertNoMarkupWrites`
 * fails on any interpolated `innerHTML` anywhere in a render.
 */

const originalWindow = global.window;
const originalDocument = global.document;

class FakeClassList {
  constructor() {
    this.classes = new Set();
  }

  add(...names) {
    for (const name of names) this.classes.add(name);
  }

  remove(...names) {
    for (const name of names) this.classes.delete(name);
  }

  contains(name) {
    return this.classes.has(name);
  }

  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.classes.has(name) : !!force;
    if (shouldAdd) this.classes.add(name);
    else this.classes.delete(name);
    return shouldAdd;
  }
}

/** Every `innerHTML` write any element received, in order. */
const markupWrites = [];

/**
 * A NodeList-like view over `items`: indexable, iterable, with `length`,
 * `item()`, `entries()` and `forEach` — and deliberately nothing else, so code
 * reaching for an Array method fails here exactly as it would in a browser.
 */
function nodeList(items) {
  const list = {
    length: items.length,
    item: (i) => items[i] ?? null,
    forEach: (fn, thisArg) => items.forEach((el, i) => fn.call(thisArg, el, i, list)),
    entries: () => items.entries(),
    keys: () => items.keys(),
    values: () => items.values(),
    [Symbol.iterator]: () => items[Symbol.iterator](),
  };
  items.forEach((el, i) => {
    list[i] = el;
  });
  return list;
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this._text = '';
    this.value = '';
    this.title = '';
    this.type = '';
    this.src = '';
    this.checked = false;
    this.disabled = false;
    this.onclick = null;
    this.onerror = null;
    this._className = '';
    this._innerHTML = '';
  }

  /**
   * Aggregated from descendants when there are any, the way the real DOM does —
   * a label built as `<input>` plus a text node reads back as its words. Setting
   * it replaces the children, also as the DOM does.
   */
  get textContent() {
    return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text;
  }

  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = value;
    this.classList.classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }

  // Recorded, never parsed. A test asserts on what was written, so an
  // interpolated value cannot slip through by the fake quietly not rendering it.
  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    markupWrites.push({ el: this, value: String(value) });
  }

  setAttribute(name, value) {
    this.attributes = this.attributes || {};
    this.attributes[name] = String(value);
    if (name === 'src') this.src = String(value);
  }

  removeAttribute(name) {
    if (this.attributes) delete this.attributes[name];
    if (name === 'src') this.src = '';
  }

  appendChild(child) {
    // Moves rather than duplicates when the node is already here, as the real
    // DOM does — the drag reorder relies on exactly that.
    this.children = this.children.filter((c) => c !== child);
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  replaceChildren(...next) {
    this.children = [...next];
    for (const child of next) child.parentNode = this;
  }

  /** Moves the node when it is already a child, as the real DOM does. */
  insertBefore(node, reference) {
    this.children = this.children.filter((c) => c !== node);
    const at = reference ? this.children.indexOf(reference) : -1;
    if (at === -1) this.children.push(node);
    else this.children.splice(at, 0, node);
    node.parentNode = this;
    return node;
  }

  /** Swap this node for another, in place — what a failed icon load does. */
  replaceWith(next) {
    const parent = this.parentNode;
    if (!parent) return;
    const at = parent.children.indexOf(this);
    if (at === -1) return;
    parent.children[at] = next;
    next.parentNode = parent;
    this.parentNode = null;
  }

  getBoundingClientRect() {
    return { top: 0, height: 0, bottom: 0, left: 0, width: 0, right: 0 };
  }

  remove() {
    this.removed = true;
  }

  /**
   * Depth-first, supporting only the selectors this module actually uses.
   *
   * Returns a NodeList-LIKE object, not an Array: a real NodeList has
   * `forEach`, `length` and iteration but NOT `some`/`map`/`filter`. Handing
   * back an Array once let `rows.some(...)` pass 35 tests here and throw in the
   * browser, which took the consent sheet down before it could open. The shape
   * is part of what is under test.
   */
  querySelectorAll(selector) {
    const match = (el) => {
      if (selector === 'input[type=checkbox]') return el.tagName === 'INPUT' && el.type === 'checkbox';
      if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
      return el.tagName === selector.toUpperCase();
    };
    const out = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (match(child)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return nodeList(out);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  addEventListener(event, handler, options) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
    // Which phase it asked for. This fake holds no tree, so it cannot
    // propagate a click from a child — a delegated listener is exercised by
    // firing on the element it was attached to, and the phase is asserted
    // separately: a capture listener still runs when the real target calls
    // stopPropagation, and a bubble one does not.
    if (options === true || (options && options.capture)) {
      this.captureListeners = this.captureListeners || new Set();
      this.captureListeners.add(handler);
    }
  }

  async fire(event, detail = {}) {
    const ev = { type: event, target: this, stopPropagation() {}, ...detail };
    const property = this[`on${event}`];
    if (typeof property === 'function') await property.call(this, ev);
    for (const handler of this.listeners.get(event) || []) {
      await handler(ev);
    }
  }

  /** Every descendant, for sweeping a rendered subtree. */
  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

/**
 * Fail if this render reached for markup with anything interpolated into it.
 * A static literal (the empty states) is allowed; a value is not.
 */
function assertNoMarkupWrites() {
  const interpolated = markupWrites.filter(({ value }) => value !== '' && !/^<div class="vault-empty">[^<>]*<\/div>$/.test(value));
  expect(interpolated.map((w) => w.value)).toEqual([]);
}

const ELEMENT_IDS = [
  'tab-data',
  'vault-locked-view',
  'vault-unlock-btn',
  'vault-list-view',
  'vault-detail-view',
  'vault-request-view',
  'vault-partition-list',
  'vault-usage-text',
  'vault-usage-bar-fill',
  'vault-export-btn',
  'vault-import-btn',
  'vault-clear-btn',
  'vault-detail-back',
  'vault-detail-site',
  'vault-detail-json',
  'vault-detail-delete',
  'vault-request-site',
  'vault-request-icon',
  'vault-request-favicon',
  'vault-request-fields',
  'vault-request-allow',
  'vault-request-deny',
  'vault-request-own',
  'vault-request-shared-note',
  'vault-request-foreign-block',
  'vault-detail-perms-header',
  'vault-detail-reads',
  'vault-detail-reads-group',
  'vault-detail-readers',
  'vault-detail-readers-group',
  'vault-connection-banner',
  'vault-connection-site',
  'vault-connection-fields',
  'vault-connection-manage',
  'address-input',
];

let els;
let vaultData;

function setupDom() {
  markupWrites.length = 0;
  els = new Map(ELEMENT_IDS.map((id) => [id, new FakeElement()]));
  global.document = {
    getElementById: (id) => els.get(id) || null,
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
    createTextNode: (text) => {
      const node = new FakeElement('#text');
      node.textContent = text;
      return node;
    },
    addEventListener: () => {},
  };
  vaultData = {
    getUsage: jest.fn().mockResolvedValue({ unlocked: true, totalBytes: 1024, partitionCount: 1 }),
    listPartitions: jest.fn().mockResolvedValue([]),
    getPartitionData: jest.fn().mockResolvedValue({ locked: false, bytes: 10, data: {} }),
    partitionForUrl: jest.fn().mockResolvedValue(null),
    deletePartition: jest.fn().mockResolvedValue({ deleted: true }),
    clearAll: jest.fn().mockResolvedValue({ cleared: true }),
    exportVault: jest.fn().mockResolvedValue({ saved: true }),
    importVault: jest.fn().mockResolvedValue({ imported: true, restoredGrants: 2 }),
    onConsentRequest: jest.fn(),
    onConsentCancelled: jest.fn(),
    respondConsent: jest.fn(),
    signalReady: jest.fn(),
    onPartitionChanged: jest.fn(),
    foreignGrantsFor: jest.fn().mockResolvedValue({ locked: false, reads: [], readers: [] }),
    setForeignReadEnabled: jest.fn().mockResolvedValue({ changed: true }),
  };
  global.window = { vaultData, confirm: () => true, electronAPI: {} };
}

afterEach(() => {
  global.window = originalWindow;
  global.document = originalDocument;
  jest.resetModules();
});

/** Render the detail view for one partition, the way a user reaches it. */
async function openDetail(partition) {
  const { initVaultData } = require('./vault-data.js');
  const api = initVaultData({});
  vaultData.listPartitions.mockResolvedValue([partition]);
  await api.refresh();
  const row = els.get('vault-partition-list').children[0];
  await row.children[0].fire('click'); // .vault-row-info
  await Promise.resolve();
  return els.get('vault-detail-site');
}

describe('detail view: the partition section', () => {
  beforeEach(setupDom);

  const partition = {
    namespace: 'web:shop.example',
    origin: 'https://shop.example',
    fields: [{ path: '/profile/displayName', read: true, write: false }],
    bytes: 1234,
  };

  test('is the same site row the list and the sheet use', async () => {
    const site = await openDetail(partition);

    // It stands where the namespace line and the field pills were: one item
    // for a site, wherever a site appears.
    expect(site.children).toHaveLength(1);
    expect(site.children[0].className).toBe('vault-row');
    expect(site.children[0].children.map((el) => el.className)).toEqual([
      'vault-row-info',
      'vault-row-open',
    ]);
    expect(site.children[0].children[0].children[0].textContent).toBe('https://shop.example');
    // The size and field count the list row shows, not a list of pointers.
    expect(site.children[0].children[0].children[1].textContent).toBe('1.2 KB · 1 field');
  });

  test('reopening replaces the row rather than appending', async () => {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({});
    vaultData.listPartitions.mockResolvedValue([
      partition,
      { ...partition, namespace: 'web:other.example', origin: 'https://other.example' },
    ]);
    await api.refresh();

    const list = els.get('vault-partition-list');
    await list.children[0].children[0].fire('click');
    await Promise.resolve();
    await list.children[1].children[0].fire('click');
    await Promise.resolve();

    const site = els.get('vault-detail-site');
    expect(site.children).toHaveLength(1);
    expect(site.children[0].children[0].children[0].textContent).toBe('https://other.example');
  });

  test("the site's own stored data cannot become markup", async () => {
    // The whole blob is site-chosen — keys and values both — and it is the one
    // thing on this screen the site writes. textContent, never innerHTML: the
    // shell renderer blocks injected handlers with `script-src 'self'` but
    // `img-src` is open, so interpolated markup here could beacon from the
    // privileged window.
    vaultData.getPartitionData.mockResolvedValue({
      locked: false,
      bytes: 10,
      data: { '<img src=https://attacker.example/beacon onerror=1>': '</pre><b>forged</b>' },
    });

    await openDetail(partition);
    await Promise.resolve();

    const json = els.get('vault-detail-json');
    expect(json.textContent).toContain('attacker.example/beacon');
    expect(json.descendants().some((el) => el.tagName === 'IMG')).toBe(false);
    expect(json.children).toHaveLength(0);
    assertNoMarkupWrites();
  });
});

// ---------------------------------------------------------------------------
// The consent sheet
// ---------------------------------------------------------------------------

const vaultCss = require('fs').readFileSync(require.resolve('../../styles/vault-data.css'), 'utf8');

/** The declarations inside the first rule whose selector is exactly `selector`. */
function ruleBodyFor(selector) {
  const escaped = selector.replace(/[.#]/g, (c) => `\\${c}`);
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(vaultCss);
  return match ? match[1] : null;
}

/** Raise a consent request and return the rendered groups. */
function showConsent(req) {
  const { initVaultData } = require('./vault-data.js');
  initVaultData({});
  const onRequest = vaultData.onConsentRequest.mock.calls[0][0];
  onRequest(req);
  return els.get('vault-request-fields');
}

const OWNER_NS = 'web:owner.example';

function request(extra = {}) {
  return {
    id: 'consent-1',
    origin: 'https://reader.example',
    namespace: 'web:reader.example',
    requestedScopes: [
      {
        methods: ['vault_getData', 'vault_getSharedData'],
        fields: [{ path: '/own/profile', read: true, write: true }],
      },
    ],
    foreignReads: [],
    ...extra,
  };
}

const owner = (extra = {}) => ({
  namespace: OWNER_NS,
  origin: 'https://owner.example',
  paths: ['/shared/displayName'],
  wholesale: false,
  known: true,
  ...extra,
});

const ownRows = () =>
  els.get('vault-request-own').children.filter((el) => el.classList.contains('vault-row'));
const readRows = () =>
  els.get('vault-request-fields').children.filter((el) => el.classList.contains('vault-req-read'));
const hostOfRow = (row) => row.children[0].children[0].textContent;
const metaOfRow = (row) => row.children[0].children[1].textContent;

describe('consent sheet: the partition being created', () => {
  beforeEach(setupDom);

  test('is the same site row the Data pane list uses', () => {
    showConsent(request());

    const rows = ownRows();
    expect(rows).toHaveLength(1);
    // Same class and same two-line shape as a list row, so the same site
    // renders identically in both places.
    expect(rows[0].className).toBe('vault-row');
    expect(rows[0].children[0].className).toBe('vault-row-info');
    // With its scheme: the partition is keyed by it, so the row names it.
    expect(hostOfRow(rows[0])).toBe('https://reader.example');
  });

  test('carries the same controls a list row does — the open button, and no more', () => {
    showConsent(request());

    const row = ownRows()[0];
    // The same item, buttons and all. What it must NOT grow is a control that
    // changes the decision: the partition is what Allow approves.
    expect(row.children.map((el) => el.className)).toEqual(['vault-row-info', 'vault-row-open']);
    expect(row.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
  });

  test('its open button opens the site asking, and decides nothing', async () => {
    const openInNewTab = jest.fn();
    const { initVaultData } = require('./vault-data.js');
    initVaultData({ openInNewTab });
    vaultData.onConsentRequest.mock.calls[0][0](request());

    await ownRows()[0].children[1].fire('click');

    expect(openInNewTab).toHaveBeenCalledWith('https://reader.example');
    // Looking at the site is not answering the sheet.
    expect(vaultData.respondConsent).not.toHaveBeenCalled();
  });

  test('its meta line is the list row\'s, with the partition still empty', () => {
    showConsent(request());
    // No data has been written yet, so the only honest size is zero; the field
    // count is what the site asked for.
    expect(metaOfRow(ownRows()[0])).toBe('0 B · 1 field');

    setupDom();
    showConsent(
      request({
        requestedScopes: [
          {
            methods: ['vault_getData'],
            fields: [
              { path: '/profile', read: true, write: false },
              { path: '/notes', read: true, write: false },
            ],
          },
        ],
      }),
    );
    expect(metaOfRow(ownRows()[0])).toBe('0 B · 2 fields');
  });

  test('is cleared on the way out', () => {
    showConsent(request());
    els.get('vault-request-deny').onclick();

    expect(els.get('vault-request-own').children).toHaveLength(0);
  });
});

describe('consent sheet: it cannot be left unanswered', () => {
  beforeEach(setupDom);

  /** Raise a request with the sidebar seams wired, as wallet-ui wires them. */
  function raise(extra = {}) {
    const hideOtherSubscreens = jest.fn();
    let hider = () => {};
    const { initVaultData } = require('./vault-data.js');
    initVaultData({
      hideOtherSubscreens,
      registerScreenHider: (fn) => {
        hider = fn;
      },
    });
    vaultData.onConsentRequest.mock.calls[0][0](request(extra));
    return { hideOtherSubscreens, hider: () => hider() };
  }

  test('takes the sidebar over the way the other prompts do', () => {
    const { hideOtherSubscreens } = raise();

    // It is a modal subscreen: whatever screen was up goes first, then this.
    expect(hideOtherSubscreens).toHaveBeenCalled();
    expect(els.get('vault-request-view').classList.contains('hidden')).toBe(false);
  });

  test('is a modal in the markup, with no way out but answering', () => {
    const html = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'index.html'),
      'utf8',
    );
    const open = html.slice(html.indexOf('id="vault-request-view"'));
    const tag = open.slice(0, open.indexOf('>'));
    // `.sidebar-modal` is what covers the tab bar, so the request cannot be
    // left behind a click into another tab — the bug this closes.
    expect(tag).toContain('sidebar-subscreen sidebar-modal');
    // Outside the Data tab panel, or it would be covered by nothing.
    expect(html.indexOf('id="vault-request-view"')).toBeGreaterThan(html.indexOf('id="tab-settings"'));
    // The sidebar's own content wrapper: it carries the inset and the scroll
    // every other subscreen has. Without it the sheet sat flush against the
    // sidebar's edges, which is what moving it out of the Data tab cost.
    expect(open.slice(0, open.indexOf('dapp-connect-origin'))).toContain('subscreen-content');
    // No back button and no header: Reject and Allow are the only exits.
    const sheet = open.slice(0, open.indexOf('id="vault-request-allow"'));
    expect(sheet).not.toContain('subscreen-header');
    expect(sheet).not.toContain('data-back');
  });

  test('something else taking the sidebar answers it, rather than hiding it', () => {
    const { hider } = raise();

    hider();

    // The page is waiting on this; a screen that disappears without an answer
    // is what pinned the site forever.
    expect(vaultData.respondConsent).toHaveBeenCalledWith('consent-1', {
      approved: false,
      reason: 'user denied',
    });
    expect(els.get('vault-request-view').classList.contains('hidden')).toBe(true);
  });

  test('our own transition is not a dismissal', () => {
    // `hideOtherSubscreens()` fires every hider, ours included. Answering on
    // the way IN would reject the request we are about to show.
    const hideOtherSubscreens = jest.fn();
    let hider = () => {};
    const { initVaultData } = require('./vault-data.js');
    initVaultData({
      hideOtherSubscreens: () => {
        hideOtherSubscreens();
        hider();
      },
      registerScreenHider: (fn) => {
        hider = fn;
      },
    });
    vaultData.onConsentRequest.mock.calls[0][0](request());

    expect(vaultData.respondConsent).not.toHaveBeenCalled();
    expect(els.get('vault-request-view').classList.contains('hidden')).toBe(false);
  });

  test('answering takes the sheet down and leaves the pane where it was', () => {
    raise();
    els.get('vault-request-allow').onclick();

    expect(els.get('vault-request-view').classList.contains('hidden')).toBe(true);
    expect(els.get('vault-request-own').children).toHaveLength(0);
  });

  test('main taking the request back clears the sheet WITHOUT answering', () => {
    raise();
    const cancelled = vaultData.onConsentCancelled.mock.calls[0][0];

    cancelled({ id: 'consent-1' });

    // The page that asked is gone; main has already settled it. Responding
    // would answer a round-trip nobody is holding.
    expect(vaultData.respondConsent).not.toHaveBeenCalled();
    expect(els.get('vault-request-view').classList.contains('hidden')).toBe(true);
    expect(els.get('vault-request-own').children).toHaveLength(0);
  });

  test('a cancel for a different request leaves the one on screen alone', () => {
    raise();
    vaultData.onConsentCancelled.mock.calls[0][0]({ id: 'consent-99' });

    expect(els.get('vault-request-view').classList.contains('hidden')).toBe(false);
  });
});

describe('consent sheet: the /shared note', () => {
  beforeEach(setupDom);

  const note = () => els.get('vault-request-shared-note');
  const asking = (fields) =>
    request({ requestedScopes: [{ methods: ['vault_getData', 'vault_setData'], fields }] });

  test('is shown when the site asked to write at or below /shared', () => {
    showConsent(asking([{ path: '/shared', read: true, write: true }]));
    expect(note().classList.contains('hidden')).toBe(false);

    setupDom();
    showConsent(asking([{ path: '/shared/displayName', read: true, write: true }]));
    expect(note().classList.contains('hidden')).toBe(false);
  });

  test('is absent when nothing it writes can be published', () => {
    // Read-only on /shared publishes nothing.
    showConsent(asking([{ path: '/shared', read: true, write: false }]));
    expect(note().classList.contains('hidden')).toBe(true);

    // A write somewhere else entirely.
    setupDom();
    showConsent(asking([{ path: '/profile', read: true, write: true }]));
    expect(note().classList.contains('hidden')).toBe(true);
  });

  test('a whole-document grant does NOT raise it', () => {
    // The empty pointer covers every path, but the engine's publish gate
    // refuses a write under /shared without a rule rooted there — so this
    // grant cannot publish, and saying it could would be false.
    showConsent(asking([{ path: '', read: true, write: true }]));
    expect(note().classList.contains('hidden')).toBe(true);
  });

  test('/sharedly is not /shared', () => {
    showConsent(asking([{ path: '/sharedly', read: true, write: true }]));
    expect(note().classList.contains('hidden')).toBe(true);
  });

  test('is hidden again on the way out', () => {
    showConsent(asking([{ path: '/shared', read: true, write: true }]));
    els.get('vault-request-deny').onclick();

    expect(note().classList.contains('hidden')).toBe(true);
  });

  test('it has air above it, and an info dot that actually renders', () => {
    // The dot of the `i` is a zero-length line; with the default butt cap it
    // draws nothing, which is why it looked like an undotted stroke.
    const rule = ruleBodyFor('#vault-request-shared-note svg');
    expect(rule).toMatch(/stroke-linecap:\s*round/);
    expect(rule).toMatch(/stroke-width:\s*2\.4/);
    expect(ruleBodyFor('#vault-request-shared-note')).toMatch(/margin-top:\s*14px/);
  });

  test('its copy says what the mark means, and marks /shared as code', () => {
    const html = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'index.html'),
      'utf8',
    );
    const open = '<div class="dapp-sign-warning hidden" id="vault-request-shared-note">';
    expect(html).toContain(open);
    const block = html.slice(html.indexOf(open), html.indexOf('vault-req-foreign-block'));
    expect(block.replace(/\s+/g, ' ')).toContain(
      'This site writes data marked <span class="vault-req-inline-path">/shared</span> into its partition. Other sites can read this data if you give them permission.',
    );
    // Blue and the info glyph: this says what the access means, not what it
    // risks (docs/agent-playbooks/ui-consistency.md).
    expect(block).toContain('<circle cx="12" cy="12" r="10" />');
  });
});

describe('consent sheet: the read-access section', () => {
  beforeEach(setupDom);

  const block = () => els.get('vault-request-foreign-block');

  test('is absent entirely when no other partition was asked for', () => {
    showConsent(request());

    expect(block().classList.contains('hidden')).toBe(true);
    expect(readRows()).toHaveLength(0);
  });

  test('is a list: one li per owner, with no box and no marker drawn', () => {
    showConsent(request({ foreignReads: [owner()] }));

    expect(readRows()[0].tagName).toBe('LI');
    expect(ruleBodyFor('.vault-req-read')).not.toMatch(/border/);
    // A list element, but nothing marks it: no bullet from the list itself and
    // none drawn in by a pseudo-element either.
    expect(ruleBodyFor('.vault-request-fields')).toMatch(/list-style:\s*none/);
    expect(ruleBodyFor('.vault-req-read::before')).toBe(null);
    expect(ruleBodyFor('.vault-req-read::marker')).toBe(null);
  });

  test('names /shared in code, in the same green as a writable field', () => {
    // It is a pointer inside a sentence, so it reads as one.
    expect(ruleBodyFor('.vault-req-inline-path')).toMatch(/font-family:\s*ui-monospace/);
    expect(ruleBodyFor('.vault-req-inline-path')).toMatch(/color:\s*var\(--secure-fg\)/);
  });

  test('names the permission in code, but not in green', () => {
    // `read` is a permission, not a place in the document; green is for the
    // latter, so the sentence keeps its own colour here.
    expect(ruleBodyFor('.vault-req-inline-code')).toMatch(/font-family:\s*ui-monospace/);
    expect(ruleBodyFor('.vault-req-inline-code')).not.toMatch(/color/);
  });

  test('shows each namespace as code, sorted, with one checkbox', () => {
    showConsent(
      request({
        foreignReads: [
          owner({ namespace: 'web:z.example' }),
          owner({ namespace: 'web:a.example' }),
        ],
      }),
    );

    expect(block().classList.contains('hidden')).toBe(false);
    const rows = readRows();
    // The namespace, not the URL: this names the partition being read.
    expect(rows.map((r) => r.children[0].textContent)).toEqual(['web:a.example', 'web:z.example']);
    expect(rows.map((r) => r.children[0].className)).toEqual(['vault-req-ns', 'vault-req-ns']);
    for (const row of rows) {
      const boxes = row.querySelectorAll('input[type=checkbox]');
      expect(boxes).toHaveLength(1);
      expect(boxes[0].className).toBe('vault-req-box');
      expect(boxes[0].checked).toBe(true);
    }
  });

  test('a namespace cannot draw anything into a row', () => {
    showConsent(request({ foreignReads: [owner({ namespace: 'web:<img src=x>' })] }));

    const row = readRows()[0];
    expect(row.children[0].textContent).toBe('web:<img src=x>');
    expect(row.descendants().some((el) => el.tagName === 'IMG')).toBe(false);
    assertNoMarkupWrites();
  });

  test('is hidden again on the way out', () => {
    showConsent(request({ foreignReads: [owner()] }));
    els.get('vault-request-deny').onclick();

    expect(block().classList.contains('hidden')).toBe(true);
    expect(readRows()).toHaveLength(0);
  });
});

describe('consent sheet: what gets sent back', () => {
  beforeEach(setupDom);

  const decision = () => vaultData.respondConsent.mock.calls[0][1];

  const scoped = () =>
    request({
      requestedScopes: [
        {
          methods: ['vault_getData', 'vault_setData'],
          fields: [
            { path: '/profile', read: true, write: true },
            { path: '/notes', read: true, write: false },
          ],
        },
      ],
      foreignReads: [owner()],
    });

  test('grants the fields the site asked for, as asked', () => {
    showConsent(scoped());
    els.get('vault-request-allow').onclick();

    expect(decision().grantedFields).toEqual([
      { path: '/profile', read: true, write: true },
      { path: '/notes', read: true, write: false },
    ]);
  });

  test('sends the owner entry main resolved when its box is left ticked', () => {
    showConsent(scoped());
    els.get('vault-request-allow').onclick();

    // Narrowed to what a grant is made of: main's `wholesale` and `known` are
    // hints for this sheet, and the host persists whatever comes back.
    expect(decision().grantedForeignReads).toEqual([
      { namespace: OWNER_NS, origin: 'https://owner.example', paths: ['/shared/displayName'] },
    ]);
  });

  test('unticking a read-access row drops that site and nothing else', () => {
    showConsent(
      request({
        foreignReads: [owner(), owner({ namespace: 'web:second.example' })],
      }),
    );
    readRows()[0].children[1].checked = false;
    els.get('vault-request-allow').onclick();

    expect(decision().grantedForeignReads.map((e) => e.namespace)).toEqual(['web:second.example']);
    expect(decision().grantedFields).toHaveLength(1);
  });

  test('ignores a cross-origin field the PAGE put in its own scopes', () => {
    showConsent(
      request({
        requestedScopes: [
          {
            methods: ['vault_getData'],
            fields: [
              { path: '/own', read: true, write: true },
              { path: '/shared/x', read: true, origin: 'https://bank.example' },
            ],
          },
        ],
        foreignReads: [],
      }),
    );
    els.get('vault-request-allow').onclick();

    expect(decision().grantedFields).toEqual([{ path: '/own', read: true, write: true }]);
    expect(decision().grantedForeignReads).toEqual([]);
  });

  test('rejecting sends a denial', () => {
    showConsent(request({ foreignReads: [owner()] }));
    els.get('vault-request-deny').onclick();

    expect(vaultData.respondConsent).toHaveBeenCalledWith('consent-1', {
      approved: false,
      reason: 'user denied',
    });
  });
});

describe('consent sheet: the layout rules that keep regressing', () => {
  const css = vaultCss;
  const ruleFor = ruleBodyFor;

  test('both headers and the site row run the full width of the sheet', () => {
    // The row is the one the Data pane lists this site with, so anything
    // insetting it renders the same item narrower here than there — and the
    // headers sit on its left edge, which means no inset on them either.
    expect(ruleFor('.vault-req-intro')).not.toMatch(/padding/);
    expect(ruleFor('.vault-req-intro-block')).not.toMatch(/padding/);
    const inset = [...css.matchAll(/\.vault-req-own[^{]*\{([^}]*)\}/g)].filter((m) =>
      /padding|margin/.test(m[1])
    );
    expect(inset).toEqual([]);
  });

  test('a read-access row cannot be text-selected', () => {
    // It shows an identifier, not prose to lift out.
    expect(ruleFor('.vault-req-read')).toMatch(/user-select:\s*none/);
  });

  test('its checkbox is pushed to the right edge', () => {
    // The namespace takes the slack, so the box lands hard right.
    expect(ruleFor('.vault-req-ns')).toMatch(/flex:\s*1/);
    expect(ruleFor('.vault-req-box')).toMatch(/flex:\s*0 0 auto/);
  });

  test('the namespace reads as code', () => {
    expect(ruleFor('.vault-req-ns')).toMatch(/font-family:\s*ui-monospace/);
  });

  test('the read-access section leaves a gap above the buttons', () => {
    // Without a bottom margin the rows sit hard against Reject/Allow.
    expect(ruleFor('.vault-req-foreign-block')).toMatch(/margin:\s*20px 0 24px/);
  });

  test('nothing on the consent sheet restyles the list row type', () => {
    // The sheet uses the list's row AS IS. A rule scoped under any .vault-req*
    // selector that touches .vault-row-host or .vault-row-meta would make the
    // same site render differently in the two places.
    const offenders = [...css.matchAll(/^\.vault-req[^{]*\.vault-row-(host|meta)[^{]*\{/gm)].map(
      (m) => m[0].trim()
    );
    expect(offenders).toEqual([]);
  });
});

describe('detail view: cross-origin grants, both directions', () => {
  beforeEach(setupDom);

  const partition = {
    namespace: OWNER_NS,
    origin: 'https://owner.example',
    fields: [{ path: '/shared', read: true, write: true }],
    bytes: 10,
  };

  test('hides the one header AND both groups when there are none', async () => {
    await openDetail(partition);

    // An ordinary site has none of this: no empty heading, no empty groups.
    for (const id of [
      'vault-detail-perms-header',
      'vault-detail-reads-group',
      'vault-detail-readers-group',
    ]) {
      expect(els.get(id).classList.contains('hidden')).toBe(true);
    }
  });

  test('lists the sites this partition reads, and the sites that read it', async () => {
    vaultData.foreignGrantsFor.mockResolvedValue({
      locked: false,
      reads: [{ ownerNamespace: 'web:a.example', ownerOrigin: 'https://a.example', paths: ['/shared/x'] }],
      readers: [{ readerNamespace: 'web:b.example', readerOrigin: 'https://b.example', paths: ['/shared'] }],
    });

    await openDetail(partition);
    await Promise.resolve();
    await Promise.resolve();

    expect(els.get('vault-detail-reads').children).toHaveLength(1);
    expect(els.get('vault-detail-readers').children).toHaveLength(1);
    // One header over both directions, each group shown with its own rows.
    expect(els.get('vault-detail-perms-header').classList.contains('hidden')).toBe(false);
    expect(els.get('vault-detail-reads-group').classList.contains('hidden')).toBe(false);
    expect(els.get('vault-detail-readers-group').classList.contains('hidden')).toBe(false);
  });

  test('the owner end is the same item, and toggles the same grant', async () => {
    vaultData.foreignGrantsFor.mockResolvedValue({
      locked: false,
      reads: [],
      readers: [
        {
          readerNamespace: 'web:b.example',
          readerOrigin: 'https://b.example',
          paths: ['/shared'],
          enabled: true,
        },
      ],
    });

    await openDetail(partition);
    await Promise.resolve();
    await Promise.resolve();

    const item = els.get('vault-detail-readers').children[0];
    // The same one-line item as the other direction, marked `in` so its edge
    // and its group's sub-label both say which way the read goes.
    expect(item.className).toBe('vault-perm in');
    expect(item.children.map((el) => el.className)).toEqual(['vault-perm-ns', 'vault-perm-tog']);
    // The READER's namespace: this partition is the owner being read.
    expect(item.children[0].textContent).toBe('web:b.example');
    // No removal control on either end — unticking is how a read is turned off.
    expect(item.descendants().some((el) => el.tagName === 'BUTTON')).toBe(false);

    const box = item.querySelectorAll('input[type=checkbox]')[0];
    box.checked = false;
    await box.fire('change');

    // Reader first, owner second — this partition is the owner.
    expect(vaultData.setForeignReadEnabled).toHaveBeenCalledWith(
      'web:b.example',
      OWNER_NS,
      false,
    );
  });

  test('a read the READER switched off reads as off on the owner end', async () => {
    vaultData.foreignGrantsFor.mockResolvedValue({
      locked: false,
      reads: [],
      readers: [
        {
          readerNamespace: 'web:b.example',
          readerOrigin: 'https://b.example',
          paths: ['/shared'],
          enabled: false,
        },
      ],
    });

    await openDetail(partition);
    await Promise.resolve();
    await Promise.resolve();

    // Otherwise the owner is told they are being read when they are not.
    const box = els.get('vault-detail-readers').children[0].querySelectorAll(
      'input[type=checkbox]',
    )[0];
    expect(box.checked).toBe(false);
  });

  test('renders nothing while the vault is locked', async () => {
    vaultData.foreignGrantsFor.mockResolvedValue({ locked: true, reads: [], readers: [] });

    await openDetail(partition);
    await Promise.resolve();

    expect(els.get('vault-detail-reads-group').classList.contains('hidden')).toBe(true);
    expect(els.get('vault-detail-perms-header').classList.contains('hidden')).toBe(true);
  });

});

describe('detail view: the reads this site holds', () => {
  beforeEach(setupDom);

  const partition = {
    namespace: 'web:reader.example',
    origin: 'https://reader.example',
    fields: [{ path: '/own', read: true, write: true }],
    bytes: 10,
  };

  /** Open the detail view with one held read, and hand back its item. */
  async function openWithRead(extra = {}) {
    vaultData.foreignGrantsFor.mockResolvedValue({
      locked: false,
      readers: [],
      reads: [
        {
          ownerNamespace: 'web:owner.example',
          ownerOrigin: 'https://owner.example',
          paths: ['/shared/displayName'],
          enabled: true,
          ...extra,
        },
      ],
    });
    await openDetail(partition);
    await Promise.resolve();
    await Promise.resolve();
    return els.get('vault-detail-reads').children[0];
  }

  test('is one line: the namespace, then the read toggle', async () => {
    const item = await openWithRead();

    expect(item.className).toBe('vault-perm out');
    expect(item.children.map((el) => el.className)).toEqual(['vault-perm-ns', 'vault-perm-tog']);
    // The namespace, not the URL: this names the partition being read. No
    // scope on the row — every cross-origin read is `/shared` by construction.
    expect(item.children[0].textContent).toBe('web:owner.example');
    expect(item.children[1].children[0].textContent).toBe('read');
    const boxes = item.querySelectorAll('input[type=checkbox]');
    expect(boxes).toHaveLength(1);
    expect(boxes[0].checked).toBe(true);
  });

  test('carries no Remove access button — unticking is how you turn it off', async () => {
    const item = await openWithRead();

    expect(item.descendants().some((el) => el.tagName === 'BUTTON')).toBe(false);
  });

  test('unticking turns the read off and KEEPS the item, re-tickable', async () => {
    const item = await openWithRead();

    const box = item.querySelectorAll('input[type=checkbox]')[0];
    box.checked = false;
    // Off, not gone: the paths the user approved stay on the record.
    vaultData.foreignGrantsFor.mockResolvedValue({
      locked: false,
      readers: [],
      reads: [
        {
          ownerNamespace: 'web:owner.example',
          ownerOrigin: 'https://owner.example',
          paths: ['/shared/displayName'],
          enabled: false,
        },
      ],
    });
    await box.fire('change');
    await Promise.resolve();
    await Promise.resolve();

    expect(vaultData.setForeignReadEnabled).toHaveBeenCalledWith(
      'web:reader.example',
      'web:owner.example',
      false,
    );
    const after = els.get('vault-detail-reads').children;
    expect(after).toHaveLength(1);
    expect(after[0].querySelectorAll('input[type=checkbox]')[0].checked).toBe(false);
    expect(els.get('vault-detail-perms-header').classList.contains('hidden')).toBe(false);
  });

  test('re-ticking turns it back on', async () => {
    const item = await openWithRead({ enabled: false });

    const box = item.querySelectorAll('input[type=checkbox]')[0];
    expect(box.checked).toBe(false);
    box.checked = true;
    await box.fire('change');

    expect(vaultData.setForeignReadEnabled).toHaveBeenCalledWith(
      'web:reader.example',
      'web:owner.example',
      true,
    );
  });

  test('the detail page reads: this partition, permissions, stored data, button', () => {
    const html = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'index.html'),
      'utf8',
    );
    // To the end of the Data tab: the consent sheet is no longer inside it.
    const view = html.slice(
      html.indexOf('id="vault-detail-view"'),
      html.indexOf('id="tab-settings"'),
    );
    const at = (needle) => view.indexOf(needle);

    expect(at('This partition')).toBeGreaterThan(-1);
    expect(at('This partition')).toBeLessThan(at('vault-detail-site'));
    expect(at('vault-detail-site')).toBeLessThan(at('>Permissions<'));
    expect(at('>Permissions<')).toBeLessThan(at('>Stored data<'));
    expect(at('>Stored data<')).toBeLessThan(at('vault-detail-delete'));
    // One header over both directions, and no title beside Back.
    expect(view).not.toContain('Additional permissions');
    expect(view).not.toContain('Granted permissions');
    expect(view).not.toContain('data-title-id');
  });

  test('its layout rules: code namespace, toggle right, direction by edge', () => {
    expect(ruleBodyFor('.vault-perm-ns')).toMatch(/font-family:\s*ui-monospace/);
    expect(ruleBodyFor('.vault-perm-ns')).toMatch(/flex:\s*1/);
    expect(ruleBodyFor('.vault-perm-tog')).toMatch(/flex:\s*0 0 auto/);
    // Direction is never hue alone: the two edges differ in lightness, and the
    // group's sub-label says it in words besides.
    expect(ruleBodyFor('.vault-perm.out')).toMatch(/border-left:\s*3px solid var\(--accent\)/);
    expect(ruleBodyFor('.vault-perm.in')).toMatch(/border-left:\s*3px solid var\(--secure-fg\)/);
  });

  test('an unticked read loses its coloured edge', () => {
    // Parens are regex-special, so this one reads the raw sheet rather than
    // going through ruleBodyFor.
    expect(vaultCss).toMatch(
      /\.vault-perm:not\(:has\(\.vault-perm-box:checked\)\)\s*\{[^}]*border-left-color:\s*var\(--border\)/,
    );
  });

  test('Back sits in the pane’s own corner, without moving every other sub-screen', () => {
    // The pane's 16px is cancelled here and nowhere else: `.subscreen-header`
    // is shared with every sidebar sub-screen.
    const rule = ruleBodyFor('#vault-detail-view .subscreen-header');
    expect(rule).toMatch(/margin:\s*-16px -16px/);
    expect(rule).toMatch(/padding:\s*0/);
    // And no divider under it: the first section header follows immediately.
    expect(rule).toMatch(/border-bottom:\s*0/);
    expect(vaultCss).not.toMatch(/^\.subscreen-header\s*\{/m);
  });

  test('the screen title is hidden from sight, not from the page', () => {
    // The site row names this screen. The title stays in the DOM because it is
    // what a screen reader announces for it.
    const rule = ruleBodyFor('#vault-detail-view .subscreen-title');
    expect(rule).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(rule).not.toMatch(/display:\s*none/);
  });
});

describe('the usage bar shows what the vault is made of', () => {
  beforeEach(setupDom);

  /** Refresh the pane with these partitions, and hand back the bar's segments. */
  async function bar(partitions, totalBytes) {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({});
    vaultData.getUsage.mockResolvedValue({
      unlocked: true,
      totalBytes: totalBytes ?? partitions.reduce((n, p) => n + (p.bytes || 0), 0),
      partitionCount: partitions.length,
    });
    vaultData.listPartitions.mockResolvedValue(partitions);
    await api.refresh();
    return els.get('vault-usage-bar-fill').children;
  }

  const site = (host, bytes, connectedAt) => ({
    namespace: `web:${host}`,
    origin: `https://${host}`,
    fields: [],
    bytes,
    connectedAt,
  });

  test('an empty vault is one inert span, not a full one', async () => {
    const segments = await bar([]);

    expect(segments).toHaveLength(1);
    expect(segments[0].className).toBe('vault-usage-seg empty');
    expect(segments[0].style.width).toBe('100%');
  });

  test('one site fills it', async () => {
    const segments = await bar([site('a.example', 1024, 1)]);

    expect(segments.map((el) => el.className)).toEqual(['vault-usage-seg a']);
    expect(segments[0].style.width).toBe('100%');
  });

  test('several sites divide it by share, oldest first, in alternating shades', async () => {
    // Listed newest-and-biggest first, the way main returns them…
    const segments = await bar([
      site('big.example', 2048, 30),
      site('mid.example', 1024, 20),
      site('old.example', 1024, 10),
    ]);

    // …but drawn oldest first, so a site keeps its place as the others grow.
    expect(segments.map((el) => el.dataset.namespace)).toEqual([
      'web:old.example',
      'web:mid.example',
      'web:big.example',
    ]);
    expect(segments.map((el) => el.style.width)).toEqual(['25%', '25%', '50%']);
    expect(segments.map((el) => el.className)).toEqual([
      'vault-usage-seg a',
      'vault-usage-seg b',
      'vault-usage-seg a',
    ]);
  });

  test('sites that have written nothing yet split it evenly', async () => {
    // Every share is 0/0 at consent time, before the site's first write.
    const segments = await bar([site('a.example', 0, 1), site('b.example', 0, 2)]);

    expect(segments.map((el) => el.style.width)).toEqual(['50%', '50%']);
  });

  test('carries no tooltip — the row it lights up is the answer', async () => {
    const segments = await bar([site('a.example', 2048, 1)]);

    expect(segments[0].title).toBe('');
  });

  test('hovering a segment highlights that site’s row, and only while hovered', async () => {
    const segments = await bar([site('a.example', 1024, 1), site('b.example', 1024, 2)]);
    const rowFor = (host) =>
      els
        .get('vault-partition-list')
        .children.find((r) => r.dataset.namespace === `web:${host}`);

    await segments[1].fire('mouseenter');

    // The bar is the only thing that says which site a sliver belongs to, so
    // the row has to answer — in the same state hovering the row itself gives.
    expect(rowFor('b.example').classList.contains('is-hovered')).toBe(true);
    expect(rowFor('a.example').classList.contains('is-hovered')).toBe(false);

    await segments[1].fire('mouseleave');
    expect(rowFor('b.example').classList.contains('is-hovered')).toBe(false);
  });

  test('a locked vault draws no segments at all', async () => {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({});
    vaultData.listPartitions.mockResolvedValue([site('a.example', 1024, 1)]);
    await api.refresh();
    expect(els.get('vault-usage-bar-fill').children).toHaveLength(1);

    vaultData.getUsage.mockResolvedValue({ unlocked: false, totalBytes: 0, partitionCount: 0 });
    await api.refresh();

    // Same rule as the rest of the pane: a locked vault shows nothing about
    // which sites hold data, and segment widths are exactly that.
    expect(els.get('vault-usage-bar-fill').children).toHaveLength(0);
  });

  test('its rules: two shades from one accent, and one hover state', () => {
    expect(ruleBodyFor('.vault-usage-seg.a')).toMatch(/background:\s*var\(--accent\)/);
    // Mixed from the accent, not picked, so both shades follow the theme.
    expect(ruleBodyFor('.vault-usage-seg.b')).toMatch(/color-mix\([^)]*var\(--accent\)/);
    expect(ruleBodyFor('.vault-usage-seg.empty')).toMatch(/background:\s*var\(--border\)/);
    // The smallest site is a chip you can see and hover, not a hairline —
    // deliberately wider than its share, since the row below gives the size.
    expect(ruleBodyFor('.vault-usage-seg')).toMatch(/min-width:\s*8px/);
    // One rule for both ways into the row's hover state, so they cannot drift.
    expect(vaultCss).toMatch(
      /\.vault-row:hover,\s*\n\.vault-row\.is-hovered \{ border-color: var\(--accent\); \}/,
    );
  });
});

describe('the site thumbnail on a row', () => {
  beforeEach(setupDom);

  const ICON = 'data:image/png;base64,AAA';

  async function rowFor(extra) {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({ openInNewTab: jest.fn() });
    vaultData.listPartitions.mockResolvedValue([
      { namespace: 'web:a.example', origin: 'https://a.example', fields: [], bytes: 0, ...extra },
    ]);
    await api.refresh();
    return els.get('vault-partition-list').children[0];
  }

  test('is the icon the site supplied, pinned at consent', async () => {
    const row = await rowFor({ icon: ICON, monogram: { letter: 'A', hue: 10 } });

    const thumb = row.children[1].children[0];
    expect(thumb.tagName).toBe('IMG');
    expect(thumb.className).toBe('vault-row-thumb');
    expect(thumb.src).toBe(ICON);
    // It replaced the arrow glyph: no SVG is drawn on the row any more.
    expect(row.descendants().some((el) => el.tagName === 'SVG')).toBe(false);
  });

  test('falls back to the launcher monogram when the site shipped none', async () => {
    const row = await rowFor({ icon: null, monogram: { letter: 'A', hue: 200 } });

    const thumb = row.children[1].children[0];
    expect(thumb.className).toBe('vault-row-thumb vault-row-monogram');
    expect(thumb.textContent).toBe('A');
    // Hue from the namespace, so the same site paints the same everywhere.
    expect(thumb.style.background).toBe('hsl(200 42% 32%)');
  });

  test('falls back when a pinned icon will not decode', async () => {
    const row = await rowFor({ icon: ICON, monogram: { letter: 'A', hue: 10 } });

    await row.children[1].children[0].fire('error');

    // Rather than leaving a broken-image box in the privileged chrome.
    expect(row.children[1].children[0].className).toBe('vault-row-thumb vault-row-monogram');
  });

  test('is still the button that opens the site', async () => {
    const openInNewTab = jest.fn();
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({ openInNewTab });
    vaultData.listPartitions.mockResolvedValue([
      { namespace: 'web:a.example', origin: 'https://a.example', fields: [], bytes: 0, icon: ICON },
    ]);
    await api.refresh();

    await els.get('vault-partition-list').children[0].children[1].fire('click');

    expect(openInNewTab).toHaveBeenCalledWith('https://a.example');
  });

  test('the consent sheet carries the same thumbnail the row will', () => {
    const { initVaultData } = require('./vault-data.js');
    initVaultData({});
    vaultData.onConsentRequest.mock.calls[0][0]({
      id: 'consent-1',
      origin: 'https://reader.example',
      namespace: 'web:reader.example',
      icon: { dataUri: ICON },
      monogram: { letter: 'R', hue: 5 },
      requestedScopes: [{ methods: ['vault_getData'], fields: [{ path: '/own', read: true }] }],
      foreignReads: [],
    });

    const thumb = els.get('vault-request-own').children[0].children[1].children[0];
    // `icon` arrives as main's record, not a string: passing the record itself
    // to `src` printed "[object Object]" and showed nothing.
    expect(thumb.tagName).toBe('IMG');
    expect(thumb.src).toBe(ICON);
  });
});

describe('the locked prompt goes away when the vault is opened elsewhere', () => {
  beforeEach(setupDom);

  /** Put the pane in its locked state, the way a locked refresh does. */
  async function locked() {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({});
    vaultData.getUsage.mockResolvedValue({ unlocked: false, totalBytes: 0, partitionCount: 0 });
    await api.refresh();
    expect(els.get('vault-locked-view').classList.contains('hidden')).toBe(false);
    return api;
  }

  test('a consent sheet covers it rather than racing it', async () => {
    await locked();

    // The sheet is a modal subscreen now: it overlays the whole sidebar content
    // area, so it does not have to clear the pane underneath and cannot be
    // drawn behind it. That used to be a real bug — the sheet rendered under a
    // prompt still saying the vault was locked.
    vaultData.onConsentRequest.mock.calls[0][0]({
      id: 'consent-1',
      origin: 'https://reader.example',
      namespace: 'web:reader.example',
      requestedScopes: [{ methods: ['vault_getData'], fields: [{ path: '/own', read: true }] }],
      foreignReads: [],
    });

    expect(els.get('vault-request-view').classList.contains('hidden')).toBe(false);
  });

  test('a refresh that finds the vault still locked keeps the prompt', async () => {
    const api = await locked();
    vaultData.onConsentRequest.mock.calls[0][0]({
      id: 'consent-1',
      origin: 'https://reader.example',
      namespace: 'web:reader.example',
      requestedScopes: [{ methods: ['vault_getData'], fields: [] }],
      foreignReads: [],
    });

    await api.refresh();

    // Showing a view must not be able to claim the vault is open: main is asked.
    expect(els.get('vault-locked-view').classList.contains('hidden')).toBe(false);
  });

  test('an unlock raised by MAIN refreshes the pane', () => {
    // The pane's own button refreshes in its `finally`; a main-pushed unlock
    // (a site read, or the launcher's Unlock) goes through wallet-ui, which has
    // to do the same or the prompt sits over an open vault until the user
    // switches tabs. Pinned at the source: this handler has no test harness.
    const walletUi = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'wallet-ui.js'),
      'utf8',
    );
    const handler = walletUi.slice(walletUi.indexOf('onShowUnlock'));
    const respond = handler.indexOf('respondUnlock');
    const refreshed = handler.indexOf('vaultDataApi?.refresh()');
    expect(respond).toBeGreaterThan(-1);
    expect(refreshed).toBeGreaterThan(respond);
  });
});

describe('an auto-lock under an open pane is caught on the next interaction', () => {
  beforeEach(setupDom);

  /** Render the list with the vault open, then lock it behind the pane's back. */
  async function listThenLock() {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({ openInNewTab: jest.fn() });
    vaultData.listPartitions.mockResolvedValue([
      { namespace: 'web:a.example', origin: 'https://a.example', fields: [], bytes: 10 },
    ]);
    await api.refresh();
    expect(els.get('vault-partition-list').children).toHaveLength(1);
    // Nothing pushes a lock to the renderer, so the pane still shows the list.
    vaultData.getUsage.mockResolvedValue({ unlocked: false, totalBytes: 0, partitionCount: 0 });
    return api;
  }

  test('a click anywhere in the pane raises the prompt over the whole pane', async () => {
    await listThenLock();

    // Delegated on the pane itself, so it catches whatever the click landed on.
    await els.get('tab-data').fire('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(els.get('vault-locked-view').classList.contains('hidden')).toBe(false);
    // Over the WHOLE pane: the view the click opened goes with it, and the rows
    // a locked vault must not display are dropped.
    expect(els.get('vault-list-view').classList.contains('hidden')).toBe(true);
    expect(els.get('vault-detail-view').classList.contains('hidden')).toBe(true);
    expect(els.get('vault-partition-list').children).toHaveLength(0);
  });

  test('it listens in the capture phase', async () => {
    await listThenLock();

    // The row's open button calls stopPropagation so its click does not fall
    // through to the row. A bubble-phase listener on the pane would never see
    // that click, and the pane would keep showing a locked vault's site list.
    expect(els.get('tab-data').captureListeners.size).toBe(1);
  });

  test('an open vault is left alone', async () => {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({});
    vaultData.listPartitions.mockResolvedValue([
      { namespace: 'web:a.example', origin: 'https://a.example', fields: [], bytes: 10 },
    ]);
    await api.refresh();

    await els.get('tab-data').fire('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(els.get('vault-locked-view').classList.contains('hidden')).toBe(true);
    expect(els.get('vault-partition-list').children).toHaveLength(1);
  });

  test('a failed lock read is not evidence of a lock', async () => {
    await listThenLock();
    vaultData.getUsage.mockRejectedValue(new Error('ipc down'));

    await els.get('tab-data').fire('click');
    await Promise.resolve();
    await Promise.resolve();

    // Raising the prompt on a transient IPC failure would lock the user out of
    // a pane whose vault is open.
    expect(els.get('vault-locked-view').classList.contains('hidden')).toBe(true);
  });
});

describe('the locked view does not ask for an unlock it does not need', () => {
  beforeEach(setupDom);

  /** Wire the pane with an injected unlock, the way wallet-ui.js does. */
  function initWithUnlock() {
    const requestUnlock = jest.fn().mockResolvedValue(undefined);
    const { initVaultData } = require('./vault-data.js');
    initVaultData({ requestUnlock });
    return requestUnlock;
  }

  test('asks when the vault really is locked', async () => {
    const requestUnlock = initWithUnlock();
    vaultData.getUsage.mockResolvedValue({ unlocked: false, totalBytes: 0, partitionCount: 0 });

    await els.get('vault-unlock-btn').fire('click');

    expect(requestUnlock).toHaveBeenCalledTimes(1);
  });

  test('does NOT ask when the vault is already unlocked', async () => {
    // The browser's unlock screen SHOWS an unlock; it does not decide one is
    // needed. So clicking this button against an open vault used to prompt for
    // Touch ID a second time — and this view can hold stale state, because the
    // consent flow unlocks the vault behind it.
    const requestUnlock = initWithUnlock();
    vaultData.getUsage.mockResolvedValue({ unlocked: true, totalBytes: 10, partitionCount: 1 });

    await els.get('vault-unlock-btn').fire('click');

    expect(requestUnlock).not.toHaveBeenCalled();
  });

  test('re-enables itself and refreshes either way', async () => {
    initWithUnlock();
    vaultData.getUsage.mockResolvedValue({ unlocked: true, totalBytes: 10, partitionCount: 1 });

    await els.get('vault-unlock-btn').fire('click');

    expect(els.get('vault-unlock-btn').disabled).toBe(false);
    expect(vaultData.getUsage).toHaveBeenCalled();
  });
});



describe('Sites with data: the row opens the site', () => {
  beforeEach(setupDom);

  const partitions = [
    { namespace: 'web:a.example', origin: 'https://a.example', fields: [], bytes: 10 },
    { namespace: 'web:b.example', origin: 'https://b.example', fields: [], bytes: 20 },
  ];

  async function renderRows(openInNewTab = jest.fn()) {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({ openInNewTab });
    vaultData.listPartitions.mockResolvedValue(partitions);
    await api.refresh();
    return { openInNewTab, rows: els.get('vault-partition-list').children };
  }

  test('names each site with its scheme, so two schemes are two rows', async () => {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({});
    vaultData.listPartitions.mockResolvedValue([
      { namespace: 'web:a.example', origin: 'https://a.example', fields: [], bytes: 0 },
      { namespace: 'dweb:a.example', origin: 'ipfs://a.example', fields: [], bytes: 0 },
    ]);
    await api.refresh();

    // Two partitions, keyed apart by scheme. Dropping it from the label would
    // print the same name twice for two different stores.
    expect(els.get('vault-partition-list').children.map((r) => hostOfRow(r))).toEqual([
      'https://a.example',
      'ipfs://a.example',
    ]);
  });

  test('opens the origin in a new tab, and does not open the detail view', async () => {
    const { openInNewTab, rows } = await renderRows();

    const openBtn = rows[0].children[1];
    expect(openBtn.className).toBe('vault-row-open');
    await openBtn.fire('click');

    expect(openInNewTab).toHaveBeenCalledWith('https://a.example');
    // The click must not fall through to the row, which would open the detail
    // view and read the partition's stored data.
    expect(vaultData.getPartitionData).not.toHaveBeenCalled();
  });

  test('carries no delete control — destroying data lives one level in', async () => {
    const { rows } = await renderRows();

    // A one-click destroy on every row of a list people scan is the wrong
    // default; the detail view deletes, with the data on screen.
    expect(rows[0].descendants().some((el) => el.className === 'vault-row-delete')).toBe(false);
    expect(window.vaultData.deletePartition).not.toHaveBeenCalled();
  });

  test('disables the open button when the host supplied no way to open a tab', async () => {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({});
    vaultData.listPartitions.mockResolvedValue(partitions);
    await api.refresh();

    expect(els.get('vault-partition-list').children[0].children[1].disabled).toBe(true);
  });
});



describe('Sites with data: the layout', () => {
  const css = require('fs').readFileSync(require.resolve('../../styles/vault-data.css'), 'utf8');
  const ruleFor = (selector) => {
    const match = new RegExp(`${selector.replace(/[.#]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`).exec(css);
    return match ? match[1] : null;
  };

  test('the whole-vault block is bottom-aligned', () => {
    expect(ruleFor('.vault-section-footer')).toMatch(/margin-top:\s*auto/);
    // Which only works because the list view is the flex column above it.
    expect(ruleFor('#vault-list-view')).toMatch(/flex-direction:\s*column/);
  });

  test('rows carry no drag affordance', () => {
    expect(css).not.toMatch(/vault-row-handle|\.dragging/);
  });
});

describe('an empty vault offers Import instead of Export', () => {
  beforeEach(setupDom);

  const site = (host) => ({
    namespace: `web:https://${host}`,
    origin: `https://${host}`,
    bytes: 1024,
    fieldCount: 1,
    connectedAt: 1,
  });

  async function render(parts) {
    const { initVaultData } = require('./vault-data.js');
    const api = initVaultData({});
    vaultData.listPartitions.mockResolvedValue(parts);
    vaultData.getUsage.mockResolvedValue({
      unlocked: true,
      totalBytes: parts.length ? 1024 : 0,
      partitionCount: parts.length,
    });
    await api.refresh();
    return api;
  }

  test('with no partitions: Import shown, Export hidden, Clear disabled', async () => {
    await render([]);

    expect(els.get('vault-import-btn').classList.contains('hidden')).toBe(false);
    expect(els.get('vault-export-btn').classList.contains('hidden')).toBe(true);
    expect(els.get('vault-clear-btn').disabled).toBe(true);
  });

  test('with a partition: Export shown, Import hidden, Clear enabled', async () => {
    await render([site('shop.example')]);

    expect(els.get('vault-export-btn').classList.contains('hidden')).toBe(false);
    expect(els.get('vault-import-btn').classList.contains('hidden')).toBe(true);
    expect(els.get('vault-clear-btn').disabled).toBe(false);
  });

  test('clearing everything flips the slot back to Import', async () => {
    const api = await render([site('shop.example')]);
    expect(els.get('vault-export-btn').classList.contains('hidden')).toBe(false);

    // What Clear all data does, then the refresh it triggers.
    vaultData.listPartitions.mockResolvedValue([]);
    vaultData.getUsage.mockResolvedValue({ unlocked: true, totalBytes: 0, partitionCount: 0 });
    await api.refresh();

    expect(els.get('vault-import-btn').classList.contains('hidden')).toBe(false);
    expect(els.get('vault-clear-btn').disabled).toBe(true);
  });

  test('Import asks main for the file and re-renders on success', async () => {
    await render([]);
    await els.get('vault-import-btn').fire('click');
    await Promise.resolve();

    expect(vaultData.importVault).toHaveBeenCalled();
    // Main owns the picker, so the renderer passes nothing and reads no file.
    expect(vaultData.importVault).toHaveBeenCalledWith();
  });

  test('a cancelled picker changes nothing', async () => {
    const api = await render([]);
    vaultData.importVault.mockResolvedValue({ imported: false, canceled: true });
    const before = vaultData.listPartitions.mock.calls.length;

    await els.get('vault-import-btn').fire('click');
    await Promise.resolve();

    expect(vaultData.listPartitions.mock.calls.length).toBe(before);
    expect(api).toBeTruthy();
  });

  test('a failed import surfaces the reason and leaves the button usable', async () => {
    await render([]);
    const alerts = [];
    global.window.alert = (m) => alerts.push(m);
    vaultData.importVault.mockRejectedValue(new Error('could not open the exported permissions (wrong vault?)'));

    await els.get('vault-import-btn').fire('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(alerts[0]).toContain('wrong vault?');
    expect(els.get('vault-import-btn').disabled).toBe(false);
  });
});
