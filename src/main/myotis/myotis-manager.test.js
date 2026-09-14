const path = require('path');
const IPC = require('../../shared/ipc-channels');
const { createIpcMainMock, loadMainModule } = require('../../../test/helpers/main-process-test-utils');

describe('myotis-manager', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

  function loadManager(mode = 'managed') {
    const clients = [];
    const status = { running: true, paused: false, beaconState: 'SYNCED', elReaderAvailable: true, elHunting: false, snapPeers: 2 };
    class MockProcess {
      constructor(options) {
        this.options = options;
        this.accepting = true;
        this.exited = false;
        this.startPromise = Promise.resolve(true);
        this.request = jest.fn(async (op) => {
          if (op === 'status') { options.onStatus(status); return status; }
          return { result: op };
        });
        this.stop = jest.fn(async () => {
          this.accepting = false;
          this.exited = true;
          options.onExit();
          return true;
        });
        clients.push(this);
      }
    }
    const ipcMain = createIpcMainMock();
    const frame = { url: require('url').pathToFileURL(path.resolve(__dirname, '../../renderer/index.html')).href };
    const sender = new (require('events').EventEmitter)();
    sender.mainFrame = frame;
    const event = { sender, senderFrame: frame };
    const win = { webContents: sender, isDestroyed: jest.fn(() => false) };
    const dialog = { showMessageBox: jest.fn(async () => ({ response: 0 })) };
    const BrowserWindow = { getAllWindows: () => [], fromWebContents: jest.fn(() => win) };
    const dataDir = path.join('/profile', 'myotis');
    const { mod } = loadMainModule(require.resolve('./myotis-manager'), {
      ipcMain, dialog, BrowserWindow,
      extraMocks: {
        fs: () => ({ existsSync: () => true }),
        [require.resolve('./myotis-process')]: () => ({ MyotisProcess: MockProcess }),
        [require.resolve('../logger')]: () => ({ info: jest.fn(), warn: jest.fn() }),
        [require.resolve('../profile-paths')]: () => ({ getMyotisDataDir: (network) => path.join(dataDir, network) }),
        [require.resolve('../profile-resolver')]: () => ({
          getActiveProfile: () => ({ metadata: { nodes: { myotis: { mode } } } }),
        }),
        [require.resolve('../service-registry')]: () => ({
          MODE: { BUNDLED: 'bundled', DISABLED: 'disabled', NONE: 'none' }, updateService: jest.fn(),
        }),
      },
    });
    return { mod, clients, dataDir, ipcMain, status, event, win, dialog };
  }

  test('keeps independent chain processes and profile directories', async () => {
    const { mod, clients, dataDir } = loadManager();
    await expect(mod.startMyotis()).resolves.toBe(true);
    await expect(mod.startMyotis({ chainId: 100 })).resolves.toBe(true);
    expect(clients.map((client) => client.options.dataDir)).toEqual([
      path.join(dataDir, 'mainnet'), path.join(dataDir, 'gnosis'),
    ]);
    expect(mod.publicStatus()).toMatchObject({ state: 'ready', version: '0.1.9', abi: 25 });
    await mod.stopMyotis(100);
    expect(mod.publicStatus(100).state).toBe('off');
    expect(mod.isReady(1)).toBe(true);
  });

  test('status queries use cached snapshots and stale status removes readiness', async () => {
    const { mod, clients } = loadManager();
    await mod.startMyotis();
    const calls = clients[0].request.mock.calls.length;
    for (let i = 0; i < 100; i++) { mod.publicStatus(); mod.getStatus(); mod.isReady(); }
    expect(clients[0].request).toHaveBeenCalledTimes(calls);
    jest.setSystemTime(Date.now() + 6001);
    expect(mod.getStatus()).toBeNull();
    expect(mod.isReady()).toBe(false);
  });

  test('slow status keeps readiness until soft staleness, then recovers without replacing the pending request', async () => {
    const { mod, clients, status } = loadManager();
    await mod.startMyotis();
    const client = clients[0];
    let complete;
    client.request.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const epoch = mod.getAvailabilityEpoch();
    await jest.advanceTimersByTimeAsync(3500); // poll starts at 1s; reply latency is 2.5s
    expect(mod.isReady()).toBe(true);
    expect(mod.getAvailabilityEpoch()).toBe(epoch);
    expect(client.request).toHaveBeenLastCalledWith('status', [], 10000);
    client.options.onStatus(status); complete(status);
    await jest.advanceTimersByTimeAsync(1);

    // The next poll occupies its one slot past freshness. Routing becomes
    // unavailable honestly, while native admission and the generation survive.
    await jest.advanceTimersByTimeAsync(6000);
    expect(mod.isReady()).toBe(false);
    const calls = client.request.mock.calls.length;
    await jest.advanceTimersByTimeAsync(1000);
    expect(client.request).toHaveBeenCalledTimes(calls);
    expect(client.accepting).toBe(true);
    expect(client.stop).not.toHaveBeenCalled();
    client.options.onStatus(status); complete(status);
    await Promise.resolve();
    expect(mod.isReady()).toBe(true);
    expect(clients).toHaveLength(1);
  });

  test.each([
    { running: false }, { paused: true }, { beaconState: 'STALE_ANCHOR' },
    { beaconState: 'CATCHING_UP' }, { elReaderAvailable: false }, { snapPeers: 0 }, { elHunting: true },
  ])('does not serve a started but unavailable native lifecycle: %s', async (change) => {
    const { mod, clients, status } = loadManager();
    await mod.startMyotis();
    clients[0].options.onStatus({ ...status, ...change, bootstrapped: true });
    expect(mod.isReady()).toBe(false);
    expect(clients[0].request.mock.calls.every(([op]) => op === 'status')).toBe(true);
  });

  test('does not create any process when disabled', async () => {
    const { mod, clients } = loadManager('disabled');
    await expect(mod.startMyotis()).resolves.toBe(false);
    expect(clients).toHaveLength(0);
    expect(mod.publicStatus().state).toBe('disabled');
  });

  test('does not restart before exit, or admit work after shutdown starts', async () => {
    const { mod, clients } = loadManager();
    await mod.startMyotis();
    clients[0].stop.mockImplementation(async () => { clients[0].accepting = false; return false; });
    await expect(mod.stopMyotis()).resolves.toBe(false);
    await expect(mod.startMyotis()).resolves.toBe(false);
    expect(mod.publicStatus()).toMatchObject({
      state: 'error', error: 'Myotis exit unconfirmed; restart blocked', running: false,
    });
    expect(clients).toHaveLength(1);
    const shutdown = mod.stopAllMyotis({ shutdown: true });
    await expect(mod.startMyotis({ chainId: 100 })).resolves.toBe(false);
    await expect(mod.ethCall({ to: '0xabc' })).rejects.toThrow('not running');
    await shutdown;
  });

  test('invalidates availability before requesting stop and applies recovery cooldown', async () => {
    const { mod, clients } = loadManager();
    const events = [];
    mod.onAvailabilityTransition((event) => events.push(event));
    await mod.startMyotis();
    clients[0].options.onUnavailable('timed out');
    clients[0].accepting = false;
    clients[0].exited = true;
    clients[0].options.onExit();
    expect(events.at(-1).ready).toBe(false);
    await expect(mod.startMyotis()).resolves.toBe(false);
    jest.setSystemTime(Date.now() + 15001);
    await expect(mod.startMyotis()).resolves.toBe(true);
    expect(clients).toHaveLength(2);
  });

  test('registers existing start, stop and cached status IPC', async () => {
    const { mod, ipcMain } = loadManager();
    mod.registerMyotisIpc();
    await expect(ipcMain.invoke(IPC.MYOTIS_START)).resolves.toMatchObject({ running: true });
    await expect(ipcMain.invoke(IPC.MYOTIS_STOP)).resolves.toMatchObject({ state: 'off' });
    await expect(ipcMain.invoke(IPC.MYOTIS_GET_STATUS)).resolves.toMatchObject({ state: 'off' });
  });

  test('sends only operation arguments, including already-signed broadcasts', async () => {
    const { mod, clients } = loadManager();
    await mod.startMyotis({ chainId: 100 });
    await mod.getAccount('0xabc', 100);
    await mod.ethCall({ to: '0xdef', chainId: 100 });
    await mod.estimateGas({ to: '0xdef', chainId: 100 });
    await mod.feeEstimate(100);
    await mod.sendRawTransaction('0xsigned', 100);
    await mod.resolveEnsRecord({ method: 'text', name: 'alice.eth', key: 'url' }, 100);
    expect(clients[0].request.mock.calls).toEqual(expect.arrayContaining([
      ['account', ['0xabc']], ['call', ['', '0xdef', '0x', '0', 'latest']],
      ['gas', ['', '0xdef', '0x', '0']], ['fee'], ['broadcast', ['0xsigned']],
      ['ens', [JSON.stringify({ method: 'text', name: 'alice.eth', key: 'url' })]],
    ]));
  });
  async function parked() {
    const ctx = loadManager();
    ctx.status.beaconState = 'STALE_ANCHOR';
    await ctx.mod.startMyotis({ chainId: 100 });
    ctx.mod.registerMyotisIpc();
    ctx.review = (event = ctx.event) => ctx.ipcMain.handlers.get(IPC.MYOTIS_REVIEW_STALE_ANCHOR)(event, 100);
    return ctx;
  }

  test('stale-anchor recovery requires native consent and defaults to keeping blocked', async () => {
    const ctx = await parked();
    await ctx.review();
    expect(ctx.dialog.showMessageBox).toHaveBeenCalledWith(ctx.win, expect.objectContaining({
      defaultId: 0, cancelId: 0, buttons: ['Keep blocked', 'Accept risk and sync'],
    }));
    expect(ctx.clients[0].request).not.toHaveBeenCalledWith('accept-stale-anchor');
    ctx.dialog.showMessageBox.mockResolvedValue({ response: 1 });
    ctx.clients[0].request.mockResolvedValue({ accepted: true });
    await ctx.review();
    expect(ctx.clients[0].request).toHaveBeenCalledWith('accept-stale-anchor');
    expect(ctx.mod.isReady(100)).toBe(false);
    expect(ctx.mod.getStatus(100)).toBeNull();
  });

  test('untrusted pages and subframes cannot open the recovery dialog', async () => {
    const ctx = await parked();
    await expect(ctx.review({ ...ctx.event, senderFrame: { ...ctx.event.senderFrame } })).rejects.toThrow('Nodes menu');
    ctx.event.senderFrame.url = 'https://example.com/src/renderer/index.html';
    await expect(ctx.review()).rejects.toThrow('Nodes menu');
    expect(ctx.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  test.each(['replacement', 'stop', 'navigation', 'reload', 'already-synced', 'stale-status'])(
    'does not apply delayed consent after %s', async (change) => {
      const ctx = await parked();
      let answer;
      ctx.dialog.showMessageBox.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
      const pending = ctx.review();
      await ctx.review();
      expect(ctx.dialog.showMessageBox).toHaveBeenCalledTimes(1);
      const client = ctx.clients[0];
      if (change === 'replacement' || change === 'stop') await ctx.mod.stopMyotis(100);
      if (change === 'replacement') await ctx.mod.startMyotis({ chainId: 100 });
      if (change === 'navigation') ctx.event.senderFrame.url = 'https://example.com';
      if (change === 'reload') ctx.event.sender.emit('did-start-navigation');
      if (change === 'already-synced') client.options.onStatus({ ...ctx.status, beaconState: 'SYNCED' });
      if (change === 'stale-status') jest.setSystemTime(Date.now() + 6001);
      answer({ response: 1 });
      await pending;
      for (const c of ctx.clients) expect(c.request).not.toHaveBeenCalledWith('accept-stale-anchor');
      expect(ctx.event.sender.listenerCount('did-start-navigation')).toBe(0);
      expect(ctx.event.sender.listenerCount('destroyed')).toBe(0);
    }
  );

});
