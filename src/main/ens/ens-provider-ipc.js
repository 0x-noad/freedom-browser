/**
 * ENS Provider IPC — site-facing name resolution (`window.ens`)
 *
 * Freedom already resolves three name systems for the address bar — ENS
 * (`.eth`), WNS (`.wei`) and GNS (`.gwei`) — through a quorum-checked provider
 * pool with a pinned-block anchor, caching and failure quarantine
 * (`src/main/ens-resolver.js`). None of it reached a page, so a dapp wanting to
 * show `alice.eth` instead of `0x9a7c…0123` had to ship its own resolver against
 * a public mainnet RPC: an external request per address, from a privacy browser,
 * with none of the quorum checking the browser does internally.
 *
 * This is only the transport out to pages. Every lookup goes through the same
 * `resolveEnsReverse` / `resolveEnsAddress` entry points the browser's own UI
 * uses, so a feed of twenty cards costs at most twenty cache reads.
 *
 * No permission gate: these are reads of public chain state and grant nothing.
 * A per-sender budget keeps a page from turning the resolver into an open proxy
 * onto the RPC pool, mirroring the permission-free read budget the Swarm
 * provider applies to its own ungated methods.
 */

const { ipcMain } = require('electron');
const IPC = require('../../shared/ipc-channels');
const { resolveEnsReverse, resolveEnsAddress } = require('../ens-resolver');
const log = require('electron-log');

const ERRORS = {
  UNSUPPORTED_METHOD: { code: 4200, message: 'Method not supported' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid parameters' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
};

/** Batch cap for reverseMany. A feed page is the consumer; 50 covers one screen. */
const MAX_BATCH = 50;

const READ_BUDGET = {
  windowMs: 60_000,
  maxRequests: 600,
};

/** webContents id -> { startedAt, requests } */
const readBuckets = new Map();

function clearEnsProviderReadBudgets() {
  readBuckets.clear();
}

function invalidParams(message, reason = 'invalid_params') {
  return { error: { ...ERRORS.INVALID_PARAMS, message, data: { reason } } };
}

/**
 * Charge `requests` against the caller's budget.
 * @returns {object|null} an error envelope when the budget is spent
 */
function consumeReadBudget(senderId, requests) {
  const now = Date.now();
  const existing = readBuckets.get(senderId);
  const bucket =
    existing && now - existing.startedAt < READ_BUDGET.windowMs
      ? existing
      : { startedAt: now, requests: 0 };

  bucket.requests += requests;
  readBuckets.set(senderId, bucket);

  if (bucket.requests > READ_BUDGET.maxRequests) {
    return invalidParams('Name resolution read budget exceeded', 'rate_limited');
  }
  return null;
}

/**
 * Flatten a resolver result to the shape a page gets.
 *
 * `verified` is the honest summary of the resolver's trust metadata: true only
 * when the lookup met quorum (or was cryptographically proven). A name that
 * resolved but did not verify still comes back — with verified false — so a site
 * can render it differently rather than being told nothing resolved.
 */
function toReverseResult(result) {
  return {
    address: result.address || null,
    name: result.success ? result.name : null,
    system: result.system || null,
    verified: result.trust?.level === 'verified',
    reason: result.success ? null : result.reason || null,
  };
}

function toForwardResult(result) {
  return {
    name: result.name || null,
    address: result.success ? result.address : null,
    system: result.system || null,
    verified: result.trust?.level === 'verified',
    reason: result.success ? null : result.reason || null,
  };
}

async function handleReverse(params, senderId) {
  const address = params && params.address;
  if (typeof address !== 'string') {
    return invalidParams('address is required');
  }

  const budgetError = consumeReadBudget(senderId, 1);
  if (budgetError) return budgetError;

  return { result: toReverseResult(await resolveEnsReverse(address)) };
}

/**
 * Batch reverse lookups. Feeds are the main consumer, and one round trip
 * carrying twenty addresses beats twenty round trips carrying one.
 */
async function handleReverseMany(params, senderId) {
  const addresses = params && params.addresses;
  if (!Array.isArray(addresses)) {
    return invalidParams('addresses must be an array');
  }
  if (addresses.length > MAX_BATCH) {
    return invalidParams(`addresses exceeds the maximum of ${MAX_BATCH}`, 'too_many_addresses');
  }

  const budgetError = consumeReadBudget(senderId, addresses.length);
  if (budgetError) return budgetError;

  const results = await Promise.all(
    addresses.map(async (address) => {
      if (typeof address !== 'string') {
        return { address: null, name: null, system: null, verified: false, reason: 'INVALID_ADDRESS' };
      }
      return toReverseResult(await resolveEnsReverse(address));
    })
  );
  return { result: results };
}

async function handleResolve(params, senderId) {
  const name = params && params.name;
  if (typeof name !== 'string' || !name.trim()) {
    return invalidParams('name is required');
  }

  const budgetError = consumeReadBudget(senderId, 1);
  if (budgetError) return budgetError;

  return { result: toForwardResult(await resolveEnsAddress(name)) };
}

/**
 * Execute an ENS provider method.
 * @param {string} method
 * @param {*} params
 * @param {number} senderId - webContents id of the calling frame (budget key)
 * @returns {Promise<{ result?, error? }>}
 */
async function executeEnsMethod(method, params, senderId) {
  try {
    switch (method) {
      case 'ens_reverse':
        return await handleReverse(params, senderId);
      case 'ens_reverseMany':
        return await handleReverseMany(params, senderId);
      case 'ens_resolve':
        return await handleResolve(params, senderId);
      default:
        return {
          error: { ...ERRORS.UNSUPPORTED_METHOD, message: `Unknown method: ${method}` },
        };
    }
  } catch (err) {
    log.error('[EnsProvider] executeEnsMethod failed:', err.message);
    return { error: { ...ERRORS.INTERNAL_ERROR, message: err.message } };
  }
}

/**
 * Register the ens:provider-request IPC handler.
 */
function registerEnsProviderIpc() {
  ipcMain.handle(IPC.ENS_PROVIDER_REQUEST, async (event, args) => {
    const { method, params } = args || {};
    return executeEnsMethod(method, params, event.sender.id);
  });

  log.info('[EnsProvider] IPC handler registered');
}

module.exports = {
  registerEnsProviderIpc,
  executeEnsMethod,
  clearEnsProviderReadBudgets,
  MAX_BATCH,
};
