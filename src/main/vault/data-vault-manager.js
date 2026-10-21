/**
 * Data-Vault Manager (Freedom Browser integration, main process)
 *
 * The single VAULT host for the browser. Owns one VaultEngine in TRUSTED host
 * mode (Option B) and routes each page's `window.vault` requests to it. The
 * authoritative origin comes from `event.senderFrame.url` — NEVER from anything
 * the page sends — which is what makes per-origin isolation real: the page cannot
 * name another site's namespace.
 *
 * A cross-origin read is not an exception to that. A site may read another's
 * data, but only what the owner published under `/shared`, only for a
 * reader->owner pair the user approved, and only through an owner ORIGIN that the
 * engine resolves to a namespace itself. The reader's identity still comes from
 * its frame; the owner's comes from a stored grant. A page can widen neither by
 * asserting anything.
 *
 * Security responsibilities that live HERE (not in the engine):
 *  - Derive the authoritative origin from the sender frame and map it to a VAULT
 *    namespace via deriveOriginNamespace.
 *  - Bind every session to the webContents that created it, so one tab/page can
 *    never drive another's session (the engine trusts the sessionId it is given).
 *  - Forward a cross-origin read's owner origin to the engine VERBATIM, so the
 *    one place an origin becomes a namespace stays `deriveOriginNamespace`.
 *    `originForNamespace` below is laxer — it strips a path rather than refusing
 *    one — so normalising first would launder an origin the engine would reject.
 *  - Remember approved grants (data-vault-permissions.js) so a returning site
 *    reconnects without a prompt (decisions #1/#3), and tear down live sessions
 *    when the user revokes.
 *
 * REFERENCE glue for `solardev-xyz/freedom-browser` — copy into `src/main/vault/`.
 * Follow the architecture-boundaries + new-IPC-channel playbooks when wiring it.
 */

const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const { VaultEngine } = require('./vendor/vault-core');
const { deriveOriginNamespace, storageKeyForNamespace } = require('./vendor/crypto-core');
// Imported rather than reimplemented: `covers()` below and the engine's own
// authorization must agree on token-boundary pointer matching, and a second
// hand-rolled copy of that rule is exactly what drifts.
const { pointerCovers } = require('./vendor/vault-core');
const CH = require('./vault-ipc-channels');
const perms = require('./data-vault-permissions');
const { DataVaultKeystore } = require('./data-vault-keystore');
const { DataVaultStorage } = require('./data-vault-storage');
const { normalizeIcon, monogramFor, sanitizeName } = require('./data-vault-icon');
const { resetVaultAutoLockTimer } = require('../vault-timer');

/** Schemes the home page is allowed to launch. Anything else (javascript:, file:,
 *  data:, blob:) is rejected — the launcher must never become a way to navigate
 *  the browser somewhere a stored grant didn't come from. */
const LAUNCHABLE_SCHEMES = new Set(['http', 'https', 'ipfs', 'ipns', 'bzz', 'swarm', 'ens', 'ar', 'rad', 'hyper']);

const EXPORT_FORMAT = 'vault3r-data-export/2';
/** Reserved key for vault-owned metadata; distinct from any site's namespace. */
const META_STORAGE_KEY = storageKeyForNamespace('meta:export-permissions');
const META_AAD = `${EXPORT_FORMAT}|permissions`;

// VAULT method names (mirror @vault/protocol Method).
const M = {
  connect: 'vault_connect',
  getData: 'vault_getData',
  getSharedData: 'vault_getSharedData',
  setData: 'vault_setData',
  patchData: 'vault_patchData',
  subscribe: 'vault_subscribe',
  unsubscribe: 'vault_unsubscribe',
  revoke: 'vault_revoke',
  getPermissions: 'vault_getPermissions',
  requestUnlock: 'vault_requestUnlock',
};

// Methods every grant carries, whatever the site asked for. The engine gates
// `vault_getPermissions` on its own presence in the granted method list, so a
// site that requests only read/write scopes cannot read back the grant it
// already holds — a confusing failure that leaks nothing when allowed, since
// the caller is asking about permissions it was itself given.
// `vault_getSharedData` is deliberately NOT here: this set exists for a method
// that tells a caller only about itself, and that one is the cross-origin
// surface. Holding it is the recorded fact that the site intends to read
// another site's published data, so it has to be asked for.
const ALWAYS_GRANTED_METHODS = [M.getPermissions];

/**
 * Unlock-prompt policy for `vault_requestUnlock`.
 *
 * The prompt is the browser's own unlock screen, so a site that could raise it
 * freely would own a nuisance surface. Holding a live session is the first
 * gate; these bound what a granted site can still do with it. The shape follows
 * Chromium's permission embargo (and the site-permissions manager's): a
 * dismissal is not a denial, but repeated dismissals stop the asking.
 */
const UNLOCK_COOLDOWN_MS = 60_000;
/** Consecutive dismissals before a namespace stops being able to prompt. */
const UNLOCK_MAX_DISMISSALS = 3;
/**
 * Consent prompts a namespace may have the user reject before it stops being
 * able to raise one, and how long that embargo lasts.
 *
 * The consent sheet is a modal: it covers the sidebar's tab bar so a request
 * can only be answered, which is what keeps it from being lost behind a click.
 * That is also what makes a loop of `connect()` calls worth refusing — a page
 * that re-asks on every rejection would otherwise hold the sidebar hostage.
 * Same shape as the unlock embargo above, and the same reasoning.
 */
const CONSENT_MAX_REJECTIONS = 3;
const CONSENT_EMBARGO_MS = 5 * 60_000;

class DataVaultManager {
  /**
   * @param {object} deps
   * @param {string} deps.dataDir  app.getPath('userData').
   * @param {import('./data-vault-keystore').IdentityVaultBridge} deps.identityVault
   * @param {(payload: object) => Promise<object>} deps.promptConsent
   *   Show the per-site / per-field consent sheet; resolve to
   *   { approved, grantedMethods?, grantedFields?, writePolicy?, reason? }.
   * @param {(url: string) => void} [deps.openUrl]
   *   Navigate the browser to a site the user clicked on the vault home page.
   *   Supplied by the host (freedom-browser's tab API); the manager validates the
   *   namespace and scheme before ever calling it.
   * @param {(event: object) => boolean} [deps.isHomeFrame]
   *   Authoritative check that an owner-plane home-page request really came from
   *   the vault home page — `event.senderFrame.url` matched against the internal
   *   page's file URL. REQUIRED for the `datavault:home-*` channels: if the host
   *   exposes `window.vaultHome` through a preload that web content also loads
   *   (freedom-browser's shared webview preload does), a renderer-side location
   *   check is not a boundary, and enumerating the site list is exactly the
   *   cross-origin history leak the vault exists to prevent. Omit it and those
   *   channels are not registered at all.
   * @param {{ createFromBuffer: Function }} [deps.nativeImage]
   *   Electron's `nativeImage`, used to re-encode site-supplied icons. Omitted in
   *   headless tests, where validated original bytes are kept instead.
   * @param {(namespace: string) => void} [deps.onPartitionChanged]
   *   A site wrote to its partition. The "Data" pane lists partitions with their
   *   on-disk size and renders at consent time — before the site's first write —
   *   so without this it shows 0 B until the user happens to re-open the list.
   * @param {(namespace: string) => void} [deps.cancelConsent]
   *   Take a consent sheet off screen: the page that asked for it is gone, so
   *   an answer could only grant a session nobody holds.
   * @param {() => number} [deps.now]  Injectable clock (tests).
   */
  constructor({ dataDir, identityVault, promptConsent, cancelConsent, openUrl, isHomeFrame, nativeImage, onPartitionChanged, now }) {
    this._now = now || (() => Date.now());
    this._promptConsent = promptConsent;
    // Takes a sheet off screen when the page that asked for it is gone.
    // Optional: without it an abandoned prompt still settles, it just lingers.
    this._cancelConsent = typeof cancelConsent === 'function' ? cancelConsent : null;
    this._openUrl = openUrl || null;
    this._isHomeFrame = typeof isHomeFrame === 'function' ? isHomeFrame : null;
    this._nativeImage = nativeImage || null;
    this._onPartitionChanged = typeof onPartitionChanged === 'function' ? onPartitionChanged : () => {};
    this._storage = new DataVaultStorage(dataDir);
    this._keystore = new DataVaultKeystore(identityVault);

    // Per-connect consent: consult the remembered grant first; only prompt when a
    // site connects for the first time or asks for more than it was granted.
    const consent = {
      requestConnect: (req) => this._decideConsent(req),
    };

    this._engine = new VaultEngine({
      keystore: this._keystore,
      storage: this._storage,
      // The trusted path never calls the resolver/relay; a stub satisfies the type.
      resolver: { resolve: async () => null },
      consent,
      clock: { now: this._now },
    });

    /** sessionId -> { namespace, origin, webContentsId } — the session/tab binding. */
    this._sessions = new Map();
    /** namespace -> the consent request currently in flight (dedupe double-connect). */
    this._pendingByNamespace = new Map();
    /** namespace -> { rejections, embargoedUntil } — see CONSENT_MAX_REJECTIONS. */
    this._consentRefusals = new Map();
    /** namespace -> webContentsId of the frame currently asking to connect. */
    this._connectAskers = new Map();
    /** namespace -> { webContentsId, abandon } for a prompt on screen now. */
    this._consentPromptFrames = new Map();
    /** namespace -> { dismissals, lastPromptAt } for vault_requestUnlock. */
    this._unlockPrompts = new Map();
    /** The unlock prompt in flight, shared by every caller. */
    this._pendingUnlock = null;

    this._engine.setEmitter((sessionId, notification) => this._emit(sessionId, notification));
  }

  // --- lifecycle ---------------------------------------------------------------

  register() {
    // Site-facing provider path (untrusted pages via window.vault).
    ipcMain.handle(CH.VAULT_PROVIDER_REQUEST, (event, msg) => this._onRequest(event, msg));

    // Owner-facing management path (trusted wallet UI only — the "Data" pane).
    // These are on the main-window preload, NEVER reachable from a site.
    ipcMain.handle(CH.VAULT_LIST_PARTITIONS, () => this.listPartitions());
    ipcMain.handle(CH.VAULT_USAGE, () => this.getUsage());
    ipcMain.handle(CH.VAULT_GET_PARTITION_DATA, (_e, namespace) => this.getPartitionData(namespace));
    ipcMain.handle(CH.VAULT_PARTITION_FOR_URL, (_e, url) => this.partitionForUrl(url));
    ipcMain.handle(CH.VAULT_DELETE_PARTITION, (_e, namespace) => this.deletePartition(namespace));
    ipcMain.handle(CH.VAULT_CLEAR_ALL, () => this.clearAll());
    ipcMain.handle(CH.VAULT_EXPORT, () => this.exportToFile());
    ipcMain.handle(CH.VAULT_IMPORT, () => this.importFromFile());
    ipcMain.handle(CH.VAULT_FOREIGN_GRANTS, (_e, namespace) => this.foreignGrantsFor(namespace));
    ipcMain.handle(CH.VAULT_SET_FOREIGN_READ_ENABLED, (_e, args) =>
      this.setForeignReadEnabled(
        args && args.readerNamespace,
        args && args.ownerNamespace,
        args && args.enabled
      )
    );

    // Vault home page (the launcher). Read-only + navigate, nothing destructive.
    // Fail closed: without an authoritative sender check these channels would let
    // ANY frame reachable by the exposing preload enumerate the user's site list.
    if (this._isHomeFrame) {
      const homeOnly = (fn) => (event, ...args) => {
        if (!this._isHomeFrame(event)) {
          throw rpcError(4100, 'vault home API is not available to this frame');
        }
        return fn(...args);
      };
      ipcMain.handle(CH.VAULT_HOME_STATUS, homeOnly(() => this.getHomeStatus()));
      ipcMain.handle(CH.VAULT_HOME_TILES, homeOnly(() => this.listHomeTiles()));
      ipcMain.handle(CH.VAULT_HOME_OPEN, homeOnly((namespace) => this.openSite(namespace)));
      ipcMain.handle(CH.VAULT_HOME_UNLOCK, homeOnly(() => this.requestUnlock()));
    } else {
      console.warn('[DataVaultManager] no isHomeFrame check supplied — home-page channels NOT registered');
    }
    console.log('[DataVaultManager] registered');
  }

  // --- request routing ---------------------------------------------------------

  /** @private The authoritative origin of the calling frame (never page-supplied). */
  _originOf(event) {
    const frame = event.senderFrame;
    const url = frame && frame.url ? frame.url : event.sender.getURL();
    return originForNamespace(url);
  }

  /** @private */
  async _onRequest(event, { method, params }) {
    try {
      const origin = this._originOf(event);
      if (!origin) throw rpcError(4100, 'no authoritative origin for caller');

      if (method === M.connect) {
        return ok(await this._connect(event, origin, params || {}));
      }
      // All data-plane methods carry a sessionId that MUST belong to this frame.
      const sessionId = params && params.sessionId;
      const session = this._requireOwnedSession(event, origin, sessionId);

      // A site that only uses window.vault is otherwise invisible to the
      // identity vault's auto-lock timer, so writing to the vault would let it
      // lock mid-session while publishing to Swarm keeps it alive. Every
      // successful data-plane call reports activity, exactly as each Swarm
      // publishing method does (src/main/swarm/swarm-provider-ipc.js).
      const active = (value) => {
        resetVaultAutoLockTimer();
        return value;
      };
      // Writes also change what the "Data" pane shows for this partition.
      const written = (value) => {
        this._onPartitionChanged(session.namespace);
        return active(value);
      };

      switch (method) {
        case M.getData:
          return ok(active(await this._engine.localGet(sessionId, params.paths || [])));
        case M.getSharedData:
          // `params.origin` names the OWNER being asked about, never the caller:
          // the caller's identity still comes from `event.senderFrame.url`, and
          // this string can only select among owners the user already approved
          // for this session. Forwarded verbatim — `originForNamespace` is laxer
          // than the engine's `deriveOriginNamespace` (it strips a path rather
          // than refusing one), so normalising here would launder an origin the
          // engine would have rejected. `active`, never `written`: it is a read.
          return ok(
            active(await this._engine.localGetShared(sessionId, params.origin, params.paths || []))
          );
        case M.setData:
          return ok(written(await this._engine.localSet(sessionId, params.values || {}, params.baseVersion)));
        case M.patchData:
          return ok(written(await this._engine.localPatch(sessionId, params.ops || [], params.baseVersion)));
        case M.subscribe:
          return ok(active(await this._engine.localSubscribe(sessionId, params.paths || [])));
        case M.unsubscribe:
          return ok(active(await this._engine.localUnsubscribe(sessionId, params.subscriptionId)));
        case M.revoke: {
          const r = await this._engine.localRevoke(sessionId);
          this._sessions.delete(sessionId);
          return ok(r);
        }
        case M.getPermissions:
          return ok(await this._engine.localGetPermissions(sessionId));
        case M.requestUnlock:
          // Deliberately NOT an engine method and NOT gated on the grant: it
          // asks the user for the browser's own unlock screen, it reads and
          // writes nothing, and requiring it in the scope list would reproduce
          // the vault_getPermissions trap — a site cannot request what it did
          // not know to ask for. Holding this session is the authorisation.
          return ok(await this._requestUnlockForSite(session.namespace, session.origin));
        default:
          throw rpcError(4200, `method not supported: ${method}`);
      }
    } catch (err) {
      return { error: toRpcError(err) };
    }
  }

  /**
   * @private Count one rejection, and embargo the namespace at the third.
   *
   * Consecutive: an approval clears the count, because a user who says yes has
   * answered the question the count was asking. Not persisted — a restart is a
   * new situation, same as the unlock embargo.
   */
  _noteConsentRejection(namespace) {
    const state = this._consentRefusals.get(namespace) || { rejections: 0, embargoedUntil: 0 };
    state.rejections += 1;
    if (state.rejections >= CONSENT_MAX_REJECTIONS) {
      state.embargoedUntil = this._now() + CONSENT_EMBARGO_MS;
      state.rejections = 0;
    }
    this._consentRefusals.set(namespace, state);
  }

  /**
   * @private Settle a pending consent prompt whose asker is gone.
   *
   * Main cannot wait on the renderer forever. The prompt's entry is what makes
   * every later `connect()` from that site return the same promise, so an
   * unanswered one poisons every reload — a page that reloads gets the dead
   * promise, waits out its own 120s timeout, and the next reload does it again.
   * The prompt belongs to a page load: if that load is gone, answering it would
   * grant a session nobody holds, so the honest answer is a rejection.
   *
   * This is the backstop, not the mechanism. The sheet being modal is what
   * stops a request being lost in normal use; this is for the renderer dying,
   * the window closing, or any other flow hiding the sheet.
   */
  _abandonConsentFor(webContentsId) {
    for (const [namespace, entry] of this._consentPromptFrames) {
      if (entry.webContentsId !== webContentsId) continue;
      this._consentPromptFrames.delete(namespace);
      entry.abandon();
    }
  }

  /** @private Reject a sessionId that isn't bound to this exact frame/origin. */
  _requireOwnedSession(event, origin, sessionId) {
    const rec = sessionId && this._sessions.get(sessionId);
    if (!rec || rec.webContentsId !== event.sender.id || rec.origin !== origin) {
      throw rpcError(4900, 'unknown or unauthorized session');
    }
    return rec;
  }

  /** @private */
  async _connect(event, origin, params) {
    const derived = deriveOriginNamespace(origin); // throws on a non-authoritative origin
    // The consent hook below runs inside connectLocal and is handed no event,
    // so the asking frame is recorded here, keyed by the namespace it asked
    // for. That is what lets a prompt be abandoned when its page goes away.
    this._connectAskers.set(derived.namespace, event.sender.id);
    let result;
    try {
      result = await this._engine.connectLocal({
        origin,
        appMetadata: params.appMetadata || {},
        requestedScopes: params.requestedScopes || [],
      });
    } finally {
      this._connectAskers.delete(derived.namespace);
    }
    this._sessions.set(result.sessionId, {
      namespace: derived.namespace,
      origin,
      webContentsId: event.sender.id,
    });
    perms.updateLastUsed(derived.namespace, this._now());
    return { sessionId: result.sessionId, grant: result.grant, namespace: result.namespace };
  }

  /**
   * @private VaultEngine consent hook. Auto-approves from a remembered grant when
   * the site asks for no more than it was granted; otherwise shows the prompt and
   * persists the user's decision.
   */
  async _decideConsent(req) {
    const namespace = req.verification.namespace;
    const requestedMethods = uniqMethods(req.requestedScopes);
    const requestedFields = flattenFields(req.requestedScopes);
    // The engine's RESOLVED cross-origin reads: canonical owner origin, the
    // namespace it derived, paths already clamped to the published subtree.
    // Never `req.requestedScopes[].foreign`, which is the page's raw text.
    const requestedForeign = req.foreignReads || [];

    const remembered = perms.getPermission(namespace);
    if (remembered && covers(remembered, requestedMethods, requestedFields, requestedForeign)) {
      return {
        approved: true,
        grantedMethods: withAlwaysGranted(remembered.methods),
        grantedFields: remembered.fields,
        // A read the user turned off is still remembered, so `covers` still
        // answers yes and the site is not re-prompted — but the engine must not
        // be handed it, or turning it off would do nothing.
        grantedForeignReads: activeForeignReads(remembered),
        writePolicy: remembered.writePolicy,
      };
    }

    // First connect (or an escalation): ask the user. Dedupe concurrent prompts.
    if (this._pendingByNamespace.has(namespace)) {
      return this._pendingByNamespace.get(namespace);
    }

    // A site the user has said no to three times in a row stops being able to
    // raise the sheet. The sheet is modal — it covers the sidebar's tab bar so
    // a request can only be answered — so a page that re-asks on every
    // rejection would hold the sidebar hostage. Refused with the same
    // `approved: false` a rejection produces, deliberately indistinguishable
    // from the user saying no again: a page that could tell them apart could
    // count the user's refusals.
    const refusals = this._consentRefusals.get(namespace);
    if (refusals && refusals.embargoedUntil > this._now()) {
      return { approved: false, reason: 'user denied' };
    }

    // One sheet at a time, whoever asks. Two origins racing — a page and its
    // own iframe, or a handful of subdomains — would otherwise have the second
    // prompt replace the first in the renderer, leaving the first caller
    // waiting on a sheet nobody can see. Refusing the newcomer is the honest
    // half: it gets an answer, and the sheet the user is looking at is the one
    // they were already asked about.
    if (this._pendingByNamespace.size > 0) {
      return { approved: false, reason: 'another request is awaiting an answer' };
    }
    // Clamp the page's claimed name/icon ONCE, and show the consent sheet the
    // same values the home-page tile will use — the user must approve exactly
    // what they will later see, or the tile becomes a spoofing surface.
    const claimed = this._sanitizeAppMetadata(req.appMetadata);

    // Tie this prompt to the frame that asked. If that page is destroyed or
    // navigates away, the request it made no longer exists: `abandon` settles
    // the engine's await, clears the sheet in the renderer, and — through the
    // `abandoned` flag — stops a late answer from persisting a grant for a
    // session nobody will hold.
    const askerId = this._connectAskers.get(namespace);
    let abandoned = false;
    let abandon = () => {};
    const abandonedPromise = new Promise((resolve) => {
      abandon = () => {
        if (abandoned) return;
        abandoned = true;
        if (this._cancelConsent) this._cancelConsent(namespace);
        resolve({ approved: false, reason: 'the page that asked is gone' });
      };
    });
    this._consentPromptFrames.set(namespace, { webContentsId: askerId, abandon });
    this._watchConsentAsker(askerId);

    const prompt = (async () => {
      const decision = await this._promptConsent({
        origin: req.verification.domain,
        namespace,
        appMetadata: claimed.appMetadata,
        icon: claimed.icon,
        // So the sheet's site row can carry the same thumbnail the Data pane
        // and the launcher will show for it, including the no-icon fallback.
        monogram: monogramFor(namespace, claimed.appMetadata && claimed.appMetadata.name),
        requestedScopes: req.requestedScopes,
        previousGrant: remembered || null,
        // What a grant is made of, and nothing else. This used to carry two
        // hints for the sheet — `wholesale` (the ask is exactly the published
        // subtree, so it widens as the owner publishes more) and `known` (the
        // user already holds data for that owner) — which it stopped reading
        // when each owner became one row with one checkbox. `known` is the one
        // worth not sending: it is cross-site knowledge, and it had no reader.
        foreignReads: requestedForeign.map((e) => ({
          namespace: e.namespace,
          origin: e.origin,
          paths: e.paths,
        })),
      });
      // An answer that arrives after the asking page is gone grants nothing:
      // there is no session to attach it to, and a partition appearing for a
      // page that no longer exists is not what the user approved.
      if (abandoned) return { approved: false, reason: 'the page that asked is gone' };
      if (decision && decision.approved) {
        const grantedMethods = withAlwaysGranted(decision.grantedMethods || requestedMethods);
        perms.grantPermission(
          namespace,
          {
            origin: req.verification.domain,
            appMetadata: claimed.appMetadata,
            icon: claimed.icon,
            methods: grantedMethods,
            fields: decision.grantedFields || requestedFields,
            // No `|| requestedForeign` fallback: cross-origin access fails
            // closed, matching the engine. A sheet that returns nothing here
            // grants nothing, rather than everything that was asked.
            foreignReads: decision.grantedForeignReads || [],
            writePolicy: decision.writePolicy,
          },
          this._now(),
        );
        // The user is willing: forget whatever they rejected before.
        this._consentRefusals.delete(namespace);
        return { ...decision, grantedMethods, grantedForeignReads: decision.grantedForeignReads || [] };
      }
      this._noteConsentRejection(namespace);
      return decision || { approved: false, reason: 'no decision' };
    })();
    // Whichever comes first: the user's answer, or the page going away.
    const p = Promise.race([prompt, abandonedPromise]);
    this._pendingByNamespace.set(namespace, p);
    try {
      return await p;
    } finally {
      this._pendingByNamespace.delete(namespace);
      this._consentPromptFrames.delete(namespace);
    }
  }

  /**
   * @private Abandon this namespace's prompt if the frame that asked goes away.
   *
   * A reload keeps the WebContents and destroys the document, so `destroyed`
   * alone would miss it — a cross-document navigation is the other half. An
   * in-page navigation (a hash change) is not: the page that asked is still
   * there, still waiting.
   */
  _watchConsentAsker(webContentsId) {
    const wc = webContentsById(webContentsId);
    if (!wc || wc.isDestroyed()) return;
    const gone = () => this._abandonConsentFor(webContentsId);
    wc.once('destroyed', gone);
    const onNavigate = (_e, _url, _isInPlace, isMainFrame, ...rest) => {
      // Electron passes `isSameDocument` in the details for
      // `did-start-navigation`; older signatures put it positionally. Treat
      // anything that is not same-document in the main frame as gone.
      const sameDocument = rest.some((arg) => arg === true);
      if (isMainFrame && !sameDocument) gone();
    };
    wc.once('did-start-navigation', onNavigate);
  }

  /** @private Push a subscription / permissions_changed notification to the page. */
  _emit(sessionId, notification) {
    const rec = this._sessions.get(sessionId);
    if (!rec) return;
    const wc = webContentsById(rec.webContentsId);
    if (wc && !wc.isDestroyed()) {
      wc.send(CH.VAULT_PROVIDER_EVENT, { sessionId, notification });
    }
  }

  /** @private Kill every live session for a namespace (on user revoke). */
  _teardownNamespace(namespace) {
    for (const [sessionId, rec] of this._sessions) {
      if (rec.namespace === namespace) {
        this._engine.adminRevoke(sessionId);
        this._sessions.delete(sessionId);
        const wc = webContentsById(rec.webContentsId);
        if (wc && !wc.isDestroyed()) {
          wc.send(CH.VAULT_PROVIDER_EVENT, {
            sessionId,
            notification: { method: 'vault_permissionsChanged', params: { namespace } },
          });
        }
      }
    }
  }

  // --- export / import (integration decision #5) -------------------------------

  /**
   * Export every site's data as a portable bundle. The blobs are the SEALED
   * ciphertext exactly as stored, so export never decrypts; a restore on another
   * device only works with the SAME mnemonic (the DEK is derived from it).
   *
   * The permission map — the list of every site you hold data for, with grants and
   * pinned icons — is SEALED under the DEK too, in a bundle the user may well drop
   * in cloud storage. (Before v0.5.0 it rode along as cleartext JSON.) Sealing it
   * means export now requires an unlock, which is right: this is the same material
   * the "Data" pane makes you unlock to read.
   */
  async exportAll() {
    if (!this._keystore.isUnlocked()) {
      throw rpcError(4312, 'unlock the vault to export');
    }
    const keys = await this._storage.listKeys('');
    const entries = {};
    for (const key of keys) {
      const blob = await this._storage.get(key);
      if (blob) entries[key] = Buffer.from(blob).toString('base64');
    }
    const sealed = await this._keystore.sealNamespace(
      META_STORAGE_KEY,
      Buffer.from(META_AAD, 'utf-8'),
      Buffer.from(JSON.stringify(perms.loadPermissions()), 'utf-8'),
    );
    return {
      format: EXPORT_FORMAT,
      exportedAt: this._now(),
      permissionsSealed: Buffer.from(sealed).toString('base64'),
      entries,
    };
  }

  /**
   * Restore a bundle produced by exportAll. Sealed blobs are written verbatim, and
   * the sealed permission map is restored so returning sites reconnect silently —
   * without it the "Data" pane, which enumerates by grant, cannot see the restored
   * data at all. Legacy `/1` bundles (cleartext permissions) still import their
   * blobs; their permission map is ignored.
   */
  async importAll(bundle) {
    if (!bundle || (bundle.format !== EXPORT_FORMAT && bundle.format !== 'vault3r-data-export/1')) {
      throw new Error('[DataVaultManager] unrecognized export format');
    }
    for (const [key, b64] of Object.entries(bundle.entries || {})) {
      await this._storage.put(key, new Uint8Array(Buffer.from(b64, 'base64')));
    }
    let restoredGrants = 0;
    if (bundle.permissionsSealed) {
      if (!this._keystore.isUnlocked()) throw rpcError(4312, 'unlock the vault to import');
      const opened = await this._keystore.openNamespace(
        META_STORAGE_KEY,
        Buffer.from(META_AAD, 'utf-8'),
        new Uint8Array(Buffer.from(bundle.permissionsSealed, 'base64')),
      );
      // Fails closed on the wrong mnemonic (or a tampered bundle): the AEAD tag
      // won't verify, so we restore blobs but no grants rather than guessing.
      if (!opened) throw rpcError(4310, 'could not open the exported permissions (wrong vault?)');
      restoredGrants = perms.replaceAll(JSON.parse(Buffer.from(opened).toString('utf-8')));
    }
    return { imported: Object.keys(bundle.entries || {}).length, restoredGrants };
  }

  // --- owner-facing management API (the "Data" pane) ---------------------------
  //
  // These serve the vault OWNER through the trusted wallet UI. They read/delete
  // by namespace and are wired ONLY to the main-window preload — a website can
  // never reach them.

  /**
   * List every site that has a data partition, with its on-disk size.
   *
   * Returns NOTHING while locked. The data is technically available — origins,
   * grants and sizes need no key — but "which sites do you hold data for" is a
   * browsing-history-shaped fact, and showing it beside a locked vault both leaks
   * it to anyone at an unattended browser and reads as though the vault were
   * open. The pane renders an unlock prompt instead, matching the launcher.
   */
  async listPartitions() {
    if (!this._keystore.isUnlocked()) return [];
    const all = perms.getAllPermissions();
    const out = [];
    for (const p of all) {
      const storageKey = storageKeyForNamespace(p.namespace);
      const bytes = await this._storage.byteSize(`doc:${storageKey}`);
      const appName = (p.appMetadata && p.appMetadata.name) || null;
      out.push({
        namespace: p.namespace,
        origin: p.origin,
        appName,
        // The same pair the launcher's tiles use: the site-supplied icon that
        // was validated and pinned at consent, and the deterministic monogram
        // for a site that shipped none. Site art buys recognition, never
        // verification — the row's own label is the origin the browser saw.
        icon: p.icon ? p.icon.dataUri : null,
        monogram: monogramFor(p.namespace, appName),
        fields: p.fields || [],
        methods: p.methods || [],
        bytes,
        lastUsed: p.lastUsed || null,
        connectedAt: p.connectedAt || null,
      });
    }
    out.sort((a, b) => b.bytes - a.bytes);
    return out;
  }

  /**
   * The partition belonging to a browsed URL, or null when that site has no
   * grant. Backs the "Data" pane's per-tab banner, which answers the question a
   * user actually has when they open the pane: does the page in front of me hold
   * my data, and what may it do with it?
   *
   * The namespace is derived here rather than matched by host in the renderer,
   * because scheme is part of the derivation — `bzz://site` and `https://site`
   * are separate partitions.
   */
  async partitionForUrl(url) {
    if (!this._keystore.isUnlocked()) return null;
    const origin = originForNamespace(url);
    if (!origin) return null;

    let namespace;
    try {
      ({ namespace } = deriveOriginNamespace(origin));
    } catch {
      return null;
    }

    const p = perms.getPermission(namespace);
    if (!p) return null;

    const bytes = await this._storage.byteSize(`doc:${storageKeyForNamespace(namespace)}`);
    // Counts, not the lists: the banner summarises in one line and the detail
    // view holds the rest, so this stays a single IPC call per navigation.
    const foreign = this.foreignGrantsFor(namespace);
    return {
      namespace,
      origin: p.origin,
      appName: (p.appMetadata && p.appMetadata.name) || null,
      fields: p.fields || [],
      methods: p.methods || [],
      // Only the reads actually on: the banner describes current access.
      foreignReadCount: foreign.reads.filter((e) => e.enabled).length,
      readerCount: foreign.readers.filter((e) => e.enabled).length,
      bytes,
      lastUsed: p.lastUsed || null,
      connectedAt: p.connectedAt || null,
    };
  }

  // --- vault home page (the dApp launcher) -------------------------------------
  //
  // Same owner-plane trust level as the "Data" pane above, wired only to the
  // internal page's preload. The launcher is deliberately READ-ONLY + navigate:
  // delete/revoke/export stay in the Data pane so nothing destructive is one
  // click away on a surface people open constantly.

  /**
   * Whether the grid can be shown at all. Reports NO count while locked: "how
   * many sites do you hold data for" is itself a fact about the user, and the
   * unlock prompt is the whole locked-state UI.
   */
  async getHomeStatus() {
    const unlocked = this._keystore.isUnlocked();
    return unlocked ? { unlocked: true, count: perms.getAllPermissions().length } : { unlocked: false };
  }

  /**
   * The launcher grid: one tile per site holding data, most recently used first.
   *
   * Locked returns no tiles at all. This is a UI boundary, not a cryptographic
   * one — the permission store is encrypted under the OS keychain, which the OS
   * unlocks at login regardless of the vault's own lock state. The point is that
   * whoever walks up to an unattended, locked browser must not be shown a
   * browsing-history-shaped list.
   */
  async listHomeTiles() {
    if (!this._keystore.isUnlocked()) return { locked: true, tiles: [] };
    const tiles = perms.getAllPermissions().map((p) => {
      const name = (p.appMetadata && p.appMetadata.name) || null;
      return {
        namespace: p.namespace,
        name: name || hostOfOrigin(p.origin) || p.namespace,
        host: hostOfOrigin(p.origin),
        // Site-supplied, validated + pinned at consent. Null -> render a monogram.
        icon: p.icon ? p.icon.dataUri : null,
        monogram: monogramFor(p.namespace, name),
        lastUsed: p.lastUsed || null,
      };
    });
    return { locked: false, tiles };
  }

  /**
   * Launch a site from its tile. The page passes only a namespace — never a URL —
   * so the launcher can't be turned into "navigate anywhere": the destination is
   * whatever origin the browser itself observed when the grant was made.
   */
  async openSite(namespace) {
    const record = perms.getPermission(namespace);
    if (!record) return { opened: false, reason: 'unknown namespace' };
    const url = record.origin;
    if (!isLaunchable(url)) return { opened: false, reason: 'origin is not launchable' };
    if (typeof this._openUrl !== 'function') return { opened: false, reason: 'no openUrl host hook' };
    this._openUrl(url);
    return { opened: true, url };
  }

  /** Ask the host to unlock the identity vault (drives the locked-state button). */
  async requestUnlock(context) {
    const unlocked = await this._keystore.unlock(context);
    return { unlocked: !!unlocked };
  }

  /**
   * @private Site-facing unlock request (`vault_requestUnlock`).
   *
   * Raises the same unlock screen the home page raises, so a page whose
   * `vault_getData` just failed with 4312 can offer "Unlock" inline instead of
   * narrating where the browser keeps its controls — prose that is a guess
   * about the chrome and goes stale when the chrome moves.
   *
   * Resolves `{ unlocked }` always; `reason` says why when it is false, so a
   * site can tell "the user said no" from "stop asking".
   */
  async _requestUnlockForSite(namespace, origin) {
    if (this._keystore.isUnlocked()) {
      // Seeing it unlocked — by our prompt, the toolbar, or anything else —
      // ends every embargo: the next lock is a new situation, not a
      // continuation of the one the user dismissed.
      this._unlockPrompts.clear();
      return { unlocked: true };
    }

    const state = this._unlockPrompts.get(namespace) || { dismissals: 0, lastPromptAt: 0 };
    if (state.dismissals >= UNLOCK_MAX_DISMISSALS) {
      return { unlocked: false, reason: 'embargoed' };
    }
    const since = this._now() - state.lastPromptAt;
    if (state.lastPromptAt && since < UNLOCK_COOLDOWN_MS) {
      return { unlocked: false, reason: 'cooldown' };
    }

    // One prompt at a time, whoever asks: the vault is global, and two sites
    // racing must not stack two unlock screens on the user.
    if (!this._pendingUnlock) {
      // The label is the origin MAIN observed on the sender frame, never
      // anything the page said — the prompt must not be spoofable into naming
      // a site the user trusts more than the one actually asking.
      this._pendingUnlock = this.requestUnlock(hostOfOrigin(origin) || origin).finally(() => {
        this._pendingUnlock = null;
      });
    }
    state.lastPromptAt = this._now();
    this._unlockPrompts.set(namespace, state);

    const { unlocked } = await this._pendingUnlock;
    if (unlocked) {
      // A successful unlock clears everyone's dismissal count: the user has
      // shown they are willing, and the next lock is a fresh situation.
      this._unlockPrompts.clear();
      return { unlocked: true };
    }
    state.dismissals += 1;
    this._unlockPrompts.set(namespace, state);
    return { unlocked: false, reason: 'dismissed' };
  }

  /**
   * @private Clamp the page's claimed display metadata. Returns the sanitized
   * appMetadata plus the validated/re-encoded icon record (or null).
   */
  _sanitizeAppMetadata(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const name = sanitizeName(source.name);
    const result = normalizeIcon(source.icon, { nativeImage: this._nativeImage });
    if (!result.ok && result.reason !== 'absent') {
      console.warn('[DataVaultManager] rejected site icon:', result.reason);
    }
    return {
      appMetadata: { ...source, name: name || undefined, icon: undefined },
      icon: result.ok ? result.icon : null,
    };
  }

  /**
   * Total on-disk storage used by the whole vault, and how many sites. Reports
   * zeros while locked — the count alone is a fact about the user — but always
   * reports the lock state, which is what tells the pane to show its unlock
   * prompt instead of an empty vault.
   */
  async getUsage() {
    if (!this._keystore.isUnlocked()) return { totalBytes: 0, partitionCount: 0, unlocked: false };
    return {
      totalBytes: await this._storage.totalBytes(),
      partitionCount: perms.getAllPermissions().length,
      unlocked: true,
    };
  }

  /**
   * One grant, seen from both ends: the cross-origin reads this partition makes,
   * and the sites that read it.
   *
   * Empty while locked, for the same reason `listPartitions` is: who reads whom
   * is a relationship between sites the user visits, which is history-shaped and
   * must not be on screen for whoever walks up to the browser.
   */
  foreignGrantsFor(namespace) {
    if (!this._keystore.isUnlocked()) return { locked: true, reads: [], readers: [] };

    const own = perms.getPermission(namespace);
    const reads = (own?.foreignReads || []).map((e) => ({
      ownerNamespace: e.namespace,
      ownerOrigin: e.origin,
      paths: e.paths || [],
      // A read the user turned off keeps its entry — see setForeignReadEnabled.
      enabled: e.enabled !== false,
    }));

    const readers = [];
    for (const record of perms.getAllPermissions()) {
      if (record.namespace === namespace) continue;
      for (const e of record.foreignReads || []) {
        if (e.namespace !== namespace) continue;
        readers.push({
          readerNamespace: record.namespace,
          readerOrigin: record.origin,
          paths: e.paths || [],
          // The same flag the reader's own view toggles: one grant, one state,
          // whichever side of it the user is looking at.
          enabled: e.enabled !== false,
        });
      }
    }
    return { locked: false, reads, readers };
  }

  /**
   * Turn one held cross-origin read off or on, from the reader's own detail view.
   *
   * Removes nothing: the entry stays on the record with the paths the user
   * approved, so it can be turned back on. Live sessions end either way — a
   * session already holds its resolved reads, so neither the loss nor the return
   * of one reaches it until the page reconnects.
   */
  setForeignReadEnabled(readerNamespace, ownerNamespace, enabled) {
    if (!readerNamespace || !ownerNamespace) return { changed: false };
    const changed = perms.setForeignReadEnabled(readerNamespace, ownerNamespace, enabled);
    if (changed) this._teardownNamespace(readerNamespace);
    return { changed, readerNamespace, ownerNamespace, enabled: !!enabled };
  }

  /** Owner view of one site's stored data. Requires the vault to be unlocked. */
  async getPartitionData(namespace) {
    if (!this._keystore.isUnlocked()) return { namespace, locked: true };
    const storageKey = storageKeyForNamespace(namespace);
    const bytes = await this._storage.byteSize(`doc:${storageKey}`);
    let data;
    try {
      data = await this._engine.adminReadPartition(storageKey);
    } catch (err) {
      // A blob that will not open is a state the pane must describe, not an
      // exception to swallow into "Error: …". The engine names the cause when it
      // can (see DocumentStore's owner fingerprint): sealed by a different
      // identity, corrupt under this one, or unknown for stores written before
      // fingerprints existed. Anything else is a real failure and propagates.
      if (err && err.codeName === 'KeyInvalidated') {
        const reason = (err.data && err.data.reason) || 'unknown';
        return { namespace, locked: false, bytes, unreadable: { reason, message: err.message } };
      }
      throw err;
    }
    return { namespace, locked: false, data, bytes };
  }

  /** Delete one site's partition: data + manifest entry + grant + live sessions. */
  async deletePartition(namespace) {
    const storageKey = storageKeyForNamespace(namespace);
    const freedBytes = await this._storage.byteSize(`doc:${storageKey}`);
    await this._engine.adminDeletePartition(storageKey); // data + manifest + sessions
    this._teardownNamespace(namespace); // our session/tab bindings + notify pages
    perms.revokePermission(namespace); // forget the remembered grant
    // Readers that were approved to read this site's published subtree lose that
    // approval. Their own grants and data are untouched: a reader must not lose
    // access to its OWN partition because the user deleted somebody else's. The
    // reads were already answering empty — adminDeletePartition clears the
    // manifest entry, so the missing blob reads as "never existed" — this just
    // stops the Data pane showing a grant to nothing, and makes the reader ask
    // again rather than silently appear to still have it.
    const readers = perms.removeForeignReadsTo(namespace);
    for (const readerNamespace of readers) this._teardownNamespace(readerNamespace);
    return { deleted: true, namespace, freedBytes };
  }

  /** Delete EVERY site's partition. */
  async clearAll() {
    const all = perms.getAllPermissions();
    let freedBytes = 0;
    for (const p of all) {
      const r = await this.deletePartition(p.namespace);
      freedBytes += r.freedBytes;
    }
    return { cleared: all.length, freedBytes };
  }

  /**
   * Import a bundle from a user-chosen file.
   *
   * The mirror of `exportToFile`, and deliberately shaped the same way: main
   * owns the file, so the renderer neither reads the disk nor carries a
   * multi-megabyte bundle across IPC — it asks, and gets a count back.
   *
   * `importAll` fails closed on a bundle sealed to another mnemonic (the AEAD
   * tag will not verify), so a wrong file restores nothing rather than a
   * half-vault. A malformed JSON file is reported as such instead of reaching
   * the engine.
   */
  async importFromFile() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import vault data',
      properties: ['openFile'],
      filters: [{ name: 'Vault export', extensions: ['json'] }],
    });
    const filePath = filePaths && filePaths[0];
    if (canceled || !filePath) return { imported: false, canceled: true };
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    let bundle;
    try {
      bundle = JSON.parse(raw);
    } catch {
      throw new Error('That file is not a vault export (could not be read as JSON).');
    }
    const { imported, restoredGrants } = await this.importAll(bundle);
    // `partitions`, not `imported`: the shape mirrors exportToFile, and spreading
    // importAll's result would have let its COUNT overwrite the boolean flag the
    // caller branches on — zero entries would then read as "nothing happened".
    return { imported: true, path: filePath, partitions: imported, restoredGrants };
  }

  /** Export the whole vault to a user-chosen file (sealed blobs; never decrypted). */
  async exportToFile() {
    const bundle = await this.exportAll();
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export vault data',
      defaultPath: `vault-export-${this._now()}.json`,
      filters: [{ name: 'Vault export', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { saved: false, canceled: true };
    await fs.promises.writeFile(filePath, JSON.stringify(bundle, null, 2), { mode: 0o600 });
    return { saved: true, path: filePath, partitions: Object.keys(bundle.entries || {}).length };
  }
}

// --- helpers -----------------------------------------------------------------

/**
 * Map a display URL to an origin string deriveOriginNamespace accepts.
 *
 * Deliberately NOT `src/shared/origin-utils.js` getPermissionKey, though it is
 * the canonical source for permission scoping. The two agree on ordinary URLs
 * (both reduce to `scheme://host[:port]`) but differ on dweb name hosts, which
 * getPermissionKey folds to the bare name so a permission survives a transport
 * change. A partition must not: a name resolves through several paths, under
 * registries with different owners, so folding them would let a compromised
 * resolution path reach data written over an honest one. Keep them separate.
 * @param {string} url
 * @returns {string|null}
 */
function originForNamespace(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    const scheme = u.protocol.replace(/:$/, '').toLowerCase();
    if (scheme === 'http' || scheme === 'https') return `${scheme}://${u.host}`;
    // dweb scheme: origin is scheme + authority (path/query/fragment dropped).
    if (u.host) return `${scheme}://${u.host}`;
    return null;
  } catch {
    return null;
  }
}

/** Display host for a stored origin (`https://example.com` -> `example.com`). */
function hostOfOrigin(origin) {
  if (!origin || typeof origin !== 'string') return null;
  try {
    const u = new URL(origin);
    return u.host || origin.replace(/^[a-z0-9]+:\/\//i, '') || null;
  } catch {
    return origin;
  }
}

/** Only navigate to schemes the browser actually browses. */
function isLaunchable(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    return LAUNCHABLE_SCHEMES.has(new URL(url).protocol.replace(/:$/, '').toLowerCase());
  } catch {
    return false;
  }
}

function uniqMethods(scopes) {
  const s = new Set();
  for (const sc of scopes || []) for (const m of sc.methods || []) s.add(m);
  return [...s];
}
function flattenFields(scopes) {
  const out = [];
  for (const sc of scopes || []) for (const f of sc.fields || []) out.push(f);
  return out;
}
/**
 * The cross-origin reads on a record that are actually on. An entry with no
 * `enabled` key is on, which is every entry the consent sheet writes and every
 * one written before the Data pane could turn them off.
 */
function activeForeignReads(remembered) {
  return (remembered.foreignReads || []).filter((e) => e.enabled !== false);
}
/** Add the methods every grant carries to `methods`, without duplicating them. */
function withAlwaysGranted(methods) {
  return [...new Set([...(methods || []), ...ALWAYS_GRANTED_METHODS])];
}
/**
 * Does a remembered grant cover everything now requested, so the user is not
 * asked again? (methods + field paths + cross-origin reads)
 *
 * Own fields keep EXACT path equality — re-consent is cheap, and a prefix rule
 * here would silently widen what a remembered grant covers. Cross-origin reads
 * match per owner namespace with prefix coverage, so a remembered whole-subtree
 * grant covers a newly-named leaf without re-prompting, while a remembered leaf
 * never covers the whole subtree.
 *
 * `foreign` defaults to none requested, so the three-argument callers keep the
 * verdict they had before cross-origin reads existed.
 */
function covers(remembered, methods, fields, foreign) {
  const have = new Set(withAlwaysGranted(remembered.methods));
  if (!methods.every((m) => have.has(m))) return false;
  const havePaths = new Set((remembered.fields || []).map((f) => f.path));
  if (!fields.every((f) => havePaths.has(f.path))) return false;
  const byNamespace = new Map((remembered.foreignReads || []).map((e) => [e.namespace, e.paths || []]));
  return (foreign || []).every((want) => {
    const got = byNamespace.get(want.namespace);
    return !!got && (want.paths || []).every((p) => got.some((g) => pointerCovers(g, p)));
  });
}

function ok(result) {
  return { result };
}
function rpcError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
function toRpcError(err) {
  return { code: (err && err.code) || 4010, message: (err && err.message) || 'error' };
}

// Late-bound so the module loads without electron in unit tests.
function webContentsById(id) {
  try {
    return require('electron').webContents.fromId(id);
  } catch {
    return null;
  }
}

module.exports = { DataVaultManager, originForNamespace, covers };
