/**
 * Type definitions for `window.vault`, the per-site encrypted data vault
 * Freedom injects into every page.
 *
 * Per-site is the default and the boundary. The one way across it is deliberate
 * and narrow: a site may publish under the reserved `/public` subtree, and
 * another site may be granted READ-ONLY access to it — declared at `connect`
 * and approved by the user per reader/owner pair.
 *
 * Copy this file into your project (or add `freedom-browser/types` to your
 * `typeRoots`). See `docs/vault-for-site-authors.md` for what it does and when
 * it prompts.
 *
 * The provider is installed at document-start, before any page script runs, and
 * dispatches `vault#initialized` on install. It is absent in private windows.
 */

declare global {
  interface Window {
    vault?: FreedomVaultProvider;
  }

  interface WindowEventMap {
    'vault#initialized': Event;
  }
}

/** A JSON-RPC-shaped rejection. */
export interface FreedomVaultError extends Error {
  /** 4312 is a locked vault — branch on the code, never the message. */
  code?: number;
  data?: { reason?: string; [key: string]: unknown };
}

/** One field of a site's namespaced document. `read` defaults to true. */
export interface FreedomVaultField {
  path: string;
  read?: boolean;
  write?: boolean;
}

/**
 * A read of ANOTHER site's published data, declared at `connect`.
 *
 * `origin` is the owner's origin INCLUDING scheme (`bzz://social.eth`,
 * `https://social.example`): the same comparison every provider here makes, so
 * `https://site.example` and `bzz://site.example` are two different owners
 * holding two different partitions.
 *
 * Only pointers under the reserved `/public` subtree may be named, `/public`
 * itself included — naming it asks for the whole published area, including
 * whatever the owner adds later, and the consent sheet renders that as
 * open-ended rather than as a list of fields. Anything outside `/public` fails
 * the connect.
 *
 * Read-only: there is no cross-origin write and no cross-origin `subscribe`.
 */
export interface FreedomVaultForeignRead {
  origin: string;
  paths: string[];
}

export interface FreedomVaultScope {
  /**
   * The methods the site intends to call. `vault_getPermissions` is granted
   * whether or not you ask for it; `vault_getPublicData` is NOT — it is the
   * cross-origin surface, so it has to be asked for.
   */
  methods: string[];
  fields: FreedomVaultField[];
  /**
   * Cross-origin reads of other sites' published data. The consent sheet lists
   * one row per owner partition, named by the namespace the engine derived and
   * nothing else, and the user approves each owner separately — so read
   * `session.grant` back rather than assuming you got what you asked for.
   */
  foreign?: FreedomVaultForeignRead[];
}

export interface FreedomVaultConnectParams {
  requestedScopes: FreedomVaultScope[];
  appMetadata?: {
    /** Shown on the consent sheet and the freedom://dapps tile. ≤ 128 chars. */
    name?: string;
    /**
     * `data:` URI only — PNG, JPEG or WebP (SVG is rejected), declared MIME must
     * match the magic bytes, ≤ 16 KiB decoded, 8–512 px, re-encoded to a
     * 128×128 PNG. Anything else falls back
     * to a monogram derived from the namespace.
     */
    icon?: string;
  };
}

export interface FreedomVaultGrant {
  /**
   * The cross-origin reads the user approved. Empty when none; the consent sheet
   * approves per partition, so an owner is either granted as asked or dropped.
   */
  foreignReads?: Array<{ namespace: string; origin: string; paths: string[] }>;
  methods: string[];
  fields: FreedomVaultField[];
  writePolicy?: string;
}

export interface FreedomVaultSession {
  sessionId: string;
  grant: FreedomVaultGrant;
  /**
   * The partition your data lives in, derived from your ORIGIN — including
   * scheme. A site published at a raw content reference gets a new namespace on
   * every redeploy, stranding every returning user's data in an unreachable
   * partition. Publish under a stable name (ENS contenthash) instead.
   */
  namespace: string;
}

export interface FreedomVaultPatchOp {
  /** Anything other than 'remove' writes `value` at `path`. */
  op: 'replace' | 'remove';
  path: string;
  value?: unknown;
}

/** Why `requestUnlock` did not unlock. Absent when `unlocked` is true. */
export type FreedomVaultUnlockRefusal = 'dismissed' | 'cooldown' | 'embargoed';

export interface FreedomVaultUnlockResult {
  unlocked: boolean;
  reason?: FreedomVaultUnlockRefusal;
}

export interface FreedomVaultProvider {
  isVault3r: true;
  request<T = unknown>(args: { method: string; params?: object }): Promise<T>;

  /** Prompts on first connect; a remembered grant reconnects silently. */
  connect(params: FreedomVaultConnectParams): Promise<FreedomVaultSession>;
  /** At most 64 paths per call. `version` is an ETag — pass it as `baseVersion`. */
  get(
    sessionId: string,
    paths: string[]
  ): Promise<{ values: Record<string, unknown>; version: string }>;
  set(
    sessionId: string,
    values: Record<string, unknown>,
    baseVersion?: string
  ): Promise<{ applied: true; version: string }>;
  patch(
    sessionId: string,
    ops: FreedomVaultPatchOp[],
    baseVersion?: string
  ): Promise<{ applied: true; version: string }>;
  subscribe(sessionId: string, paths: string[]): Promise<{ subscriptionId: string }>;
  unsubscribe(sessionId: string, subscriptionId: string): Promise<{ ok: true }>;
  /**
   * Read another site's published data. `origin` must be one you declared at
   * `connect` and the user approved, and each path must be under that owner's
   * `/public`. At most 64 paths per call.
   *
   * Separate from `get` because there is no `version` to come back: you cannot
   * write here, so there is nothing to pass as `baseVersion`.
   *
   * A path the owner never wrote, an owner with no partition at all, a grant
   * the user removed, and a pointer outside `/public` are INDISTINGUISHABLE —
   * each resolves to `null` rather than rejecting. That is deliberate: an error
   * telling them apart would let you probe which sites the user has visited.
   */
  readPublic(
    sessionId: string,
    origin: string,
    paths: string[]
  ): Promise<{ values: Record<string, unknown> }>;
  getPermissions(sessionId: string): Promise<FreedomVaultGrant>;
  /**
   * Ask the user to unlock the vault, raising the browser's own unlock screen.
   * Resolves rather than rejecting when they decline, so a refusal is a branch.
   * Requires only a live session — it is not part of your grant. Rate-limited:
   * concurrent callers share one prompt, and repeated dismissals embargo the
   * origin until the user unlocks by other means.
   */
  requestUnlock(sessionId: string): Promise<FreedomVaultUnlockResult>;
  disconnect(sessionId: string): Promise<unknown>;

  on(event: 'change' | 'permissionsChanged', handler: (data: unknown) => void): this;
  removeListener(event: 'change' | 'permissionsChanged', handler: (data: unknown) => void): this;
  removeAllListeners(event?: 'change' | 'permissionsChanged'): this;
}

export {};
