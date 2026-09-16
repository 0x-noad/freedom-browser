/**
 * Wire the VAULT data vault into the browser (main process).
 *
 * One call from bootstrap: serves the `window.vault` inject source to webview
 * preloads, creates the DataVaultManager on top of the browser's existing
 * identity vault (one unlock covers both), and registers every IPC channel.
 */

const { app, ipcMain, dialog, nativeImage, BrowserWindow } = require('electron');
const identity = require('../identity/vault');
const { DataVaultManager } = require('./data-vault-manager');
const VAULT_INJECT_SOURCE = require('./vault-provider-inject');

/** The internal page allowed to reach the owner-plane home API. */
const HOME_PAGE_FILE = '/pages/dapps.html';

/**
 * Authoritative check that a home-page request came from freedom://dapps.
 * `window.vaultHome` is exposed by the SHARED webview preload, so the
 * renderer-side guard there is not a boundary on its own — this is.
 */
function isHomeFrame(event) {
  const url = (event && event.senderFrame && event.senderFrame.url) || '';
  if (!url.startsWith('file://')) return false;
  try {
    return new URL(url).pathname.endsWith(HOME_PAGE_FILE);
  } catch {
    return false;
  }
}

/** The wallet window that registered itself as the consent UI. */
let consentTarget = null;
/** id -> resolve, for consent round-trips in flight. */
const pendingConsent = new Map();
let consentSeq = 0;

/**
 * Consent sheet: a round-trip to the "Data" pane, which renders the requested
 * fields as per-field read/write toggles. Whatever the user leaves enabled IS
 * the grant, so they can downgrade or drop fields rather than face all-or-nothing.
 *
 * Falls back to a native dialog only if no wallet window has registered — better
 * a coarse prompt than a silent grant or a hang.
 */
async function promptConsent(req) {
  const fields = (req.requestedScopes || []).flatMap((s) => s.fields || []);
  const methods = [...new Set((req.requestedScopes || []).flatMap((s) => s.methods || []))];
  const name = (req.appMetadata && req.appMetadata.name) || 'A website';

  if (consentTarget && !consentTarget.isDestroyed()) {
    const id = `consent-${++consentSeq}`;
    const decision = await new Promise((resolve) => {
      pendingConsent.set(id, resolve);
      consentTarget.webContents.send('datavault:consent-request', { ...req, id });
    });
    return decision;
  }

  const fieldList = fields.map((f) => `  • ${f.path} ${f.write ? '(read + write)' : '(read only)'}`).join('\n');
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Deny', 'Allow'],
    defaultId: 0,
    cancelId: 0,
    title: 'Data vault request',
    message: `${name} wants a data vault`,
    detail: `${req.origin}\n\nIt is asking to store and read:\n${fieldList}\n\nIt can only ever see its own slice — never another site's.`,
  });
  if (response !== 1) return { approved: false, reason: 'user denied' };
  return { approved: true, grantedMethods: methods, grantedFields: fields, writePolicy: 'ask-once-per-session' };
}

/** id -> resolve, for unlock round-trips in flight. */
const pendingUnlock = new Map();
let unlockSeq = 0;

/**
 * Ask the shell renderer to show the browser's own unlock screen (Touch ID or
 * password) and wait for the outcome. The data vault has no unlock UI of its
 * own — one unlock covers the identity vault and the data vault — and the
 * launcher page is a webview that cannot reach the sidebar directly.
 */
async function requestUnlockFromUi() {
  if (identity.isUnlocked()) return true;
  if (!consentTarget || consentTarget.isDestroyed()) return false;
  const id = `unlock-${++unlockSeq}`;
  return new Promise((resolve) => {
    pendingUnlock.set(id, resolve);
    consentTarget.webContents.send('datavault:show-unlock', { id });
  });
}

/** Wire the consent + unlock round-trip channels. */
function registerConsentBridge() {
  ipcMain.on('datavault:unlock-result', (_event, { id }) => {
    const resolve = pendingUnlock.get(id);
    if (!resolve) return;
    pendingUnlock.delete(id);
    resolve(identity.isUnlocked());
  });

  ipcMain.on('datavault:ui-ready', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      consentTarget = win;
      win.on('closed', () => {
        if (consentTarget === win) consentTarget = null;
      });
    }
  });

  ipcMain.on('datavault:consent-response', (_event, { id, decision }) => {
    const resolve = pendingConsent.get(id);
    if (!resolve) return;
    pendingConsent.delete(id);
    resolve(decision || { approved: false, reason: 'no decision' });
  });
}

function registerDataVault() {
  // Serve the provider source to webview preloads (mirrors the ethereum inject).
  ipcMain.on('internal:get-vault-inject-source', (event) => {
    event.returnValue = VAULT_INJECT_SOURCE;
  });

  registerConsentBridge();

  const manager = new DataVaultManager({
    dataDir: app.getPath('userData'),
    identityVault: {
      isUnlocked: () => identity.isUnlocked(),
      getMnemonic: () => identity.getMnemonic(),
      // The browser's unlock screen lives in the sidebar renderer; drive it and
      // wait, rather than failing closed when a site connects while locked.
      ensureUnlocked: requestUnlockFromUi,
    },
    promptConsent,
    // Tiles pass a namespace; main resolved it to the origin it observed itself.
    openUrl: (url) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      if (win) win.webContents.send('tab:new-with-url', url);
    },
    isHomeFrame,
    nativeImage,
    // Keep the "Data" pane's listed sizes live. Same window the consent sheet
    // renders in; nothing to do if it hasn't registered yet.
    onPartitionChanged: (namespace) => {
      if (consentTarget && !consentTarget.isDestroyed()) {
        consentTarget.webContents.send('datavault:partition-changed', { namespace });
      }
    },
  });

  manager.register();
  return manager;
}

module.exports = { registerDataVault, isHomeFrame, HOME_PAGE_FILE };
