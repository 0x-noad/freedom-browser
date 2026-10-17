// Talks only to window.vaultHome (owner plane, guarded in the webview
// preload AND authoritatively in main by senderFrame). No innerHTML: every
// name and icon here is ultimately site-supplied.
const els = {
  subtitle: document.getElementById('subtitle'),
  locked: document.getElementById('locked'),
  unlockBtn: document.getElementById('unlock-btn'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
};

function show(el, visible) {
  if (el) el.classList.toggle('hidden', !visible);
}

function monogramEl(tile) {
  const mono = document.createElement('div');
  mono.className = 'tile-icon tile-monogram';
  const { letter = '?', hue = 0 } = tile.monogram || {};
  // Deterministic per namespace, so the same site paints the same on every
  // device; light enough text on a mid-saturation fill to read on either theme.
  mono.style.color = `hsl(${hue} 70% 88%)`;
  mono.style.background = `hsl(${hue} 42% 32%)`;
  mono.style.borderColor = `hsl(${hue} 42% 42%)`;
  mono.textContent = letter;
  mono.setAttribute('aria-hidden', 'true');
  return mono;
}

function iconEl(tile) {
  const img = document.createElement('img');
  img.className = 'tile-icon';
  img.src = tile.icon;
  img.alt = '';
  img.draggable = false;
  img.addEventListener('error', () => img.replaceWith(monogramEl(tile)), { once: true });
  return img;
}

function tileEl(tile) {
  const btn = document.createElement('button');
  btn.className = 'tile';
  btn.type = 'button';
  // Always carry the host the browser actually observed: site-supplied art
  // buys recognition, not verification.
  btn.setAttribute('aria-label', tile.host ? `${tile.name} — ${tile.host}` : tile.name);
  btn.title = tile.host || tile.namespace;
  btn.appendChild(tile.icon ? iconEl(tile) : monogramEl(tile));

  const label = document.createElement('span');
  label.className = 'tile-name';
  label.textContent = tile.name;
  btn.appendChild(label);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      // Pass the namespace, never a URL — main owns the destination.
      const res = await window.vaultHome.open(tile.namespace);
      if (!res || !res.opened) btn.disabled = false;
    } catch {
      btn.disabled = false;
    }
  });
  return btn;
}

function renderGrid(tiles) {
  els.grid.replaceChildren();
  for (const tile of tiles) els.grid.appendChild(tileEl(tile));
  show(els.grid, tiles.length > 0);
  show(els.empty, tiles.length === 0);
}

async function refresh() {
  if (!window.vaultHome) {
    els.subtitle.textContent = 'Vault unavailable.';
    return;
  }
  const status = await window.vaultHome.status();
  if (!status.unlocked) {
    els.subtitle.textContent = '';
    show(els.locked, true);
    show(els.grid, false);
    show(els.empty, false);
    return;
  }
  show(els.locked, false);
  const { tiles } = await window.vaultHome.tiles();
  const n = tiles.length;
  els.subtitle.textContent = n ? `${n} site${n === 1 ? '' : 's'} with data in your vault` : '';
  renderGrid(tiles);
}

els.unlockBtn.addEventListener('click', async () => {
  els.unlockBtn.disabled = true;
  try {
    await window.vaultHome.requestUnlock();
    await refresh();
  } finally {
    els.unlockBtn.disabled = false;
  }
});

// The vault may have been locked/unlocked, or a new site granted, while
// this tab sat in the background.
window.addEventListener('focus', () => {
  refresh().catch(() => {});
});

refresh().catch((err) => {
  els.subtitle.textContent = `Error: ${err && err.message}`;
});
