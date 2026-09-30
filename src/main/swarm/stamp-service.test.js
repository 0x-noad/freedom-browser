// Capture IPC handlers registered by the stamp service
const ipcHandlers = {};
jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel, handler) => {
      ipcHandlers[channel] = handler;
    },
    removeHandler: () => {},
  },
}));

// Mock bee-js
const mockGetPostageBatches = jest.fn();

jest.mock('@ethersphere/bee-js', () => ({
  Bee: jest.fn().mockImplementation(() => ({
    stamp: {
      getAll: mockGetPostageBatches,
    },
  })),
}));

jest.mock('../service-registry', () => ({
  getAntApiUrl: jest.fn().mockReturnValue('http://127.0.0.1:1633'),
}));

jest.mock('electron-log', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const { normalizeBatch, registerSwarmIpc } = require('./stamp-service');

// Register handlers once
registerSwarmIpc();

async function invokeIpc(channel, ...args) {
  const handler = ipcHandlers[channel];
  if (!handler) throw new Error(`No handler for ${channel}`);
  return handler({}, ...args);
}

// Helper to create batch objects that mimic bee-js class instances
function makeBatchId(hex) {
  return { toHex: () => hex, toString: () => hex };
}

function makeBatch(overrides = {}) {
  return {
    batchID: makeBatchId('abc123'),
    depth: 22,
    usable: true,
    immutableFlag: true,
    size: { toBytes: () => 5368709120 },
    remainingSize: { toBytes: () => 4000000000 },
    usage: 0.255,
    duration: { toSeconds: () => 2592000, toEndDate: () => new Date('2026-04-14T00:00:00Z') },
    ...overrides,
  };
}

describe('stamp-service', () => {
  describe('normalizeBatch', () => {
    test('normalizes a bee-js batch using public class methods', () => {
      const batch = makeBatch({ immutableFlag: false });

      expect(normalizeBatch(batch)).toEqual({
        batchId: 'abc123',
        depth: 22,
        usable: true,
        pending: false,
        isMutable: true,
        sizeBytes: 5368709120,
        remainingBytes: 4000000000,
        usagePercent: 26,
        ttlSeconds: 2592000,
        expiresApprox: '2026-04-14T00:00:00.000Z',
      });
    });

    test('treats immutableFlag: true as not mutable', () => {
      const batch = makeBatch({ immutableFlag: true });
      expect(normalizeBatch(batch).isMutable).toBe(false);
    });

    test('falls back to plain numbers when class methods are absent', () => {
      const batch = {
        batchID: 'def456',
        usable: false,
        immutableFlag: true,
        size: 1000,
        remainingSize: 500,
        usage: 0.5,
        duration: 86400,
      };

      expect(normalizeBatch(batch)).toEqual({
        batchId: 'def456',
        depth: null,
        usable: false,
        pending: true,
        isMutable: false,
        sizeBytes: 1000,
        remainingBytes: 500,
        usagePercent: 50,
        ttlSeconds: 86400,
        expiresApprox: null,
      });
    });

    // Bee's "exists, awaiting confirmations": what Ant reports for a batch
    // storer peers have not synced yet. Expired or missing batches are gone.
    test('tells a batch still being confirmed from one that is gone', () => {
      const confirming = normalizeBatch(makeBatch({ usable: false }));
      expect(confirming).toMatchObject({ usable: false, pending: true });
      const expired = normalizeBatch(
        makeBatch({ usable: false, duration: { toSeconds: () => 0 } })
      );
      expect(expired.pending).toBe(false);
      const missing = normalizeBatch(makeBatch({ usable: false, exists: false }));
      expect(missing.pending).toBe(false);
    });

    test('handles empty/undefined fields gracefully', () => {
      const result = normalizeBatch({});
      expect(result.batchId).toBe('');
      expect(result.depth).toBeNull();
      expect(result.usable).toBe(false);
      expect(result.isMutable).toBe(false);
      expect(result.sizeBytes).toBe(0);
      expect(result.remainingBytes).toBe(0);
      expect(result.usagePercent).toBe(0);
      expect(result.ttlSeconds).toBe(0);
      expect(result.expiresApprox).toBeNull();
    });
  });

  describe('IPC handlers', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('swarm:get-stamps returns normalized batches', async () => {
      mockGetPostageBatches.mockResolvedValue([makeBatch()]);

      const result = await invokeIpc('swarm:get-stamps');
      expect(result.success).toBe(true);
      expect(result.stamps).toHaveLength(1);
      expect(result.stamps[0]).toEqual({
        batchId: 'abc123',
        depth: 22,
        usable: true,
        pending: false,
        isMutable: false,
        sizeBytes: 5368709120,
        remainingBytes: 4000000000,
        usagePercent: 26,
        ttlSeconds: 2592000,
        expiresApprox: '2026-04-14T00:00:00.000Z',
      });
    });

    test('swarm:get-stamps handles errors', async () => {
      mockGetPostageBatches.mockRejectedValue(new Error('Bee not reachable'));

      const result = await invokeIpc('swarm:get-stamps');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Bee not reachable');
    });

    // Buying, extending and the chequebook deposit moved to the node's xDAI
    // storage routes (publish-setup-service.js); the bee-js paths are gone.
    test.each([
      'swarm:get-storage-cost',
      'swarm:buy-storage',
      'swarm:get-duration-extension-cost',
      'swarm:get-size-extension-cost',
      'swarm:extend-storage-duration',
      'swarm:extend-storage-size',
      'swarm:get-chequebook-balance',
      'swarm:deposit-chequebook',
    ])('registers no %s handler', (channel) => {
      expect(ipcHandlers[channel]).toBeUndefined();
    });
  });
});
