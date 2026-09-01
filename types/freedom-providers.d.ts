/**
 * Type definitions for the providers Freedom Browser injects into every page:
 * `window.ethereum`, `window.swarm`, `window.vault` and `window.ens`.
 *
 * Copy this file into your project (or add `freedom-browser/types` to your
 * `typeRoots`) and the shapes below become checkable at the call site. See
 * `docs/site-authors.md` for what each provider does and when it prompts.
 *
 * Every provider is installed at document-start, before any page script runs.
 * `window.addEventListener('freedom#initialized', …)` fires once all four exist;
 * a page that boots on `DOMContentLoaded` or later can read them directly.
 */

declare global {
  interface Window {
    ethereum?: FreedomEthereumProvider;
    swarm?: FreedomSwarmProvider;
    vault?: FreedomVaultProvider;
    ens?: FreedomEnsProvider;
  }

  interface WindowEventMap {
    'freedom#initialized': Event;
    'ethereum#initialized': Event;
    'swarm#initialized': Event;
    'vault#initialized': Event;
    'ens#initialized': Event;
  }
}

/** A JSON-RPC-shaped rejection. Every provider rejects with this. */
export interface FreedomProviderError extends Error {
  /** EIP-1193 style: 4001 user rejected, 4100 unauthorized, 4200 unsupported method. */
  code?: number;
  data?: { reason?: string; [key: string]: unknown };
}

// ---------------------------------------------------------------------------
// window.ethereum — EIP-1193, also announced via EIP-6963
// ---------------------------------------------------------------------------

export type FreedomEthereumEvent =
  'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged' | 'message';

export interface FreedomEthereumProvider {
  isFreedomBrowser: true;
  /** Kept for older dapps that sniff for it; modern ones discover via EIP-6963. */
  isMetaMask: boolean;
  readonly chainId: string | null;
  readonly selectedAddress: string | null;
  readonly networkVersion: string | null;
  isConnected(): boolean;
  request<T = unknown>(args: { method: string; params?: unknown[] | object }): Promise<T>;
  on(event: FreedomEthereumEvent, handler: (data: unknown) => void): this;
  addListener(event: FreedomEthereumEvent, handler: (data: unknown) => void): this;
  removeListener(event: FreedomEthereumEvent, handler: (data: unknown) => void): this;
  removeAllListeners(event?: FreedomEthereumEvent): this;
  /** Legacy alias for `request({ method: 'eth_requestAccounts' })`. */
  enable(): Promise<string[]>;
  send(method: string, params?: unknown[]): Promise<unknown>;
  sendAsync(
    payload: { id?: number; method: string; params?: unknown[] },
    callback: (error: Error | null, response: unknown) => void
  ): void;
}

// ---------------------------------------------------------------------------
// window.swarm — publishing and reading Swarm content
// ---------------------------------------------------------------------------

/**
 * Why the node cannot publish. `canPublish` plus this code is THE readiness
 * check: `getCapabilities` and every read method resolve whether or not a node
 * is running, and a resolved `requestAccess` does not imply a usable node.
 */
export type FreedomSwarmReason =
  /** The origin has no publish grant. Call `requestAccess()`; it prompts. */
  | 'not-connected'
  /** No node is running. */
  | 'node-stopped'
  /** The node is starting up. */
  | 'node-not-ready'
  /** The node cannot see the chain. The wallet's publish setup flow fixes this. */
  | 'ultra-light-mode'
  /** The node holds no usable postage batch. Buy storage in the publish setup. */
  | 'no-usable-stamps';

export interface FreedomSwarmCapabilities {
  specVersion: string;
  canPublish: boolean;
  reason: FreedomSwarmReason | null;
  /** Prose naming the action that clears `reason`; null when `canPublish`. */
  reasonMessage: string | null;
  /** True when the browser has a user-facing flow that fixes `reason`. */
  setupAvailable: boolean;
  publisherIdentityModes: Array<'app-scoped' | 'bee-wallet' | 'ethereum-wallet'>;
  extensions: Record<string, boolean>;
  limits: {
    /** 10 MB */
    maxDataBytes: number;
    /** 50 MB, across all files in one publishFiles call */
    maxFilesBytes: number;
    /** 100 */
    maxFileCount: number;
    /** 100 UTF-8 bytes per virtual path */
    maxPathBytes: number;
    /** 4096 */
    maxChunkPayloadBytes: number;
  };
}

/**
 * The SITE-facing publish result. Note this differs from Freedom's own
 * owner-plane `swarm:publish-data`, which wraps the same fields in
 * `{ success: true, … }`. There is no `success` field here — failures reject.
 */
export interface FreedomSwarmPublishResult {
  /** 64-character hex, no 0x prefix. */
  reference: string;
  bzzUrl: string;
  /** The postage batch that paid for this upload; look it up with `getBatch`. */
  batchId: string | null;
  bytesSize: number | null;
  /** publishFiles only — pass to `getUploadStatus`. */
  tagUid?: number | null;
}

export interface FreedomSwarmUploadStatus {
  tagUid: number;
  split: number;
  seen: number;
  stored: number;
  sent: number;
  synced: number;
  /** 0–100 */
  progress: number;
  done: boolean;
}

export interface FreedomSwarmBatch {
  batchId: string;
  depth: number | null;
  bucketDepth: number | null;
  /** Seconds of storage remaining. */
  batchTTL: number | null;
  /** Null for a batch this node does not own. */
  utilization: number | null;
  usable: boolean | null;
  immutable: boolean;
  owned: boolean;
}

export interface FreedomSwarmFile {
  /** Relative virtual path, no leading slash, ≤ 100 UTF-8 bytes. */
  path: string;
  bytes: Uint8Array | ArrayBuffer;
  contentType?: string;
}

export interface FreedomSwarmProvider {
  isFreedomBrowser: true;
  request<T = unknown>(args: { method: string; params?: object }): Promise<T>;

  /**
   * Ask for publish access. This is USER-FACING: it raises the browser's
   * connect sheet and resolves on approval. Publishing requires it; reads do
   * not. Grants are keyed per origin including port, so moving a dev server
   * from :8765 to :8766 drops the grant.
   */
  requestAccess(): Promise<{ connected: true; origin: string; capabilities: string[] }>;
  getCapabilities(): Promise<FreedomSwarmCapabilities>;

  publishData(params: {
    data: string | Uint8Array | ArrayBuffer;
    contentType: string;
    name?: string;
  }): Promise<FreedomSwarmPublishResult>;
  publishFiles(params: {
    files: FreedomSwarmFile[];
    indexDocument?: string;
  }): Promise<FreedomSwarmPublishResult>;
  getUploadStatus(params: { tagUid: number }): Promise<FreedomSwarmUploadStatus>;

  /** Is the network still serving this reference? Public read, no grant needed. */
  isRetrievable(params: { reference: string }): Promise<{
    reference: string;
    isRetrievable: boolean;
  }>;
  /** On-chain terms of a postage batch. Public read, no grant needed. */
  getBatch(params: { batchId: string }): Promise<FreedomSwarmBatch | null>;

  createFeed(params: { name: string; [key: string]: unknown }): Promise<unknown>;
  updateFeed(params: { feedId: string; reference: string }): Promise<unknown>;
  writeFeedEntry(params: {
    name: string;
    data: string | Uint8Array | ArrayBuffer;
    index?: number;
  }): Promise<unknown>;
  readFeedEntry(params: {
    name?: string;
    topic?: string;
    owner?: string;
    index?: number;
  }): Promise<{ data: string; encoding: 'base64'; index: number; nextIndex: number }>;
  listFeeds(): Promise<unknown[]>;

  publishChunk(params: { data: string; span?: string }): Promise<unknown>;
  readChunk(params: { reference: string }): Promise<unknown>;
  writeSingleOwnerChunk(params: { identifier: string; data: string }): Promise<unknown>;
  readSingleOwnerChunk(params: { identifier: string; owner: string }): Promise<unknown>;
  getSigningIdentity(): Promise<unknown>;

  on(event: 'connect' | 'disconnect', handler: (data: unknown) => void): this;
  addListener(event: 'connect' | 'disconnect', handler: (data: unknown) => void): this;
  removeListener(event: 'connect' | 'disconnect', handler: (data: unknown) => void): this;
  removeAllListeners(event?: 'connect' | 'disconnect'): this;
}

// ---------------------------------------------------------------------------
// window.vault — the per-site encrypted data vault
// ---------------------------------------------------------------------------

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
  disconnect(sessionId: string): Promise<unknown>;

  on(event: 'change' | 'permissionsRevoked', handler: (data: unknown) => void): this;
  removeListener(event: 'change' | 'permissionsRevoked', handler: (data: unknown) => void): this;
  removeAllListeners(event?: 'change' | 'permissionsRevoked'): this;
}

// ---------------------------------------------------------------------------
// window.ens — ENS / WNS / GNS name resolution
// ---------------------------------------------------------------------------

export interface FreedomNameResult {
  address: string | null;
  name: string | null;
  /** 'ens' (.eth), 'wns' (.wei) or 'gns' (.gwei). */
  system: string | null;
  /** True only when the lookup met the browser's resolver quorum. */
  verified: boolean;
  /** Why the lookup produced no name/address, e.g. 'NO_REVERSE', 'UNVERIFIED'. */
  reason: string | null;
}

export interface FreedomEnsProvider {
  isFreedomBrowser: true;
  request<T = unknown>(args: { method: string; params?: object }): Promise<T>;
  /** Address to primary name. Public chain read — no prompt, no grant. */
  reverse(address: string): Promise<FreedomNameResult>;
  /** Batched reverse lookups for feeds. At most 50 per call. */
  reverseMany(addresses: string[]): Promise<FreedomNameResult[]>;
  /** Name to address. */
  resolve(name: string): Promise<FreedomNameResult>;
}

export {};
