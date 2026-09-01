const ipcHandlers = {};
jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel, handler) => {
      ipcHandlers[channel] = handler;
    },
  },
}));

jest.mock('electron-log', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const mockResolveEnsReverse = jest.fn();
const mockResolveEnsAddress = jest.fn();
jest.mock('../ens-resolver', () => ({
  resolveEnsReverse: mockResolveEnsReverse,
  resolveEnsAddress: mockResolveEnsAddress,
}));

const {
  registerEnsProviderIpc,
  executeEnsMethod,
  clearEnsProviderReadBudgets,
  MAX_BATCH,
} = require('./ens-provider-ipc');

const ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

function verifiedReverse(address, name) {
  return { success: true, address, name, system: 'ens', trust: { level: 'verified' } };
}

describe('ens-provider-ipc', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearEnsProviderReadBudgets();
  });

  describe('registration', () => {
    test('registers the site-facing channel', () => {
      registerEnsProviderIpc();
      expect(typeof ipcHandlers['ens:provider-request']).toBe('function');
    });

    test('keys the read budget on the calling frame', async () => {
      registerEnsProviderIpc();
      mockResolveEnsReverse.mockResolvedValue(verifiedReverse(ADDRESS, 'alice.eth'));

      const result = await ipcHandlers['ens:provider-request'](
        { sender: { id: 7 } },
        { method: 'ens_reverse', params: { address: ADDRESS } }
      );

      expect(result.result.name).toBe('alice.eth');
    });
  });

  describe('ens_reverse', () => {
    test('returns the name, system and verification state', async () => {
      mockResolveEnsReverse.mockResolvedValue(verifiedReverse(ADDRESS, 'alice.eth'));

      const result = await executeEnsMethod('ens_reverse', { address: ADDRESS }, 1);

      expect(result.result).toEqual({
        address: ADDRESS,
        name: 'alice.eth',
        system: 'ens',
        verified: true,
        reason: null,
      });
    });

    test('surfaces a name that resolved but did not verify', async () => {
      mockResolveEnsReverse.mockResolvedValue({
        success: false,
        address: ADDRESS,
        system: 'ens',
        reason: 'UNVERIFIED',
      });

      const result = await executeEnsMethod('ens_reverse', { address: ADDRESS }, 1);

      expect(result.result).toMatchObject({ name: null, verified: false, reason: 'UNVERIFIED' });
    });

    test('rejects a missing address', async () => {
      const result = await executeEnsMethod('ens_reverse', {}, 1);
      expect(result.error.code).toBe(-32602);
      expect(mockResolveEnsReverse).not.toHaveBeenCalled();
    });
  });

  describe('ens_reverseMany', () => {
    test('resolves a batch in one round trip', async () => {
      mockResolveEnsReverse
        .mockResolvedValueOnce(verifiedReverse(ADDRESS, 'alice.eth'))
        .mockResolvedValueOnce(verifiedReverse(ADDRESS, 'bob.eth'));

      const result = await executeEnsMethod('ens_reverseMany', { addresses: [ADDRESS, ADDRESS] }, 1);

      expect(result.result.map((r) => r.name)).toEqual(['alice.eth', 'bob.eth']);
    });

    test('rejects a batch over the cap', async () => {
      const addresses = new Array(MAX_BATCH + 1).fill(ADDRESS);
      const result = await executeEnsMethod('ens_reverseMany', { addresses }, 1);
      expect(result.error.data.reason).toBe('too_many_addresses');
    });

    test('rejects a non-array', async () => {
      const result = await executeEnsMethod('ens_reverseMany', { addresses: ADDRESS }, 1);
      expect(result.error.code).toBe(-32602);
    });
  });

  describe('ens_resolve', () => {
    test('returns the address for a name', async () => {
      mockResolveEnsAddress.mockResolvedValue({
        success: true,
        name: 'alice.eth',
        address: ADDRESS,
        system: 'ens',
        trust: { level: 'verified' },
      });

      const result = await executeEnsMethod('ens_resolve', { name: 'alice.eth' }, 1);

      expect(result.result).toEqual({
        name: 'alice.eth',
        address: ADDRESS,
        system: 'ens',
        verified: true,
        reason: null,
      });
    });

    test('rejects an empty name', async () => {
      const result = await executeEnsMethod('ens_resolve', { name: '  ' }, 1);
      expect(result.error.code).toBe(-32602);
    });
  });

  describe('read budget', () => {
    test('rate-limits a page that hammers the resolver', async () => {
      mockResolveEnsReverse.mockResolvedValue(verifiedReverse(ADDRESS, 'alice.eth'));

      let last;
      for (let i = 0; i < 601; i++) {
        last = await executeEnsMethod('ens_reverse', { address: ADDRESS }, 1);
      }

      expect(last.error.data.reason).toBe('rate_limited');
    });

    test('budgets each frame separately', async () => {
      mockResolveEnsReverse.mockResolvedValue(verifiedReverse(ADDRESS, 'alice.eth'));

      for (let i = 0; i < 601; i++) {
        await executeEnsMethod('ens_reverse', { address: ADDRESS }, 1);
      }
      const other = await executeEnsMethod('ens_reverse', { address: ADDRESS }, 2);

      expect(other.result.name).toBe('alice.eth');
    });

    test('charges a batch by its length', async () => {
      mockResolveEnsReverse.mockResolvedValue(verifiedReverse(ADDRESS, 'alice.eth'));
      const addresses = new Array(MAX_BATCH).fill(ADDRESS);

      let last;
      for (let i = 0; i < 13; i++) {
        last = await executeEnsMethod('ens_reverseMany', { addresses }, 1);
      }

      expect(last.error.data.reason).toBe('rate_limited');
    });
  });

  test('rejects an unknown method', async () => {
    const result = await executeEnsMethod('ens_somethingElse', {}, 1);
    expect(result.error.code).toBe(4200);
  });

  test('turns a resolver throw into an internal error', async () => {
    mockResolveEnsReverse.mockRejectedValue(new Error('provider pool exhausted'));
    const result = await executeEnsMethod('ens_reverse', { address: ADDRESS }, 1);
    expect(result.error.code).toBe(-32603);
    expect(result.error.message).toBe('provider pool exhausted');
  });
});
