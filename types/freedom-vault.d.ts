/**
 * Type definitions for `window.vault`, the per-site encrypted data vault
 * Freedom injects into every page.
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

export interface FreedomVaultScope {
  /**
   * The methods the site intends to call. `vault_getPermissions` is granted
   * whether or not you ask for it.
   */
  methods: string[];
  fields: FreedomVaultField[];
}

export interface FreedomVaultConnectParams {
  requestedScopes: FreedomVaultScope[];
  appMetadata?: {
    /** Shown on the consent sheet and the freedom://dapps tile. ≤ 128 chars. */
    name?: string;
    /**
     * `data:` URI only — PNG, JPEG or WebP (SVG is rejected), declared MIME must
     * match the magic bytes, ≤ 64 KB decoded, 8–512 px. Anything else falls back
     * to a monogram derived from the namespace.
     */
    icon?: string;
  };
}

export interface FreedomVaultGrant {
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

  on(event: 'change' | 'permissionsRevoked', handler: (data: unknown) => void): this;
  removeListener(event: 'change' | 'permissionsRevoked', handler: (data: unknown) => void): this;
  removeAllListeners(event?: 'change' | 'permissionsRevoked'): this;
}

export {};
