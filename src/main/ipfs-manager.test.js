const path = require('path');
const IPC = require('../shared/ipc-channels');
const {
  createAppMock,
  createIpcMainMock,
  loadMainModule,
} = require('../../test/helpers/main-process-test-utils');

const PROFILE_IPFS_DATA_DIR = '/tmp/freedom-user-data/ipfs-data';
const NATIVE_IPFS_DATA_DIR = path.join(PROFILE_IPFS_DATA_DIR, 'freedom-ipfs');
const loadedContexts = [];

const GATEWAY_PROBE_PATH = '/ipfs/bafkqaaa';

// What a real gateway answers the probe CID with: an empty 200 carrying the
// `X-Ipfs-Path` header every IPFS gateway sets. A plain 200 with a body is
// explicitly NOT a gateway (see the dev-server test below), so every external
// mode test has to answer the probe like a gateway before it can proxy.
function gatewayProbeResponse() {
  return new Response(null, { status: 200, headers: { 'x-ipfs-path': GATEWAY_PROBE_PATH } });
}

function mockGatewayFetch(handler) {
  return jest.fn(async (url, init) => {
    if (String(url).endsWith(GATEWAY_PROBE_PATH)) return gatewayProbeResponse();
    if (handler) return handler(url, init);
    return new Response('external-body', { status: 200 });
  });
}

function createWindowMock() {
  return {
    webContents: {
      send: jest.fn(),
    },
  };
}

function loadIpfsManagerModule(options = {}) {
  const ipcMain = options.ipcMain || createIpcMainMock();
  const app =
    options.app ||
    createAppMock({
      isPackaged: options.isPackaged ?? false,
      userDataDir: options.userDataDir || '/tmp/freedom-user-data',
    });
  const windows = options.windows || [];
  const BrowserWindow = {
    getAllWindows: jest.fn(() => windows),
  };
  const log = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const updateService = jest.fn();
  const setStatusMessage = jest.fn();
  const setErrorState = jest.fn();
  const clearErrorState = jest.fn();
  const clearService = jest.fn();
  const fsMock = {
    mkdirSync: jest.fn(),
  };

  const nativeInstances = [];
  class MockFreedomIpfsNativeNode {
    constructor(config) {
      this.config = config;
      this.start = jest.fn(() => options.startOk !== false);
      this.stop = jest.fn(async () => {});
      this.request = jest.fn(async () => new Response('native-body', { status: 200 }));
      this.isHealthy = jest.fn(() => options.isHealthy !== false);
      this.version = options.nativeVersion || '0.4.1';
      this.buildInfoJson = jest.fn(
        () =>
          options.nativeBuildInfoJson ||
          JSON.stringify({
            name: 'freedom-ipfs',
            version: this.version,
            release_tag: `v${this.version}`,
          })
      );
      this.progressSnapshotJson = jest.fn(() => '{"active":[],"events":[]}');
      this.nativeGatewayStatsJson = jest.fn(() => {
        if (options.statsThrows) throw new Error('stats unavailable');
        return '{"active_native_handles":0}';
      });
      nativeInstances.push(this);
    }

    static isAvailable() {
      return options.nativeAvailable !== false;
    }
  }

  const { mod } = loadMainModule(require.resolve('./ipfs-manager'), {
    app,
    ipcMain,
    BrowserWindow,
    extraMocks: {
      fs: () => fsMock,
      [require.resolve('./logger')]: () => log,
      [require.resolve('./service-registry')]: () => ({
        MODE: {
          BUNDLED: 'bundled',
          EXTERNAL: 'external',
          DISABLED: 'disabled',
          NONE: 'none',
        },
        updateService,
        setStatusMessage,
        setErrorState,
        clearErrorState,
        clearService,
      }),
      [require.resolve('./ipfs/freedom-ipfs-native-node')]: () => ({
        FreedomIpfsNativeNode: MockFreedomIpfsNativeNode,
      }),
      [require.resolve('./profile-paths')]: () => ({
        getIpfsDataDir: jest.fn(() => options.ipfsDataDir || PROFILE_IPFS_DATA_DIR),
      }),
      [require.resolve('./profile-resolver')]: () => ({
        getActiveProfile: jest.fn(() => options.activeProfile || null),
      }),
    },
  });

  const context = {
    app,
    BrowserWindow,
    clearService,
    fsMock,
    ipcMain,
    log,
    mod,
    nativeInstances,
    setStatusMessage,
    setErrorState,
    clearErrorState,
    updateService,
    windows,
  };
  loadedContexts.push(context);
  return context;
}

describe('ipfs-manager', () => {
  afterEach(async () => {
    for (const ctx of loadedContexts.splice(0)) {
      await ctx.mod.stopIpfs();
    }
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test('registers IPC handlers and reports native availability plus initial status', async () => {
    const ctx = loadIpfsManagerModule({
      nativeAvailable: false,
    });

    ctx.mod.registerIpfsIpc();

    expect([...ctx.ipcMain.handlers.keys()].sort()).toEqual(
      [IPC.IPFS_START, IPC.IPFS_STOP, IPC.IPFS_GET_STATUS, IPC.IPFS_CHECK_BINARY].sort()
    );

    await expect(ctx.ipcMain.invoke(IPC.IPFS_GET_STATUS)).resolves.toEqual({
      status: 'stopped',
      error: null,
      diagnostics: {
        progress: '{"active":[],"events":[]}',
        nativeGatewayStats: '{}',
        nativeVersion: null,
        nativeBuildInfo: null,
      },
    });
    await expect(ctx.ipcMain.invoke(IPC.IPFS_CHECK_BINARY)).resolves.toEqual({
      available: false,
    });
  });

  test('starts the bundled freedom-ipfs native node', async () => {
    const window = createWindowMock();
    const ctx = loadIpfsManagerModule({ windows: [window] });

    await ctx.mod.startIpfs();

    expect(ctx.fsMock.mkdirSync).toHaveBeenCalledWith(NATIVE_IPFS_DATA_DIR, { recursive: true });
    expect(ctx.nativeInstances).toHaveLength(1);
    expect(ctx.nativeInstances[0].config).toEqual({
      dataDir: NATIVE_IPFS_DATA_DIR,
      onFailure: expect.any(Function),
    });
    expect(ctx.nativeInstances[0].start).toHaveBeenCalled();
    expect(ctx.updateService).toHaveBeenCalledWith('ipfs', {
      api: null,
      gateway: null,
      mode: 'bundled',
      backend: 'freedom-ipfs',
    });
    expect(ctx.setStatusMessage).toHaveBeenCalledWith('ipfs', 'Node: freedom-ipfs 0.4.1');
    expect(window.webContents.send).toHaveBeenCalledWith(IPC.IPFS_STATUS_UPDATE, {
      status: 'starting',
      error: null,
    });
    expect(window.webContents.send).toHaveBeenLastCalledWith(IPC.IPFS_STATUS_UPDATE, {
      status: 'running',
      error: null,
    });
  });

  test('does not start native IPFS when the active profile disables it', async () => {
    const ctx = loadIpfsManagerModule({
      activeProfile: {
        metadata: {
          nodes: {
            ipfs: { mode: 'disabled', backend: 'freedom-ipfs' },
          },
        },
      },
    });

    await ctx.mod.startIpfs();

    expect(ctx.nativeInstances).toHaveLength(0);
    expect(ctx.clearService).toHaveBeenCalledWith('ipfs');
    expect(ctx.updateService).toHaveBeenCalledWith('ipfs', {
      api: null,
      gateway: null,
      mode: 'disabled',
      backend: 'freedom-ipfs',
    });
    expect(ctx.setStatusMessage).toHaveBeenCalledWith('ipfs', 'Node disabled for this profile');
  });

  test('serves native gateway requests only while running', async () => {
    const ctx = loadIpfsManagerModule();

    const stoppedResponse = await ctx.mod.serveNativeGatewayRequest({
      path: '/ipfs/bafy',
      method: 'GET',
      headers: new Headers(),
    });
    expect(stoppedResponse.status).toBe(503);

    await ctx.mod.startIpfs();
    const response = await ctx.mod.serveNativeGatewayRequest({
      path: '/ipfs/bafy',
      method: 'GET',
      headers: new Headers(),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('native-body');
    expect(ctx.nativeInstances[0].request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/ipfs/bafy',
      headers: expect.any(Headers),
      signal: undefined,
    });
  });

  test('reports native version and build metadata in diagnostics', async () => {
    const ctx = loadIpfsManagerModule({
      nativeVersion: '0.4.1',
      nativeBuildInfoJson: JSON.stringify({
        name: 'freedom-ipfs',
        version: '0.4.1',
        release_tag: 'v0.4.1',
        target: 'linux-x64',
      }),
    });

    await ctx.mod.startIpfs();

    expect(ctx.mod.getNativeDiagnostics()).toEqual({
      progress: '{"active":[],"events":[]}',
      nativeGatewayStats: '{"active_native_handles":0}',
      nativeVersion: '0.4.1',
      nativeBuildInfo: JSON.stringify({
        name: 'freedom-ipfs',
        version: '0.4.1',
        release_tag: 'v0.4.1',
        target: 'linux-x64',
      }),
    });
  });

  test('stops the native node and clears registry state', async () => {
    const ctx = loadIpfsManagerModule();

    await ctx.mod.startIpfs();
    await ctx.mod.stopIpfs();

    expect(ctx.nativeInstances[0].stop).toHaveBeenCalled();
    expect(ctx.clearService).toHaveBeenCalledWith('ipfs');
    expect(ctx.clearErrorState).toHaveBeenCalledWith('ipfs');
  });

  test('a start requested mid-stop queues behind the stop and resolves once running', async () => {
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    const ctx = loadIpfsManagerModule();
    ctx.mod.registerIpfsIpc();

    // Bring the node up.
    await ctx.ipcMain.invoke(IPC.IPFS_START);
    expect(ctx.nativeInstances).toHaveLength(1);

    // Make the stop hang so a start can be requested while the node is STOPPING.
    let releaseStop;
    ctx.nativeInstances[0].stop.mockImplementation(
      () => new Promise((resolve) => {
        releaseStop = resolve;
      })
    );

    const stopResult = ctx.ipcMain.invoke(IPC.IPFS_STOP);
    await flush();

    // Mid-stop the user flips back on. The start must queue behind the in-flight
    // stop rather than be dropped or run concurrently.
    const startResult = ctx.ipcMain.invoke(IPC.IPFS_START);
    await flush();

    // Still stopping: the queued start hasn't spun up a new node yet, and the
    // reported status is the live transitional state.
    expect(ctx.nativeInstances).toHaveLength(1);
    await expect(ctx.ipcMain.invoke(IPC.IPFS_GET_STATUS)).resolves.toMatchObject({
      status: 'stopping',
    });

    // Let the stop finish; the queued start then runs to completion.
    releaseStop();

    // The stop IPC settles to 'stopped', and crucially the start IPC resolves
    // only once the node is actually back up — not with the transient 'stopping'.
    expect((await stopResult).status).toBe('stopped');
    expect((await startResult).status).toBe('running');
    expect(ctx.nativeInstances).toHaveLength(2);
  });

  test('moves to error and cleans up when the native node reports failure', async () => {
    const window = createWindowMock();
    const ctx = loadIpfsManagerModule({ windows: [window] });

    await ctx.mod.startIpfs();
    ctx.nativeInstances[0].config.onFailure('dispatcher died', ctx.nativeInstances[0]);
    await Promise.resolve();

    expect(ctx.nativeInstances[0].stop).toHaveBeenCalled();
    expect(ctx.clearService).toHaveBeenCalledWith('ipfs');
    expect(ctx.setStatusMessage).toHaveBeenCalledWith('ipfs', 'Node unavailable');
    expect(ctx.setErrorState).toHaveBeenCalledWith(
      'ipfs',
      'Node unavailable. Restart IPFS from the nodes menu.'
    );
    expect(window.webContents.send).toHaveBeenLastCalledWith(IPC.IPFS_STATUS_UPDATE, {
      status: 'error',
      error: 'dispatcher died',
    });

    const response = await ctx.mod.serveNativeGatewayRequest({
      path: '/ipfs/bafy',
      method: 'GET',
      headers: new Headers(),
    });
    expect(response.status).toBe(503);
  });

  test('health check reflects native liveness and diagnostics availability', async () => {
    const unhealthy = loadIpfsManagerModule({ isHealthy: false });
    await unhealthy.mod.startIpfs();
    expect(unhealthy.mod.checkHealth()).toBe(false);

    const throwingStats = loadIpfsManagerModule({ statsThrows: true });
    await throwingStats.mod.startIpfs();
    expect(throwingStats.mod.checkHealth()).toBe(false);
    expect(throwingStats.log.warn).toHaveBeenCalledWith(
      '[IPFS] Native health check failed:',
      'stats unavailable'
    );
  });

  test('fails startup when the native addon is unavailable', async () => {
    const ctx = loadIpfsManagerModule({
      nativeAvailable: false,
    });

    await ctx.mod.startIpfs();

    expect(ctx.nativeInstances).toHaveLength(0);
    expect(ctx.setStatusMessage).toHaveBeenCalledWith('ipfs', 'Native node unavailable');
    await expect(
      ctx.mod.serveNativeGatewayRequest({
        path: '/ipfs/bafy',
        method: 'GET',
        headers: new Headers(),
      })
    ).resolves.toMatchObject({ status: 503 });
  });

  test('starts in external mode and proxies gateway requests even when the native addon is absent', async () => {
    const window = createWindowMock();
    const realFetch = global.fetch;
    global.fetch = mockGatewayFetch();
    try {
      const ctx = loadIpfsManagerModule({
        windows: [window],
        // The native addon cannot load external mode must work regardless.
        nativeAvailable: false,
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });

      await ctx.mod.startIpfs();

      expect(ctx.nativeInstances).toHaveLength(0);
      // A running external node is the one case where `gateway` is published:
      // it means "ipfs:// is being served here right now".
      expect(ctx.updateService).toHaveBeenCalledWith('ipfs', {
        api: null,
        gateway: 'http://127.0.0.1:8080',
        externalGateway: 'http://127.0.0.1:8080',
        mode: 'external',
        backend: 'external-gateway',
      });
      expect(ctx.setStatusMessage).toHaveBeenCalledWith('ipfs', 'External node: 127.0.0.1:8080');
      expect(window.webContents.send).toHaveBeenLastCalledWith(IPC.IPFS_STATUS_UPDATE, {
        status: 'running',
        error: null,
      });

      const response = await ctx.mod.serveNativeGatewayRequest({
        path: '/ipfs/bafy',
        method: 'GET',
        headers: new Headers(),
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('external-body');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8080/ipfs/bafy',
        expect.objectContaining({ method: 'GET', redirect: 'manual' })
      );
    } finally {
      global.fetch = realFetch;
    }
  });

  test('external mode reports the gateway unreachable when the probe fails', async () => {
    const realFetch = global.fetch;
    global.fetch = jest.fn(async () => new Response('bad gateway', { status: 502 }));
    try {
      const ctx = loadIpfsManagerModule({
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });
      ctx.mod.registerIpfsIpc();

      await ctx.mod.startIpfs();

      expect(ctx.nativeInstances).toHaveLength(0);
      expect(ctx.setStatusMessage).toHaveBeenCalledWith('ipfs', 'External node unreachable');
      await expect(ctx.ipcMain.invoke(IPC.IPFS_GET_STATUS)).resolves.toMatchObject({
        status: 'error',
      });
    } finally {
      global.fetch = realFetch;
    }
  });

  // A stock Kubo subdomain-redirects `localhost` (301 to `<cid>.ipfs.localhost`)
  // and the probe never follows a redirect, so a perfectly healthy default Kubo
  // typed in as `localhost:8080` reads unreachable. The same node answers
  // path-style on `127.0.0.1` — say so instead of leaving the user guessing.
  test('an unreachable localhost gateway points at 127.0.0.1 in its status', async () => {
    const realFetch = global.fetch;
    // What Kubo actually answers on `Host: localhost:<port>`.
    global.fetch = jest.fn(
      async () =>
        new Response(null, {
          status: 301,
          headers: { location: 'http://bafkqaaa.ipfs.localhost:8080/' },
        })
    );
    try {
      const ctx = loadIpfsManagerModule({
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://localhost:8080' },
            },
          },
        },
      });
      ctx.mod.registerIpfsIpc();

      await ctx.mod.startIpfs();

      expect(ctx.setStatusMessage).toHaveBeenCalledWith(
        'ipfs',
        'External node unreachable — for Kubo, use 127.0.0.1 instead of localhost'
      );
      await expect(ctx.ipcMain.invoke(IPC.IPFS_GET_STATUS)).resolves.toMatchObject({
        status: 'error',
        error: 'External IPFS gateway is unreachable — for Kubo, use 127.0.0.1 instead of localhost',
      });
    } finally {
      global.fetch = realFetch;
    }
  });

  test('a non-localhost gateway keeps the plain unreachable status', async () => {
    const realFetch = global.fetch;
    global.fetch = jest.fn(async () => new Response('bad gateway', { status: 502 }));
    try {
      const ctx = loadIpfsManagerModule({
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'https://gw.example.test' },
            },
          },
        },
      });

      await ctx.mod.startIpfs();

      expect(ctx.setStatusMessage).toHaveBeenLastCalledWith('ipfs', 'External node unreachable');
    } finally {
      global.fetch = realFetch;
    }
  });

  // The user configures a gateway, never an RPC API. `:5001` on a remote or LAN
  // host is somebody else's port (and Kubo's own :5001 is its admin RPC), so
  // version detection is loopback-only.
  test('never probes the RPC API port of a non-loopback gateway', async () => {
    const realFetch = global.fetch;
    global.fetch = mockGatewayFetch();
    try {
      const ctx = loadIpfsManagerModule({
        nativeAvailable: false,
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'https://gw.example.test' },
            },
          },
        },
      });

      await ctx.mod.startIpfs();
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining(':5001'),
        expect.anything()
      );
      // The endpoint is still shown as the gateway's identity.
      expect(ctx.mod.getNativeDiagnostics()).toMatchObject({
        externalGateway: 'https://gw.example.test',
        externalVersion: null,
      });
    } finally {
      global.fetch = realFetch;
    }
  });

  // R1-F2/R2-F1: the external probe can hang for its full 2s timeout, during
  // which the user can restart the node onto the native backend. A verdict about
  // an endpoint that is no longer being served must not be applied — a stale
  // `false` would set an ERROR the native health path never clears, 503-ing
  // every ipfs:// load against a healthy native node.
  test('a stale external health probe cannot wedge a node that switched to native', async () => {
    jest.useFakeTimers();
    const realFetch = global.fetch;
    let releaseProbe = null;
    const activeProfile = {
      metadata: {
        nodes: { ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' } },
      },
    };
    try {
      global.fetch = mockGatewayFetch();
      const ctx = loadIpfsManagerModule({ activeProfile });
      ctx.mod.registerIpfsIpc();

      await ctx.mod.startIpfs();
      await expect(ctx.ipcMain.invoke(IPC.IPFS_GET_STATUS)).resolves.toMatchObject({
        status: 'running',
      });

      // The gateway stops answering: the next health probe hangs rather than
      // refusing (LAN gateway down, firewall drop).
      global.fetch = jest.fn(
        () =>
          new Promise((resolve) => {
            releaseProbe = resolve;
          })
      );
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
      expect(releaseProbe).toBeInstanceOf(Function);

      // Meanwhile the user switches the profile to managed and restarts IPFS.
      activeProfile.metadata.nodes.ipfs = { mode: 'bundled' };
      await ctx.mod.stopIpfs();
      await ctx.mod.startIpfs();
      expect(ctx.nativeInstances).toHaveLength(1);

      // Only now does the stale probe settle, with an unhealthy verdict.
      releaseProbe(new Response('bad gateway', { status: 502 }));
      // Drain far past the probe's own read/settle chain, so a missing guard
      // wedges the state *before* the assertions rather than between them.
      for (let i = 0; i < 50; i += 1) {
        await Promise.resolve();
      }

      await expect(ctx.ipcMain.invoke(IPC.IPFS_GET_STATUS)).resolves.toMatchObject({
        status: 'running',
        error: null,
      });
      expect(ctx.setErrorState).not.toHaveBeenCalled();
      const response = await ctx.mod.serveNativeGatewayRequest({
        path: '/ipfs/bafy',
        method: 'GET',
        headers: new Headers(),
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('native-body');
    } finally {
      global.fetch = realFetch;
      jest.useRealTimers();
    }
  });

  test('stopping an external node keeps external mode in the registry so it can be re-enabled', async () => {
    const realFetch = global.fetch;
    global.fetch = mockGatewayFetch();
    try {
      const ctx = loadIpfsManagerModule({
        // Native addon absent: the only way back on is that the registry still
        // advertises external mode after a stop.
        nativeAvailable: false,
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });

      await ctx.mod.startIpfs();
      ctx.updateService.mockClear();
      ctx.clearService.mockClear();
      await ctx.mod.stopIpfs();

      // On stop the registry is NOT cleared to 'none'. It keeps external mode +
      // the configured endpoint so the renderer can offer to switch it back on.
      // `gateway` (the "serving here right now" field ens-prefetch and
      // state.ipfsBase act on) is dropped: IPFS off means no gateway traffic.
      expect(ctx.clearService).not.toHaveBeenCalled();
      expect(ctx.updateService).toHaveBeenLastCalledWith('ipfs', {
        api: null,
        gateway: null,
        externalGateway: 'http://127.0.0.1:8080',
        mode: 'external',
        backend: 'external-gateway',
      });
      expect(ctx.setStatusMessage).toHaveBeenLastCalledWith('ipfs', 'External node stopped');
    } finally {
      global.fetch = realFetch;
    }
  });

  test('external mode without a gateway URL is reported as not configured', async () => {
    const ctx = loadIpfsManagerModule({
      activeProfile: {
        metadata: {
          nodes: {
            ipfs: { mode: 'external' },
          },
        },
      },
    });

    await ctx.mod.startIpfs();

    expect(ctx.nativeInstances).toHaveLength(0);
    expect(ctx.setStatusMessage).toHaveBeenCalledWith('ipfs', 'External node not configured');
  });

  // #350: the registry mode is what tells the renderer the backend is one
  // Freedom can control without the native addon. A start that never reached a
  // running node still has to publish it, or the nodes-menu toggle stays
  // disabled and the user can never retry without relaunching the app.
  test('a failed external start still publishes external mode so the user can retry', async () => {
    const realFetch = global.fetch;
    let gatewayUp = false;
    global.fetch = jest.fn(async (url, init) => {
      if (!gatewayUp) return new Response('bad gateway', { status: 502 });
      return mockGatewayFetch()(url, init);
    });
    try {
      const ctx = loadIpfsManagerModule({
        // Native addon absent: external mode is the only backend available.
        nativeAvailable: false,
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });

      await ctx.mod.startIpfs();

      expect(ctx.setStatusMessage).toHaveBeenCalledWith('ipfs', 'External node unreachable');
      // Mode yes (the toggle needs it), serving endpoint no (nothing is served).
      expect(ctx.updateService).toHaveBeenLastCalledWith('ipfs', {
        api: null,
        gateway: null,
        externalGateway: 'http://127.0.0.1:8080',
        mode: 'external',
        backend: 'external-gateway',
      });

      // The user starts their gateway and hits the toggle again — no relaunch.
      gatewayUp = true;
      await ctx.mod.startIpfs();

      expect(ctx.setStatusMessage).toHaveBeenLastCalledWith(
        'ipfs',
        'External node: 127.0.0.1:8080'
      );
      expect(ctx.updateService).toHaveBeenLastCalledWith('ipfs', {
        api: null,
        gateway: 'http://127.0.0.1:8080',
        externalGateway: 'http://127.0.0.1:8080',
        mode: 'external',
        backend: 'external-gateway',
      });
    } finally {
      global.fetch = realFetch;
    }
  });

  test('an unconfigured external gateway still publishes external mode', async () => {
    const ctx = loadIpfsManagerModule({
      nativeAvailable: false,
      activeProfile: {
        metadata: {
          nodes: {
            ipfs: { mode: 'external' },
          },
        },
      },
    });

    await ctx.mod.startIpfs();

    expect(ctx.updateService).toHaveBeenLastCalledWith('ipfs', {
      api: null,
      gateway: null,
      externalGateway: null,
      mode: 'external',
      backend: 'external-gateway',
    });
  });

  test('syncProfileMode publishes a newly configured external mode without a relaunch', async () => {
    const activeProfile = {
      metadata: { nodes: { ipfs: { mode: 'bundled', externalGateway: null } } },
    };
    const ctx = loadIpfsManagerModule({ nativeAvailable: false, activeProfile });

    // Launch: the native addon can't load, so the registry says nothing usable.
    await ctx.mod.startIpfs();
    expect(ctx.setStatusMessage).toHaveBeenLastCalledWith('ipfs', 'Native node unavailable');
    expect(ctx.updateService).not.toHaveBeenCalled();

    // The user switches the profile to an external gateway in Settings.
    activeProfile.metadata.nodes.ipfs = {
      mode: 'external',
      externalGateway: 'http://127.0.0.1:8080',
    };
    await ctx.mod.syncProfileMode();

    expect(ctx.updateService).toHaveBeenLastCalledWith('ipfs', {
      api: null,
      // Configured but never started: no serving endpoint yet.
      gateway: null,
      externalGateway: 'http://127.0.0.1:8080',
      mode: 'external',
      backend: 'external-gateway',
    });
    expect(ctx.setStatusMessage).toHaveBeenLastCalledWith('ipfs', 'External node stopped');
    // The failure recorded against the old config no longer describes this one.
    expect(ctx.clearErrorState).toHaveBeenCalledWith('ipfs');

    // And the toggle's start now reaches the configured gateway.
    const realFetch = global.fetch;
    global.fetch = mockGatewayFetch();
    try {
      await ctx.mod.startIpfs();
      expect(ctx.setStatusMessage).toHaveBeenLastCalledWith(
        'ipfs',
        'External node: 127.0.0.1:8080'
      );
    } finally {
      global.fetch = realFetch;
    }
  });

  test('syncProfileMode publishes disabled mode and stops a running node', async () => {
    const activeProfile = { metadata: { nodes: { ipfs: { mode: 'bundled' } } } };
    const ctx = loadIpfsManagerModule({ activeProfile });

    await ctx.mod.startIpfs();
    expect(ctx.nativeInstances).toHaveLength(1);

    activeProfile.metadata.nodes.ipfs = { mode: 'disabled' };
    await ctx.mod.syncProfileMode();

    expect(ctx.nativeInstances[0].stop).toHaveBeenCalled();
    expect(ctx.updateService).toHaveBeenLastCalledWith('ipfs', {
      api: null,
      gateway: null,
      mode: 'disabled',
      backend: 'freedom-ipfs',
    });
    expect(ctx.setStatusMessage).toHaveBeenLastCalledWith('ipfs', 'Node disabled for this profile');
  });

  test('syncProfileMode leaves a running node on the backend it actually started with', async () => {
    const activeProfile = { metadata: { nodes: { ipfs: { mode: 'bundled' } } } };
    const ctx = loadIpfsManagerModule({ activeProfile });

    await ctx.mod.startIpfs();
    ctx.updateService.mockClear();
    ctx.setStatusMessage.mockClear();

    // Settings' own save hint says a mode change needs a node restart, so the
    // live bundled node must keep serving — and the registry must keep
    // describing it — until the user restarts it.
    activeProfile.metadata.nodes.ipfs = {
      mode: 'external',
      externalGateway: 'http://127.0.0.1:8080',
    };
    await ctx.mod.syncProfileMode();

    expect(ctx.nativeInstances[0].stop).not.toHaveBeenCalled();
    expect(ctx.updateService).not.toHaveBeenCalled();
    expect(ctx.setStatusMessage).not.toHaveBeenCalled();
  });

  // R4-F2: the external health check is deliberately *soft* — it keeps probing
  // an unreachable gateway so the node can recover on its own. That means a
  // node left in ERROR still has a live 5s interval armed against the endpoint
  // the profile no longer names, so every non-running sync path has to tear it
  // down or Freedom keeps GETting the old gateway forever while the UI says
  // stopped (and a late healthy probe could flip it back to RUNNING).
  describe('leaving external mode stops probing the old gateway', () => {
    const drainMicrotasks = async () => {
      for (let i = 0; i < 50; i += 1) await Promise.resolve();
    };

    const probeCallsTo = (fetchMock, gateway) =>
      fetchMock.mock.calls.filter((call) => String(call[0]) === `${gateway}${GATEWAY_PROBE_PATH}`)
        .length;

    // Start external, then knock the gateway over so the node sits in the soft
    // ERROR state with its health check still running.
    const startThenFailExternal = async (activeProfile) => {
      const gateway = activeProfile.metadata.nodes.ipfs.externalGateway;
      global.fetch = mockGatewayFetch();
      const ctx = loadIpfsManagerModule({ nativeAvailable: false, activeProfile });
      ctx.mod.registerIpfsIpc();
      await ctx.mod.startIpfs();

      global.fetch = jest.fn(async () => new Response('bad gateway', { status: 502 }));
      jest.advanceTimersByTime(5000);
      await drainMicrotasks();
      await expect(ctx.ipcMain.invoke(IPC.IPFS_GET_STATUS)).resolves.toMatchObject({
        status: 'error',
      });
      // The soft check is provably still armed against the old endpoint.
      expect(probeCallsTo(global.fetch, gateway)).toBe(1);
      return ctx;
    };

    test.each([
      ['managed', { mode: 'bundled' }],
      ['disabled', { mode: 'disabled' }],
      ['another external endpoint', { mode: 'external', externalGateway: 'http://127.0.0.1:9090' }],
    ])('sync to %s stops the probe against the old gateway', async (_label, nextConfig) => {
      jest.useFakeTimers();
      const realFetch = global.fetch;
      const gateway = 'http://127.0.0.1:8080';
      const activeProfile = {
        metadata: { nodes: { ipfs: { mode: 'external', externalGateway: gateway } } },
      };
      try {
        const ctx = await startThenFailExternal(activeProfile);

        // The user changes the node config in Settings.
        activeProfile.metadata.nodes.ipfs = nextConfig;
        await ctx.mod.syncProfileMode();
        global.fetch.mockClear();

        // Three full health-check intervals later, nothing has been sent to the
        // endpoint the profile no longer names.
        jest.advanceTimersByTime(15000);
        await drainMicrotasks();

        expect(probeCallsTo(global.fetch, gateway)).toBe(0);
        expect(global.fetch).not.toHaveBeenCalled();
        // The interval itself is disarmed, not merely quiet: the disabled path
        // would stop dialling anyway (the callback's external branch is gated on
        // the mode), so without this a revert of `stopHealthCheck()` there would
        // leave a live 5s timer for the rest of the session and still pass.
        expect(jest.getTimerCount()).toBe(0);
        // And the stale endpoint is gone from the diagnostics with it.
        expect(ctx.mod.getNativeDiagnostics().externalGateway).toBeUndefined();
      } finally {
        global.fetch = realFetch;
        jest.useRealTimers();
      }
    });

    // R1-F1, the complement: Settings saves node config unconditionally, so a
    // user troubleshooting a downed gateway can land in doSyncIpfsProfileMode
    // with *nothing* changed. The probe is then still armed for the endpoint the
    // profile names, and tearing it down there would settle the node to STOPPED
    // with nothing left to notice the gateway coming back.
    test('a no-change save keeps the soft retry armed and still auto-recovers', async () => {
      jest.useFakeTimers();
      const realFetch = global.fetch;
      const gateway = 'http://127.0.0.1:8080';
      const activeProfile = {
        metadata: { nodes: { ipfs: { mode: 'external', externalGateway: gateway } } },
      };
      try {
        const ctx = await startThenFailExternal(activeProfile);

        // Settings > Nodes > IPFS, Save, with the same external endpoint —
        // spelled the way the user typed it rather than the normalized form the
        // manager dialled, because that round-trips through Settings too.
        activeProfile.metadata.nodes.ipfs = { mode: 'external', externalGateway: '127.0.0.1:8080' };
        await ctx.mod.syncProfileMode();

        // Still in soft ERROR, still external, still describing the endpoint.
        await expect(ctx.ipcMain.invoke(IPC.IPFS_GET_STATUS)).resolves.toMatchObject({
          status: 'error',
        });
        expect(ctx.mod.getNativeDiagnostics().externalGateway).toBe(gateway);

        // The gateway comes back, and the still-armed probe finds it.
        global.fetch = mockGatewayFetch();
        jest.advanceTimersByTime(5000);
        await drainMicrotasks();

        expect(probeCallsTo(global.fetch, gateway)).toBe(1);
        await expect(ctx.ipcMain.invoke(IPC.IPFS_GET_STATUS)).resolves.toMatchObject({
          status: 'running',
        });
        expect(ctx.clearErrorState).toHaveBeenLastCalledWith('ipfs');
      } finally {
        global.fetch = realFetch;
        jest.useRealTimers();
      }
    });
  });

  test('external mode reports gateway telemetry (bytes streamed + active handles) via diagnostics', async () => {
    const realFetch = global.fetch;
    global.fetch = mockGatewayFetch();
    try {
      const ctx = loadIpfsManagerModule({
        nativeAvailable: false,
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });
      await ctx.mod.startIpfs();

      // External-shaped stats, zeroed before any request is served.
      expect(JSON.parse(ctx.mod.getNativeDiagnostics().nativeGatewayStats)).toEqual({
        active_native_handles: 0,
        bytes_read: 0,
      });

      const res = await ctx.mod.serveNativeGatewayRequest({
        path: '/ipfs/bafy',
        method: 'GET',
        headers: new Headers(),
      });
      // Draining the response is what advances the byte tally (counted as bytes
      // stream through, like the native drain loop) and releases the handle.
      expect(await res.text()).toBe('external-body');

      const stats = JSON.parse(ctx.mod.getNativeDiagnostics().nativeGatewayStats);
      expect(stats.bytes_read).toBe(Buffer.byteLength('external-body'));
      expect(stats.active_native_handles).toBe(0);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('external mode detects the Kubo version from the RPC API and reports it as identity', async () => {
    const realFetch = global.fetch;
    global.fetch = mockGatewayFetch(async (url) => {
      if (String(url).includes('/api/v0/version')) {
        return new Response(JSON.stringify({ Version: '0.30.0' }), { status: 200 });
      }
      return new Response('external-body', { status: 200 });
    });
    try {
      const ctx = loadIpfsManagerModule({
        nativeAvailable: false,
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });
      await ctx.mod.startIpfs();
      // The version detection is fire-and-forget; let its microtasks settle.
      for (let i = 0; i < 5; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      const diag = ctx.mod.getNativeDiagnostics();
      expect(diag.externalGateway).toBe('http://127.0.0.1:8080');
      expect(diag.externalVersion).toBe('Kubo 0.30.0');
      // The version probe targets the RPC API port (:5001)
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:5001/api/v0/version',
        expect.objectContaining({ method: 'POST' })
      );
    } finally {
      global.fetch = realFetch;
    }
  });

  // R4-F3: the loopback gate is what keeps that unsolicited RPC POST on the
  // user's own machine, so it must only accept *literal* loopback addresses. A
  // `127.` prefix test also accepts a resolvable DNS name whose owner points it
  // anywhere they like, and the POST goes there instead.
  test.each([
    ['127.evil.example', false],
    ['127.0.0.1.evil.example', false],
    ['127x0x0x1', false],
    ['127.0.0.1', true],
    ['127.1.2.3', true],
    ['localhost', true],
  ])(
    'version detection dials :5001 only for a literal loopback host (%s)',
    async (hostname, expectProbe) => {
      const realFetch = global.fetch;
      global.fetch = mockGatewayFetch(async (url) => {
        if (String(url).includes('/api/v0/version')) {
          return new Response(JSON.stringify({ Version: '0.30.0' }), { status: 200 });
        }
        return new Response('external-body', { status: 200 });
      });
      try {
        const ctx = loadIpfsManagerModule({
          nativeAvailable: false,
          activeProfile: {
            metadata: {
              nodes: {
                ipfs: { mode: 'external', externalGateway: `http://${hostname}:8080` },
              },
            },
          },
        });
        await ctx.mod.startIpfs();
        // The version detection is fire-and-forget; let its microtasks settle.
        for (let i = 0; i < 5; i += 1) {
          await new Promise((resolve) => setImmediate(resolve));
        }

        const dialled5001 = global.fetch.mock.calls.some((call) =>
          String(call[0]).includes(':5001')
        );
        expect(dialled5001).toBe(expectProbe);
        expect(ctx.mod.getNativeDiagnostics().externalVersion).toBe(
          expectProbe ? 'Kubo 0.30.0' : null
        );
      } finally {
        global.fetch = realFetch;
      }
    }
  );

  test('does not treat a dev server answering 200 for every path as a gateway', async () => {
    const realFetch = global.fetch;
    // A Vite/CRA-style dev server on :8080: 200 + index.html for any path,
    // including the probe CID. Accepting it would route every ipfs:// load
    // through a server that has never heard of IPFS.
    global.fetch = jest.fn(
      async () =>
        new Response('<!doctype html><html><body>dev server</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
    );
    try {
      const ctx = loadIpfsManagerModule({
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });

      await ctx.mod.startIpfs();

      expect(ctx.setStatusMessage).toHaveBeenCalledWith('ipfs', 'External node unreachable');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8080/ipfs/bafkqaaa',
        expect.objectContaining({ method: 'GET', redirect: 'manual' })
      );
    } finally {
      global.fetch = realFetch;
    }
  });

  test('the probe does not follow a gateway redirect into another local service', async () => {
    const realFetch = global.fetch;
    const requested = [];
    global.fetch = jest.fn(async (url, init) => {
      requested.push(String(url));
      // `redirect: 'manual'` is what keeps undici from fetching the Location
      // target itself; assert the flag and mimic the 3xx it then surfaces.
      expect(init.redirect).toBe('manual');
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:1633/' } });
    });
    try {
      const ctx = loadIpfsManagerModule({
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });

      await ctx.mod.startIpfs();

      expect(ctx.setStatusMessage).toHaveBeenCalledWith('ipfs', 'External node unreachable');
      expect(requested).toEqual(['http://127.0.0.1:8080/ipfs/bafkqaaa']);
    } finally {
      global.fetch = realFetch;
    }
  });

  test('a proxied gateway redirect is passed through, never followed', async () => {
    const realFetch = global.fetch;
    const requested = [];
    global.fetch = mockGatewayFetch(async (url, init) => {
      requested.push(String(url));
      expect(init.redirect).toBe('manual');
      return new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1:1633/bzz/secret' },
      });
    });
    try {
      const ctx = loadIpfsManagerModule({
        nativeAvailable: false,
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });
      await ctx.mod.startIpfs();

      const response = await ctx.mod.serveNativeGatewayRequest({
        path: '/ipfs/bafy',
        method: 'GET',
        headers: new Headers(),
      });

      // The 3xx reaches Chromium as-is; Freedom never fetches the loopback
      // service the hostile gateway pointed at.
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('http://127.0.0.1:1633/bzz/secret');
      // The version detection also talks to :5001; nothing else is dialled,
      // and in particular not the redirect's target.
      expect(requested.filter((url) => !url.includes('/api/v0/version'))).toEqual([
        'http://127.0.0.1:8080/ipfs/bafy',
      ]);
    } finally {
      global.fetch = realFetch;
    }
  });

  // Kubo's canonical trailing-slash redirect for a directory is written in the
  // gateway's URL space (`Location: /ipfs/<cid>/docs/`), but Chromium resolves
  // it against the `ipfs://` request URL it actually issued. Passing it through
  // verbatim lands the tab on `ipfs://<cid>/ipfs/<cid>/docs/`, which 404s — so
  // every directory URL without a trailing slash breaks in external mode.
  // Rewriting it as a relative reference resolves to the same bytes whatever
  // the `/<ns>/<ref>` prefix the ipfs:// host mapped to.
  describe('gateway redirects that stay inside the requested path', () => {
    const redirectCase = async ({ path, status = 301, location }) => {
      const realFetch = global.fetch;
      global.fetch = mockGatewayFetch(
        async () => new Response(null, { status, headers: { location } })
      );
      try {
        const ctx = loadIpfsManagerModule({
          nativeAvailable: false,
          activeProfile: {
            metadata: {
              nodes: {
                ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
              },
            },
          },
        });
        await ctx.mod.startIpfs();
        const response = await ctx.mod.serveNativeGatewayRequest({
          path,
          method: 'GET',
          headers: new Headers(),
        });
        return { status: response.status, location: response.headers.get('location') };
      } finally {
        global.fetch = realFetch;
      }
    };

    test("rewrites Kubo's directory 301 to a relative reference", async () => {
      expect(
        await redirectCase({
          path: '/ipfs/bafybeidirectory/docs',
          location: '/ipfs/bafybeidirectory/docs/',
        })
      ).toEqual({ status: 301, location: './docs/' });
    });

    test('keeps the query string on the rewritten Location', async () => {
      expect(
        await redirectCase({
          path: '/ipfs/bafybeidirectory/docs?page=2',
          location: '/ipfs/bafybeidirectory/docs/?page=2',
        })
      ).toEqual({ status: 301, location: './docs/?page=2' });
    });

    // R4-F1: a relative reference whose first segment contains a `:` is parsed
    // as an absolute URL with that segment as its scheme, and `:` is a legal
    // UnixFS directory name — so the reference has to be `./`-prefixed or
    // Chromium reads `re:port/` as the (unknown) `re:` scheme and the
    // navigation fails instead of opening the directory.
    test('rewrites a directory name containing a colon so it stays a relative path', async () => {
      const { location } = await redirectCase({
        path: '/ipfs/bafybeidirectory/re:port',
        location: '/ipfs/bafybeidirectory/re:port/',
      });

      expect(location).toBe('./re:port/');
      // What Chromium does with it: resolved against the ipfs:// request URL it
      // must land inside the ipfs:// origin, not on a `re:` scheme.
      const resolved = new URL(location, 'ipfs://bafybeidirectory/re:port');
      expect(resolved.protocol).toBe('ipfs:');
      expect(resolved.href).toBe('ipfs://bafybeidirectory/re:port/');
      // The bare form this replaced does exactly the thing the `./` prevents.
      expect(new URL('re:port/', 'ipfs://bafybeidirectory/re:port').protocol).toBe('re:');
    });

    // Every shape still resolves back to the bytes the gateway pointed at.
    test('the everyday directory rewrite resolves under the ipfs:// origin', () => {
      expect(new URL('./docs/', 'ipfs://bafybeidirectory/docs').href).toBe(
        'ipfs://bafybeidirectory/docs/'
      );
      expect(new URL('./', 'ipfs://bafybeidirectory/a/b').href).toBe('ipfs://bafybeidirectory/a/');
    });

    // An Ethereum name whose contenthash carries a base path resolves to
    // `/ipfs/<cid>/<base>/<path>`; the relative form is prefix-agnostic, so it
    // is right for this shape without this layer knowing the base path exists.
    test('rewrites correctly when the gateway path carries a published base path', async () => {
      expect(
        await redirectCase({
          path: '/ipfs/bafybeidirectory/site/docs',
          location: '/ipfs/bafybeidirectory/site/docs/',
        })
      ).toEqual({ status: 301, location: './docs/' });
    });

    test('rewrites a same-origin absolute Location too', async () => {
      expect(
        await redirectCase({
          status: 302,
          path: '/ipfs/bafybeidirectory/docs',
          location: 'http://127.0.0.1:8080/ipfs/bafybeidirectory/docs/',
        })
      ).toEqual({ status: 302, location: './docs/' });
    });

    // Outside the requested directory the prefix depth would have to be known
    // to translate the target, so the Location is left exactly as the gateway
    // wrote it rather than guessed at.
    test('leaves a Location that climbs out of the requested path untouched', async () => {
      expect(
        await redirectCase({
          path: '/ipfs/bafybeidirectory/docs',
          location: '/ipfs/bafyotherroot/docs/',
        })
      ).toEqual({ status: 301, location: '/ipfs/bafyotherroot/docs/' });
    });

    test('only rewrites redirect statuses', async () => {
      expect(
        await redirectCase({
          status: 200,
          path: '/ipfs/bafybeidirectory/docs',
          location: '/ipfs/bafybeidirectory/docs/',
        })
      ).toEqual({ status: 200, location: '/ipfs/bafybeidirectory/docs/' });
    });
  });

  test('drops content-encoding, content-length and hop-by-hop headers from the proxied response', async () => {
    const realFetch = global.fetch;
    global.fetch = mockGatewayFetch(
      async () =>
        // undici has already decoded this body; forwarding the upstream
        // content-encoding would have Chromium decode it a second time.
        new Response('external-body', {
          status: 200,
          headers: {
            'content-type': 'text/plain',
            'content-encoding': 'gzip',
            'content-length': '42',
            'transfer-encoding': 'chunked',
            connection: 'keep-alive',
            'keep-alive': 'timeout=5',
            'x-ipfs-path': '/ipfs/bafy',
          },
        })
    );
    try {
      const ctx = loadIpfsManagerModule({
        nativeAvailable: false,
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });
      await ctx.mod.startIpfs();

      const response = await ctx.mod.serveNativeGatewayRequest({
        path: '/ipfs/bafy',
        method: 'GET',
        headers: new Headers(),
      });

      expect([...response.headers.keys()].sort()).toEqual(['content-type', 'x-ipfs-path']);
      expect(await response.text()).toBe('external-body');
    } finally {
      global.fetch = realFetch;
    }
  });

  test('a failed external request logs the redacted path in a private window', async () => {
    const realFetch = global.fetch;
    global.fetch = mockGatewayFetch(async () => {
      throw new Error('socket hang up');
    });
    try {
      const ctx = loadIpfsManagerModule({
        nativeAvailable: false,
        activeProfile: {
          metadata: {
            nodes: {
              ipfs: { mode: 'external', externalGateway: 'http://127.0.0.1:8080' },
            },
          },
        },
      });
      await ctx.mod.startIpfs();

      // Same module instance the manager under test loaded, so the async
      // context it sets is the one redactForLog reads.
      const { runWithPrivateLogContext } = require('./private/private-log-context');
      const response = await runWithPrivateLogContext(true, () =>
        ctx.mod.serveNativeGatewayRequest({
          path: '/ipfs/bafysecret/where-the-user-went',
          method: 'GET',
          headers: new Headers(),
        })
      );

      expect(response.status).toBe(502);
      const warning = ctx.log.warn.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(warning).toContain('<private>');
      expect(warning).not.toContain('bafysecret');
    } finally {
      global.fetch = realFetch;
    }
  });

  test('normalizeExternalGatewayUrl canonicalizes hosts and rejects unusable values', () => {
    const ctx = loadIpfsManagerModule();
    expect(ctx.mod.normalizeExternalGatewayUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(ctx.mod.normalizeExternalGatewayUrl('http://localhost:8080/')).toBe(
      'http://localhost:8080'
    );
    expect(ctx.mod.normalizeExternalGatewayUrl('   ')).toBeNull();
    expect(ctx.mod.normalizeExternalGatewayUrl('ftp://example.test')).toBeNull();
    expect(ctx.mod.normalizeExternalGatewayUrl(null)).toBeNull();
    // undici's fetch refuses a credentialed URL, so a gateway that carries
    // userinfo is rejected here instead of failing every request later.
    expect(ctx.mod.normalizeExternalGatewayUrl('http://user:pass@127.0.0.1:8080')).toBeNull();
    expect(ctx.mod.normalizeExternalGatewayUrl('http://user@127.0.0.1:8080')).toBeNull();
  });
});
