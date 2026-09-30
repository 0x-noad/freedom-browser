/**
 * Stamp Service
 *
 * Lists the node's postage batches via bee-js. All bee-js types stay behind
 * this boundary — the renderer receives normalized Freedom batch model
 * objects. Buying, extending and resizing batches, and the chequebook
 * deposit, go through the node's xDAI storage routes instead
 * (publish-setup-service.js), which price and pay for them in one step.
 */

const { ipcMain } = require('electron');
const { getBee } = require('./swarm-service');
const log = require('electron-log');

/**
 * Normalize a bee-js PostageBatch to the Freedom batch model.
 * Uses public bee-js class methods (toBytes, toSeconds) rather than
 * private properties.
 */
function normalizeBatch(batch) {
  let sizeBytes = 0;
  if (batch.size && typeof batch.size.toBytes === 'function') {
    sizeBytes = batch.size.toBytes();
  } else if (typeof batch.size === 'number') {
    sizeBytes = batch.size;
  }

  let remainingBytes = 0;
  if (batch.remainingSize && typeof batch.remainingSize.toBytes === 'function') {
    remainingBytes = batch.remainingSize.toBytes();
  } else if (typeof batch.remainingSize === 'number') {
    remainingBytes = batch.remainingSize;
  }

  let ttlSeconds = 0;
  if (batch.duration && typeof batch.duration.toSeconds === 'function') {
    ttlSeconds = batch.duration.toSeconds();
  } else if (typeof batch.duration === 'number') {
    ttlSeconds = batch.duration;
  }

  const usageRaw = typeof batch.usage === 'number' ? batch.usage : 0;

  const rawId = batch.batchID;
  const batchId = rawId && typeof rawId.toHex === 'function' ? rawId.toHex() : String(rawId || '');

  let expiresApprox = null;
  if (ttlSeconds > 0 && batch.duration && typeof batch.duration.toEndDate === 'function') {
    try {
      expiresApprox = batch.duration.toEndDate().toISOString();
    } catch {
      // Duration.toEndDate may fail for edge cases
    }
  }

  return {
    batchId,
    depth: Number.isInteger(batch.depth) ? batch.depth : null,
    usable: batch.usable === true,
    isMutable: batch.immutableFlag === false,
    sizeBytes,
    remainingBytes,
    usagePercent: Math.round(usageRaw * 100),
    ttlSeconds,
    expiresApprox,
  };
}

/**
 * List all postage batches, normalized to the Freedom batch model.
 */
async function getStamps() {
  const bee = getBee();
  const batches = await bee.stamp.getAll();
  return batches.map(normalizeBatch);
}

/**
 * Register IPC handlers for stamp operations.
 */
function registerSwarmIpc() {
  ipcMain.handle('swarm:get-stamps', async () => {
    try {
      const stamps = await getStamps();
      return { success: true, stamps };
    } catch (err) {
      log.error('[StampService] Failed to get stamps:', err.message);
      return { success: false, error: err.message };
    }
  });

  log.info('[StampService] IPC handlers registered');
}

module.exports = {
  normalizeBatch,
  registerSwarmIpc,
};
