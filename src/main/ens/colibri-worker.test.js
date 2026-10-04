const mockMkdirSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockUnlinkSync = jest.fn();
jest.mock('node:fs', () => ({
  mkdirSync: (...args) => mockMkdirSync(...args),
  readFileSync: (...args) => mockReadFileSync(...args),
  writeFileSync: (...args) => mockWriteFileSync(...args),
  unlinkSync: (...args) => mockUnlinkSync(...args),
}));

const { createColibriService, serializeError } = require('./colibri-worker');

const STORAGE_DIR = '/tmp/freedom-test-userdata/colibri';
const CONFIG = { chainId: 1, proverUrl: 'https://test-prover.example', zkProof: true };

function fakeRuntime() {
  const instances = [];
  const VerifiedOnly = Symbol('VerifiedOnly');
  class FakeColibri {
    constructor(config) {
      this.config = config;
      this.destroy = jest.fn();
      this.request = jest.fn().mockResolvedValue('0x2a');
      instances.push(this);
    }
  }
  FakeColibri.register_storage = jest.fn(() => Promise.resolve());
  let resetListener = null;
  return {
    instances,
    runtime: {
      Colibri: FakeColibri,
      Strategy: { VerifiedOnly },
      setRuntimeResetListener: (listener) => { resetListener = listener; },
    },
    trap: (err) => resetListener(err),
    VerifiedOnly,
  };
}

function setup() {
  const fake = fakeRuntime();
  const posted = [];
  const service = createColibriService({
    runtime: fake.runtime,
    storageDir: STORAGE_DIR,
    post: (message) => posted.push(message),
  });
  return { ...fake, posted, service };
}

beforeEach(() => jest.clearAllMocks());

describe('colibri worker service', () => {
  test('builds each client with the pinned verifier config on first use', async () => {
    const { service, instances, posted, VerifiedOnly } = setup();
    await service.init();
    await service.handle({
      type: 'request', id: 7, clientId: 3, config: CONFIG,
      method: 'eth_getBalance', params: ['0xabc', 'latest'],
    });
    expect(instances).toHaveLength(1);
    expect(instances[0].config).toEqual({
      chainId: 1,
      prover: ['https://test-prover.example'],
      zk_proof: true,
      privacy_mode: 'basic',
      proofStrategy: VerifiedOnly,
      max_latest_age_seconds: 60,
    });
    expect(instances[0].request).toHaveBeenCalledWith({
      method: 'eth_getBalance', params: ['0xabc', 'latest'],
    });
    expect(posted).toEqual([{ type: 'result', id: 7, ok: true, result: '0x2a' }]);
  });

  test('reuses a client per id and destroys it on request', async () => {
    const { service, instances } = setup();
    const req = (id) => service.handle({
      type: 'request', id, clientId: 1, config: CONFIG, method: 'eth_blockNumber', params: [],
    });
    await req(1);
    await req(2);
    expect(instances).toHaveLength(1);
    await service.handle({ type: 'destroy', clientId: 1 });
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    await req(3);
    expect(instances).toHaveLength(2);
  });

  test('serializes a Colibri error with its code and revert data only', async () => {
    const { service, instances, posted } = setup();
    await service.handle({
      type: 'request', id: 1, clientId: 1, config: CONFIG, method: 'eth_call', params: [],
    });
    const err = Object.assign(new Error('execution reverted'), {
      name: 'ProviderRpcError', code: 3, data: '0xdeadbeef', secret: { nested: true },
    });
    instances[0].request.mockRejectedValueOnce(err);
    await service.handle({
      type: 'request', id: 2, clientId: 1, config: CONFIG, method: 'eth_call', params: [],
    });
    expect(posted[1]).toEqual({
      type: 'result', id: 2, ok: false,
      error: { name: 'ProviderRpcError', message: 'execution reverted', code: 3, data: '0xdeadbeef' },
    });
  });

  test('answers a liveness ping', async () => {
    const { service, posted } = setup();
    await service.handle({ type: 'ping', id: 11 });
    expect(posted).toEqual([{ type: 'pong', id: 11 }]);
  });

  test('reports a WASM trap so the host can replace the worker', async () => {
    const { service, posted, trap } = setup();
    await service.init();
    trap(new WebAssembly.RuntimeError('memory access out of bounds'));
    expect(posted).toEqual([{ type: 'trap', message: 'memory access out of bounds' }]);
  });

  test('serializeError tolerates non-Error values', () => {
    expect(serializeError('boom')).toEqual({ name: 'Error', message: 'boom' });
    expect(serializeError(undefined)).toEqual({ name: 'Error', message: 'unknown error' });
  });
});

describe('disk storage adapter', () => {
  async function captureStorage() {
    const { service, runtime } = setup();
    await service.init();
    expect(runtime.Colibri.register_storage).toHaveBeenCalledTimes(1);
    return runtime.Colibri.register_storage.mock.calls[0][0];
  }

  test('creates the storage directory the host passed in', async () => {
    await captureStorage();
    expect(mockMkdirSync).toHaveBeenCalledWith(STORAGE_DIR, { recursive: true });
  });

  test('get/set/del route through fs against the colibri subdirectory', async () => {
    const storage = await captureStorage();
    mockReadFileSync.mockReturnValue(Buffer.from([1, 2, 3]));
    expect(storage.get('states_1')).toEqual(Buffer.from([1, 2, 3]));
    expect(mockReadFileSync).toHaveBeenCalledWith(`${STORAGE_DIR}/states_1`);

    storage.set('sync_1_42', new Uint8Array([9, 9]));
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      `${STORAGE_DIR}/sync_1_42`,
      new Uint8Array([9, 9]),
    );

    storage.del('states_1');
    expect(mockUnlinkSync).toHaveBeenCalledWith(`${STORAGE_DIR}/states_1`);
  });

  test('get returns null when the underlying file is missing (warm-cache miss)', async () => {
    const storage = await captureStorage();
    mockReadFileSync.mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
    expect(storage.get('missing')).toBeNull();
  });

  test('del absorbs ENOENT but rethrows other errors (e.g. permission)', async () => {
    const storage = await captureStorage();
    mockUnlinkSync.mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
    expect(() => storage.del('already-gone')).not.toThrow();

    mockUnlinkSync.mockImplementation(() => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); });
    expect(() => storage.del('locked')).toThrow(/EACCES/);
  });
});
