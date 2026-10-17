/**
 * "Data" pane — the VAULT (data vault) management screen in the wallet sidebar.
 *
 * Lists every site that has a data partition, its on-disk size, and total usage;
 * lets the owner view a partition's stored data, delete a partition, clear all,
 * and export. Talks only to the trusted `window.vaultData` bridge (owner plane) —
 * never the site-facing `window.vault` provider.
 *
 * Self-contained: the detail view is an inline sub-view of #tab-data (no subscreen
 * machinery), so this module has no coupling to the wallet-state screen stack.
 */

import { getPermissionKey } from '../origin-utils.js';

// Set by initVaultData so the tab-switch hook in dapp-provider.js can refresh
// the banner the same way it refreshes the wallet / Swarm / x402 ones. Switching
// tabs fires no navigation event, so the document listeners below never see it.
let refreshConnectionBanner = () => {};

/** Refresh the Data pane's per-tab banner (no-op before the pane is wired). */
export function updateVaultConnectionBanner() {
  return refreshConnectionBanner();
}

function fmtBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
function hostOf(origin) {
  try {
    return new URL(origin).host || origin;
  } catch {
    return origin || '—';
  }
}

/**
 * An origin with its scheme kept: `http://app.localhost:8765`, `bzz://name.eth`.
 *
 * The scheme is not decoration here — it is part of the identity. Every provider
 * compares origins including scheme and port, so `https://site.example` and
 * `bzz://site.example` hold two different vault partitions. A prompt that says
 * only `site.example` is therefore naming something less specific than the thing
 * being granted.
 */
function originLabel(origin) {
  try {
    const url = new URL(origin);
    return url.host ? `${url.protocol}//${url.host}` : origin;
  } catch {
    return origin || '—';
  }
}

export function initVaultData(opts = {}) {
  const panel = document.getElementById('tab-data');
  if (!panel) return { refresh: () => {} };
  const openAndFocus = typeof opts.openAndFocus === 'function' ? opts.openAndFocus : () => {};
  // Host seam: show whatever unlock UI the browser already owns (the data vault
  // has none of its own — one unlock covers the identity vault and this one).
  const requestUnlock = typeof opts.requestUnlock === 'function' ? opts.requestUnlock : null;
  // Host seam, like the two above: opening a tab is the shell's job, and this
  // module stays reachable from a test without pulling the tab strip in behind it.
  const openInNewTab = typeof opts.openInNewTab === 'function' ? opts.openInNewTab : null;

  const lockedView = document.getElementById('vault-locked-view');
  const unlockBtn = document.getElementById('vault-unlock-btn');
  const listView = document.getElementById('vault-list-view');
  const detailView = document.getElementById('vault-detail-view');
  const requestView = document.getElementById('vault-request-view');
  const listEl = document.getElementById('vault-partition-list');
  const usageText = document.getElementById('vault-usage-text');
  const usageFill = document.getElementById('vault-usage-bar-fill');
  const exportBtn = document.getElementById('vault-export-btn');
  const clearBtn = document.getElementById('vault-clear-btn');
  const backBtn = document.getElementById('vault-detail-back');
  const detailSite = document.getElementById('vault-detail-site');
  const detailJson = document.getElementById('vault-detail-json');
  const detailDelete = document.getElementById('vault-detail-delete');
  // Consent request view
  const reqSite = document.getElementById('vault-request-site');
  const reqIcon = document.getElementById('vault-request-icon');
  const reqFavicon = document.getElementById('vault-request-favicon');
  const reqFields = document.getElementById('vault-request-fields');
  const reqAllow = document.getElementById('vault-request-allow');
  const reqDeny = document.getElementById('vault-request-deny');
  const reqOwn = document.getElementById('vault-request-own');
  const reqSharedNote = document.getElementById('vault-request-shared-note');
  const reqForeignBlock = document.getElementById('vault-request-foreign-block');
  // Cross-origin read grants on a partition's detail view, both directions.
  const permsHeader = document.getElementById('vault-detail-perms-header');
  const detailReads = document.getElementById('vault-detail-reads');
  const detailReadsGroup = document.getElementById('vault-detail-reads-group');
  const detailReaders = document.getElementById('vault-detail-readers');
  const detailReadersGroup = document.getElementById('vault-detail-readers-group');
  // Per-tab banner — which partition belongs to the page in front of you
  const connectionBanner = document.getElementById('vault-connection-banner');
  const connectionSite = document.getElementById('vault-connection-site');
  const connectionFields = document.getElementById('vault-connection-fields');
  const connectionManage = document.getElementById('vault-connection-manage');
  let currentNs = null;
  let bannerPartition = null;
  /** Rendered site rows by namespace, so a usage segment can point at one. */
  const rowsByNamespace = new Map();

  /**
   * Show one of the pane's three real views.
   *
   * The locked prompt is not one of them and cannot coexist with any of them,
   * so it goes away here. It used to be `setLocked`'s alone to clear, which left
   * it on screen over an unlocked vault: a site connecting while the vault was
   * locked raises the unlock screen, and the consent sheet that follows the
   * unlock painted underneath a prompt still saying "Your vault is locked".
   * `refresh` stays the authority on the lock state and puts it straight back if
   * the vault really is locked.
   */
  function setView(name) {
    if (lockedView) lockedView.classList.add('hidden');
    listView.classList.toggle('hidden', name !== 'list');
    detailView.classList.toggle('hidden', name !== 'detail');
    requestView.classList.toggle('hidden', name !== 'request');
  }

  /**
   * The last lock state main reported.
   *
   * Nothing pushes a lock to the renderer, so a vault that auto-locks under an
   * open pane leaves the list on screen. Every interaction re-reads the real
   * state and raises the prompt over the whole pane the moment it comes back
   * locked — the click itself may have opened a view first, which `setLocked`
   * then hides, so the end state is the prompt and nothing else.
   */
  let knownLocked = false;

  async function recheckLock() {
    if (!window.vaultData) return;
    let usage;
    try {
      usage = await window.vaultData.getUsage();
    } catch {
      return; // a failed read is not evidence of a lock
    }
    knownLocked = !usage.unlocked;
    if (knownLocked) setLocked(true);
  }

  // Capture, so it runs whatever the click lands on — a site row, a detail
  // button, the banner — including controls that stop propagation.
  panel.addEventListener('click', () => recheckLock(), true);

  async function refresh() {
    if (!window.vaultData) {
      listEl.innerHTML = '<div class="vault-empty">Vault unavailable.</div>';
      return;
    }
    let usage;
    let parts;
    try {
      usage = await window.vaultData.getUsage();
      parts = await window.vaultData.listPartitions();
    } catch (err) {
      // textContent, not interpolated innerHTML: an rpcError message can carry a
      // method name or namespace the page chose (see `method not supported: …`).
      listEl.replaceChildren();
      const failed = document.createElement('div');
      failed.className = 'vault-empty';
      failed.textContent = `Error: ${err.message}`;
      listEl.appendChild(failed);
      return;
    }

    // Locked: show the unlock prompt and NOTHING else. Not even the site count —
    // the list of sites you hold data for is history-shaped, and a locked vault
    // must not display it to whoever walks up to the browser.
    knownLocked = !usage.unlocked;
    setLocked(knownLocked);
    if (knownLocked) return;

    updateConnectionBanner();

    const count = usage.partitionCount;
    usageText.textContent = `${fmtBytes(usage.totalBytes)} · ${count} site${count === 1 ? '' : 's'}`;
    // The list first: the bar's segments point at its rows.
    renderList(parts);
    renderUsageBar(parts);
  }

  /**
   * The usage bar: composition, not fullness.
   *
   * There is no total quota to be full against — the vault grows with the sites
   * the user approves — so a bar filling toward a made-up ceiling would be
   * telling them nothing. Instead it is always full, divided into each site's
   * share of what is stored, oldest first, in two alternating shades. Empty, it
   * is one inert grey span rather than a full vault.
   *
   * Hovering a segment highlights its row, which is the only thing that says
   * WHICH site a sliver belongs to.
   */
  function renderUsageBar(parts) {
    if (!usageFill) return;
    if (!parts.length) {
      const empty = document.createElement('div');
      empty.className = 'vault-usage-seg empty';
      empty.style.width = '100%';
      usageFill.replaceChildren(empty);
      return;
    }

    // Oldest first, so a site keeps its place as the others grow. `connectedAt`
    // is when the user approved it; a legacy record without one sorts first.
    const ordered = [...parts].sort((a, b) => (a.connectedAt || 0) - (b.connectedAt || 0));
    const total = ordered.reduce((sum, p) => sum + (p.bytes || 0), 0);
    const segments = ordered.map((p, i) => {
      const seg = document.createElement('div');
      seg.className = `vault-usage-seg ${i % 2 === 0 ? 'a' : 'b'}`;
      // Before anyone has written, every share is 0/0: split the bar evenly
      // rather than collapsing it, since the sites do exist.
      const share = total > 0 ? ((p.bytes || 0) / total) * 100 : 100 / ordered.length;
      seg.style.width = `${share}%`;
      // No tooltip: hovering already answers the question by lighting up the
      // site's row, which says more than a tooltip could and says it where the
      // user is about to click.
      seg.dataset.namespace = p.namespace;
      const row = rowsByNamespace.get(p.namespace);
      if (row) {
        seg.addEventListener('mouseenter', () => row.classList.add('is-hovered'));
        seg.addEventListener('mouseleave', () => row.classList.remove('is-hovered'));
      }
      return seg;
    });
    usageFill.replaceChildren(...segments);
  }

  /** Swap the whole pane between its locked prompt and its normal content. */
  function setLocked(locked) {
    if (lockedView) lockedView.classList.toggle('hidden', !locked);
    // Hide every real view while locked, and drop any stale rows so nothing
    // survives behind the prompt.
    if (locked) {
      hideConnectionBanner();
      listView.classList.add('hidden');
      detailView.classList.add('hidden');
      requestView.classList.add('hidden');
      clearRequest();
      // replaceChildren, not innerHTML: the rows go for certain, and this
      // module's one rule is that nothing on this path writes markup.
      listEl.replaceChildren();
      rowsByNamespace.clear();
      usageText.textContent = '';
      if (usageFill) usageFill.replaceChildren();
      currentNs = null;
    } else if (listView.classList.contains('hidden') && detailView.classList.contains('hidden') && requestView.classList.contains('hidden')) {
      listView.classList.remove('hidden');
    }
  }

  /**
   * A site's thumbnail: the icon it supplied, validated and pinned at consent,
   * or the deterministic monogram for a site that shipped none. Same pair the
   * launcher's tiles use (src/renderer/pages/scripts/dapps.js), and the same
   * reading of it: site art buys recognition, never verification — the row
   * names the origin the browser itself observed.
   */
  function monogramEl(monogram) {
    const el = document.createElement('div');
    el.className = 'vault-row-thumb vault-row-monogram';
    const { letter = '?', hue = 0 } = monogram || {};
    // Derived from the namespace, so the same site paints the same everywhere.
    // Set here rather than in CSS because the hue is data, not theme.
    el.style.color = `hsl(${hue} 70% 88%)`;
    el.style.background = `hsl(${hue} 42% 32%)`;
    el.style.borderColor = `hsl(${hue} 42% 42%)`;
    el.textContent = letter;
    el.setAttribute('aria-hidden', 'true');
    return el;
  }

  function thumbEl(icon, monogram) {
    if (!icon) return monogramEl(monogram);
    const img = document.createElement('img');
    img.className = 'vault-row-thumb';
    img.src = icon;
    img.alt = '';
    img.draggable = false;
    // A pinned data URI that will not decode falls back rather than leaving a
    // broken-image box in the chrome.
    img.addEventListener('error', () => img.replaceWith(monogramEl(monogram)), { once: true });
    return img;
  }

  /**
   * The site row the Data pane lists a partition with — the open button
   * included. The consent sheet uses the same builder, so the same site
   * renders identically in both places, controls and all.
   *
   * Named with its scheme (`https://`, `ipfs://`, …), not the host alone: the
   * scheme is part of what the partition is keyed by, so two rows that differ
   * only in it are two partitions and must not read as one site.
   */
  function siteItem(origin, meta, art = {}) {
    const label = originLabel(origin);
    const row = document.createElement('div');
    row.className = 'vault-row';

    const info = document.createElement('div');
    info.className = 'vault-row-info';
    const name = document.createElement('div');
    name.className = 'vault-row-host';
    name.textContent = label;
    name.title = label;
    const metaEl = document.createElement('div');
    metaEl.className = 'vault-row-meta';
    metaEl.textContent = meta;
    info.appendChild(name);
    info.appendChild(metaEl);
    row.appendChild(info);

    // Open the site, rather than delete its data. Deleting lives one level in,
    // on the detail view, where the data being destroyed is on screen.
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'vault-row-open';
    open.title = `Open ${label} in a new tab`;
    open.appendChild(thumbEl(art.icon || null, art.monogram || null));
    open.disabled = !openInNewTab;
    open.addEventListener('click', (e) => {
      e.stopPropagation();
      openInNewTab?.(origin);
    });
    row.appendChild(open);
    return row;
  }

  /** The meta line of a site row: what the partition holds. */
  function siteMeta(bytes, fieldCount) {
    return `${fmtBytes(bytes)} · ${fieldCount} field${fieldCount === 1 ? '' : 's'}`;
  }

  function renderList(parts) {
    rowsByNamespace.clear();
    listEl.innerHTML = '';
    if (!parts.length) {
      listEl.innerHTML = '<div class="vault-empty">No sites have stored data yet</div>';
      return;
    }
    for (const p of parts) {
      const row = siteItem(p.origin, siteMeta(p.bytes, (p.fields || []).length), p);
      row.dataset.namespace = p.namespace;
      row.children[0].addEventListener('click', () => showDetail(p));
      listEl.appendChild(row);
      rowsByNamespace.set(p.namespace, row);
    }
  }

  function hideConnectionBanner() {
    bannerPartition = null;
    connectionBanner?.classList.add('hidden');
  }

  function describeFields(fields, partition) {
    const sites = (n) => `${n} site${n === 1 ? '' : 's'}`;
    // Appended only when non-zero, and on the existing line: a third line would
    // change the banner's height on every partition that has neither.
    const cross = [];
    if (partition?.foreignReadCount) cross.push(`reads ${sites(partition.foreignReadCount)}`);
    if (partition?.readerCount) cross.push(`read by ${sites(partition.readerCount)}`);
    const tail = cross.length ? ` · ${cross.join(' · ')}` : '';

    if (!fields.length) return `no fields granted${tail}`;
    const writable = fields.filter((f) => f.write).length;
    const label = `${fields.length} field${fields.length === 1 ? '' : 's'}`;
    return `${writable ? `${label} · ${writable} writable` : `${label} · read only`}${tail}`;
  }

  async function updateConnectionBanner() {
    if (!connectionBanner || !window.vaultData?.partitionForUrl) return;

    const displayUrl = document.getElementById('address-input')?.value || '';
    if (!displayUrl) {
      hideConnectionBanner();
      return;
    }

    let partition;
    try {
      partition = await window.vaultData.partitionForUrl(displayUrl);
    } catch (err) {
      console.error('[vault-data] connection lookup failed', err);
      hideConnectionBanner();
      return;
    }

    if (!partition) {
      hideConnectionBanner();
      return;
    }

    bannerPartition = partition;
    // The permission key, not the site's claimed name — same value the wallet and
    // Swarm banners show, and unlike appMetadata.name it is not page-controlled.
    connectionSite.textContent = getPermissionKey(displayUrl) || hostOf(partition.origin);
    connectionFields.textContent = describeFields(partition.fields || [], partition);
    connectionBanner.classList.remove('hidden');
  }

  async function showDetail(p) {
    currentNs = p.namespace;
    // The same row the list and the consent sheet use, so a site looks the same
    // wherever it appears. It stands where the namespace line and the field
    // pills were: the row already names the origin and counts the fields.
    if (detailSite) {
      detailSite.replaceChildren(siteItem(p.origin, siteMeta(p.bytes, (p.fields || []).length), p));
    }
    detailJson.textContent = 'Loading…';
    renderForeignGrants(p.namespace);
    setView('detail');
    try {
      const res = await window.vaultData.getPartitionData(p.namespace);
      if (res.locked) {
        detailJson.textContent = '🔒 Vault locked — unlock to view stored data.';
      } else if (res.unreadable) {
        detailJson.textContent = describeUnreadable(res.unreadable);
      } else {
        detailJson.textContent = JSON.stringify(res.data, null, 2);
      }
    } catch (err) {
      detailJson.textContent = `Error: ${err.message}`;
    }
  }

  /**
   * One cross-origin read, as a permission item: the other partition's
   * namespace and the read box. `direction` is `out` (this site reads that
   * one) or `in` (that one reads this site) — the same grant from either end,
   * which is why both are the same item and differ only by the edge colour its
   * group's sub-label names.
   *
   * Unticking turns the read off and keeps the item, so the user can turn it
   * back on later — which is why there is no `Remove access` here. The box
   * answers from stored state on every render, so what it shows is what the
   * grant says rather than what was clicked.
   */
  function permissionItem(namespace, enabled, direction, onToggle) {
    const row = document.createElement('div');
    row.className = `vault-perm ${direction}`;

    const ns = document.createElement('span');
    ns.className = 'vault-perm-ns';
    ns.textContent = namespace;
    ns.title = namespace;

    const tog = document.createElement('label');
    tog.className = 'vault-perm-tog';
    const text = document.createElement('span');
    text.textContent = 'read';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'vault-perm-box';
    box.checked = enabled;
    box.dataset.namespace = namespace;
    box.addEventListener('change', () => onToggle(box.checked));
    tog.appendChild(text);
    tog.appendChild(box);

    row.appendChild(ns);
    row.appendChild(tog);
    return row;
  }

  /**
   * Paint both directions and the one header above them. Each group hides with
   * its own rows; the header hides only when the site has neither direction,
   * since an ordinary site has none of this and a permanently empty heading on
   * every partition is noise.
   */
  function paintGrants(reads, readers) {
    detailReads.replaceChildren(...reads);
    detailReaders.replaceChildren(...readers);
    if (detailReadsGroup) detailReadsGroup.classList.toggle('hidden', reads.length === 0);
    if (detailReadersGroup) detailReadersGroup.classList.toggle('hidden', readers.length === 0);
    if (permsHeader) permsHeader.classList.toggle('hidden', reads.length + readers.length === 0);
  }

  /** Fill (or hide) both cross-origin directions for one partition. */
  async function renderForeignGrants(namespace) {
    if (!detailReads || !detailReaders) return;
    paintGrants([], []); // nothing stale on screen behind the lookup
    if (!window.vaultData?.foreignGrantsFor) return;

    let grants;
    try {
      grants = await window.vaultData.foreignGrantsFor(namespace);
    } catch (err) {
      console.error('[vault-data] cross-origin grant lookup failed', err);
      return;
    }
    if (!grants || grants.locked || currentNs !== namespace) return;

    paintGrants(
      (grants.reads || []).map((e) =>
        permissionItem(e.ownerNamespace, e.enabled !== false, 'out', async (on) => {
          await window.vaultData.setForeignReadEnabled(namespace, e.ownerNamespace, on);
          renderForeignGrants(namespace);
        })
      ),
      // The owner's end of the same grant, so the same item and the same
      // state: a read the reader switched off reads as off here too, rather
      // than telling the owner they are being read when they are not.
      (grants.readers || []).map((e) =>
        permissionItem(e.readerNamespace, e.enabled !== false, 'in', async (on) => {
          await window.vaultData.setForeignReadEnabled(e.readerNamespace, namespace, on);
          renderForeignGrants(namespace);
        })
      )
    );
  }

  /**
   * A partition whose sealed blob will not open. Wrong identity and corruption
   * fail identically at the cipher; the engine tells them apart with the owner
   * fingerprint it records on save, and each deserves a different next step.
   */
  function describeUnreadable({ reason }) {
    switch (reason) {
      case 'wrong-identity':
        return (
          '⚠ Sealed under a different identity.\n\n' +
          'This data was written while a different mnemonic was unlocked. ' +
          'Unlock with that identity to read it, or delete it to start over.'
        );
      case 'corrupt':
        return (
          '⚠ Stored data is corrupt.\n\n' +
          'The identity is right but the sealed data failed to verify — most likely a torn write. ' +
          'It cannot be recovered; delete it so the site can start over.'
        );
      default:
        return (
          '⚠ Stored data cannot be read.\n\n' +
          'It failed to verify and the store predates identity fingerprints, so the cause is unknown. ' +
          'If your mnemonic has not changed, treat it as corrupt and delete it.'
        );
    }
  }

  /** Leave the request view with nothing from it able to bleed into the next one. */
  function clearRequest() {
    if (reqFields) reqFields.replaceChildren();
    if (reqOwn) reqOwn.replaceChildren();
    if (reqForeignBlock) reqForeignBlock.classList.add('hidden');
    if (reqSharedNote) reqSharedNote.classList.add('hidden');
  }



  function showList() {
    clearRequest();
    setView('list');
    refresh();
  }

  /** Bumped per request, so a late cache hit can't paint over a newer prompt. */
  let requestGeneration = 0;
  /** Re-checks of a cold favicon cache: 6 × 500ms covers a page load. */
  const FAVICON_RETRIES = 6;
  const FAVICON_RETRY_MS = 500;

  function paintRequestFavicon(src, generation) {
    reqFavicon.onerror = () => {
      if (generation !== requestGeneration) return;
      reqIcon.classList.remove('has-favicon');
      reqIcon.classList.add('hidden');
    };
    reqFavicon.src = src;
    reqIcon.classList.remove('hidden');
    reqIcon.classList.add('has-favicon');
  }

  /**
   * Empty the tile. `removeAttribute`, never `src = ''`: an empty src resolves
   * against the document URL, so the browser loads this page as an image, fails,
   * and fires `error` — on whatever handler is still attached from the previous
   * prompt, whose job is to hide the tile. Detach first for the same reason.
   */
  function clearRequestFavicon() {
    reqFavicon.onerror = null;
    reqFavicon.removeAttribute('src');
    reqIcon.classList.remove('has-favicon');
    reqIcon.classList.add('hidden');
  }

  /**
   * Paint the requesting site's icon, the way the wallet's Connect pane does.
   *
   * The site's own icon comes first. It rode in with the request and main has
   * already clamped it (data: URI, PNG/JPEG/WebP, size and dimension capped),
   * and it is the same icon the launcher tile will carry — so the user approves
   * exactly what they will later see, with nothing fetched.
   *
   * Only without one do we fall back to the favicon cache, and that fallback is
   * racy by construction: the cache is filled by the tab strip, which pairs
   * `did-stop-loading` with `page-favicon-updated` before it fetches anything,
   * so a site calling `vault.connect()` early in its boot raises this sheet
   * before its own icon has been fetched, and a first visit starts cold
   * regardless. Re-check for a few seconds while the sheet is up rather than
   * taking one lookup as final; still never fetch, because this pane must not
   * make a network request on a site's behalf.
   */
  function showRequestFavicon(site, icon) {
    if (!reqIcon || !reqFavicon) return;
    const generation = ++requestGeneration;
    clearRequestFavicon();

    // `icon` is main's normalized icon record, not a URL — the launcher flattens
    // the same field with `p.icon.dataUri`. Handed to `img.src` whole it
    // stringifies to "[object Object]" and the tile fails every time.
    const inBand = typeof icon === 'string' ? icon : icon && icon.dataUri;
    if (inBand) {
      paintRequestFavicon(inBand, generation);
      return;
    }
    if (!site || !window.electronAPI?.getCachedFavicon) return;

    let attempts = 0;
    const check = () => {
      if (generation !== requestGeneration) return;
      window.electronAPI
        .getCachedFavicon(site)
        .then((favicon) => {
          if (generation !== requestGeneration) return;
          if (favicon) {
            paintRequestFavicon(favicon, generation);
            return;
          }
          if (++attempts < FAVICON_RETRIES) setTimeout(check, FAVICON_RETRY_MS);
        })
        .catch(() => {});
    };
    check();
  }

  // --- consent request (a site is asking for access) -------------------------

  /**
   * One read-access row: a bullet, the owner's namespace as code, and a single
   * checkbox beside it. One box because a cross-partition grant is read-only in
   * the engine, so there is nothing to choose between.
   */
  function readAccessRow(namespace) {
    const row = document.createElement('li');
    row.className = 'vault-req-read';

    const ns = document.createElement('span');
    ns.className = 'vault-req-ns';
    ns.textContent = namespace;
    ns.title = namespace;
    row.appendChild(ns);

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'vault-req-box';
    cb.dataset.namespace = namespace;
    cb.checked = true;
    row.appendChild(cb);
    return row;
  }

  function showRequest(req) {
    // The origin main derived from the sender frame — the one thing on this
    // sheet the page cannot choose. The site's claimed name is deliberately not
    // shown: the wallet's Connect pane names the origin and nothing else, and a
    // page-supplied name sitting above it would be the spoofable half.
    const site = req.origin || req.namespace || '';
    if (reqSite) reqSite.textContent = originLabel(site);
    showRequestFavicon(site, req.icon);

    const requestedFields = (req.requestedScopes || []).flatMap((s) =>
      (s.fields || []).filter((f) => !f.origin)
    );

    // The same row the Data pane lists a site with, standing where the
    // connection badge used to: identical builder, identical controls, and the
    // same meta line — empty, since the partition does not exist yet.
    if (reqOwn) {
      reqOwn.replaceChildren(
        siteItem(site, siteMeta(0, requestedFields.length), {
          icon: req.icon && req.icon.dataUri,
          monogram: req.monogram,
        })
      );
    }

    // The one thing this sheet has to say that the rows do not: a write at or
    // below `/shared` is what makes this site's data publishable. Rooted AT or
    // BELOW, because that is exactly what the engine's publish gate requires —
    // a whole-document grant carries every other right but not this one, so it
    // must not raise the note either. Token-wise, so `/sharedly` is not
    // `/shared`.
    if (reqSharedNote) {
      const publishes = requestedFields.some(
        (f) => f.write === true && (f.path === '/shared' || f.path.startsWith('/shared/'))
      );
      reqSharedNote.classList.toggle('hidden', !publishes);
    }

    // Built only from main's resolved list: that alone has been through
    // deriveOriginNamespace, so a reader cannot name one site's partition while
    // spending a grant on another.
    const foreign = [...(req.foreignReads || [])].sort((a, b) =>
      a.namespace < b.namespace ? -1 : 1
    );
    reqFields.replaceChildren(...foreign.map((entry) => readAccessRow(entry.namespace)));
    if (reqForeignBlock) reqForeignBlock.classList.toggle('hidden', foreign.length === 0);

    // Surface it: open the sidebar + switch to the Data tab, then show the request.
    openAndFocus();
    setView('request');

    const methods = [...new Set((req.requestedScopes || []).flatMap((s) => s.methods || []))];

    reqAllow.onclick = () => {
      const declined = new Set();
      reqFields.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        if (!cb.checked) declined.add(cb.dataset.namespace);
      });
      // Narrowed to what a grant is made of: main's `wholesale` and `known` are
      // hints for this sheet, and the host persists whatever comes back.
      const grantedForeignReads = (req.foreignReads || [])
        .filter((e) => !declined.has(e.namespace))
        .map((e) => ({ namespace: e.namespace, origin: e.origin, paths: e.paths }));

      window.vaultData.respondConsent(req.id, {
        approved: true,
        grantedMethods: methods,
        grantedFields: requestedFields,
        grantedForeignReads,
        writePolicy: 'ask-once-per-session',
      });
      showList();
    };
    reqDeny.onclick = () => {
      window.vaultData.respondConsent(req.id, { approved: false, reason: 'user denied' });
      showList();
    };
  }

  if (connectionManage) {
    connectionManage.addEventListener('click', () => {
      if (bannerPartition) showDetail(bannerPartition);
    });
  }

  // Same hooks the other three banners use, so the banner always describes the
  // page you are looking at.
  document.addEventListener('sidebar-opened', () => {
    updateConnectionBanner();
  });
  document.addEventListener('navigation-completed', () => {
    updateConnectionBanner();
  });

  refreshConnectionBanner = updateConnectionBanner;

  backBtn.addEventListener('click', showList);
  detailDelete.addEventListener('click', async () => {
    if (!currentNs) return;
    if (!window.confirm('Delete all data for this site? This cannot be undone.')) return;
    await window.vaultData.deletePartition(currentNs);
    showList();
  });
  exportBtn.addEventListener('click', async () => {
    try {
      const r = await window.vaultData.exportVault();
      if (r && r.saved) {
        exportBtn.textContent = 'Exported ✓';
        setTimeout(() => {
          exportBtn.textContent = 'Export vault';
        }, 1500);
      }
    } catch (err) {
      console.error('[vault-data] export failed', err);
    }
  });
  clearBtn.addEventListener('click', async () => {
    if (!window.confirm('Delete ALL vault data for every site? This cannot be undone.')) return;
    await window.vaultData.clearAll();
    refresh();
  });

  if (unlockBtn && requestUnlock) {
    unlockBtn.addEventListener('click', async () => {
      unlockBtn.disabled = true;
      try {
        // Check first, the way every other caller of the browser's unlock screen
        // does (dapp-provider, swarm-provider, publisher-identities,
        // permission-manage). That screen SHOWS an unlock; it does not decide
        // whether one is needed — so asking for it against a vault that is
        // already open prompts the user for Touch ID a second time. This view
        // can be on screen with stale state: the consent flow unlocks the vault
        // behind it, and its refresh has not landed yet.
        const usage = await window.vaultData.getUsage();
        if (!usage.unlocked) await requestUnlock();
      } catch {
        // cancelled — refresh re-reads the real lock state either way
      } finally {
        unlockBtn.disabled = false;
        refresh();
      }
    });
  }

  // Consent: main pushes a request when a site connects for the first time.
  if (window.vaultData && window.vaultData.onConsentRequest) {
    window.vaultData.onConsentRequest(showRequest);
    window.vaultData.signalReady();
  }

  // A site wrote to its partition. The list renders at consent time — before
  // the site's first write — so its sizes go stale the moment the site saves.
  // Re-list while the list is showing; a detail or request view is left alone.
  // Debounced: a site saving in a burst would otherwise re-stat every partition
  // per write.
  let partitionRefreshTimer = null;
  if (window.vaultData && window.vaultData.onPartitionChanged) {
    window.vaultData.onPartitionChanged(() => {
      if (listView.classList.contains('hidden')) return;
      clearTimeout(partitionRefreshTimer);
      partitionRefreshTimer = setTimeout(refresh, 250);
    });
  }

  return { refresh, updateConnectionBanner };
}
