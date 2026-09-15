/**
 * Electron-hosted probe for `ipfs-gateway-proxy.test.js`.
 *
 * Runs inside a real Electron main process (Chromium's network stack is the
 * thing under test — it cannot be exercised from plain Jest/Node) and drives
 * the *real* modules: `src/main/ipfs/gateway-transport.js` for the transport
 * and `src/main/tor-proxy.js` for the PAC installed on the session.
 *
 * It stands up three local servers:
 *   - an IPFS-gateway-shaped origin (a directory redirect, a gzipped file, a
 *     never-ending stream, and a plain file),
 *   - a SOCKS5 proxy standing in for Arti, which records the hostname:port
 *     Chromium asked it to connect to and then splices the connection to the
 *     origin (so a `.onion` name resolves *at the proxy*, exactly as Tor does),
 *   - an HTTP forward proxy, for the generic "the session has a proxy" case.
 *
 * Results are printed as one JSON line prefixed with `PROBE-RESULT `.
 */

const { app, session } = require('electron');
const http = require('http');
const net = require('net');
const zlib = require('zlib');

const { gatewayFetch } = require('../../ipfs/gateway-transport');
const { buildOnionPacScript, applyOnionProxy, clearOnionProxy } = require('../../tor-proxy');

const ONION_GATEWAY_HOST = 'freedomgatewayprobe.onion';
const REMOTE_GATEWAY_HOST = 'gateway.example.test';
const PROBE_PATH = '/ipfs/bafkqaaa';

const socksSeen = [];
const httpProxySeen = [];
const originSeen = [];
let streamSocketClosed = false;

function startOrigin() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      originSeen.push(`${req.headers.host}${req.url}`);
      if (req.url === '/ipfs/bafydir/docs') {
        res.writeHead(301, { Location: '/ipfs/bafydir/docs/', 'X-Ipfs-Path': '/ipfs/bafydir' });
        res.end();
        return;
      }
      if (req.url === '/ipfs/bafygz') {
        const body = zlib.gzipSync(Buffer.from('z'.repeat(4096)));
        res.writeHead(200, {
          'Content-Encoding': 'gzip',
          'Content-Length': String(body.length),
          'Content-Type': 'text/plain',
          'X-Ipfs-Path': '/ipfs/bafygz',
        });
        res.end(body);
        return;
      }
      if (req.url === '/ipfs/bafystream') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.write('first-chunk');
        const timer = setInterval(() => res.write('more'), 50);
        req.on('close', () => {
          clearInterval(timer);
          streamSocketClosed = true;
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain', 'X-Ipfs-Path': PROBE_PATH });
      res.end('gateway-body');
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

// Minimal SOCKS5 CONNECT server: records the destination Chromium asked for
// (the whole point — a `.onion` name must travel to the proxy, never to the
// system resolver) and splices the tunnel to the origin.
function startSocks(originPort) {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      socket.once('data', () => {
        socket.write(Buffer.from([0x05, 0x00])); // version 5, no auth
        socket.once('data', (request) => {
          const atyp = request[3];
          let host = '';
          let offset = 0;
          if (atyp === 0x03) {
            const len = request[4];
            host = request.subarray(5, 5 + len).toString('utf8');
            offset = 5 + len;
          } else if (atyp === 0x01) {
            host = Array.from(request.subarray(4, 8)).join('.');
            offset = 8;
          }
          const port = request.readUInt16BE(offset);
          socksSeen.push(`${host}:${port}`);
          const upstream = net.connect(originPort, '127.0.0.1', () => {
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
            socket.pipe(upstream);
            upstream.pipe(socket);
          });
          upstream.on('error', () => socket.destroy());
          socket.on('error', () => upstream.destroy());
        });
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function startHttpProxy() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      httpProxySeen.push(req.url);
      res.writeHead(200, { 'Content-Type': 'text/plain', 'X-Ipfs-Path': PROBE_PATH });
      res.end('through-http-proxy');
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function setPac(targetSession, script) {
  const pacUrl = `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(
    script,
    'utf-8'
  ).toString('base64')}`;
  await targetSession.setProxy({ mode: 'pac_script', pacScript: pacUrl });
  await targetSession.forceReloadProxyConfig?.();
  await targetSession.closeAllConnections?.();
}

async function textOf(response) {
  return response.body ? await response.text() : '';
}

async function main() {
  const originPort = await startOrigin();
  const socksPort = await startSocks(originPort);
  const httpProxyPort = await startHttpProxy();
  const ses = session.defaultSession;
  const results = {};

  const onionGateway = `http://${ONION_GATEWAY_HOST}:${originPort}`;
  const remoteGateway = `http://${REMOTE_GATEWAY_HOST}:${originPort}`;
  const loopbackGateway = `http://127.0.0.1:${originPort}`;

  // ---- Tor on: the real .onion PAC on the real session --------------------
  await applyOnionProxy(ses, `127.0.0.1:${socksPort}`);
  results.pacScript = buildOnionPacScript(`127.0.0.1:${socksPort}`);
  results.resolveProxy = {
    onionGateway: await ses.resolveProxy(`${onionGateway}${PROBE_PATH}`),
    remoteGateway: await ses.resolveProxy(`${remoteGateway}${PROBE_PATH}`),
    loopbackGateway: await ses.resolveProxy(`${loopbackGateway}${PROBE_PATH}`),
  };

  // A gateway on a .onion host: the request must reach the SOCKS proxy with
  // the onion *name* (remote DNS), which is what makes it work at all.
  socksSeen.length = 0;
  try {
    const response = await gatewayFetch(`${onionGateway}${PROBE_PATH}`, { redirect: 'manual' });
    results.onionGatewayViaTor = {
      status: response.status,
      body: await textOf(response),
      socksSeen: [...socksSeen],
    };
  } catch (err) {
    results.onionGatewayViaTor = { error: String(err && err.message), socksSeen: [...socksSeen] };
  }

  // The transport this replaces: Node's own fetch never sees session.setProxy,
  // so the same URL goes to the system resolver instead of to Tor.
  socksSeen.length = 0;
  try {
    const response = await fetch(`${onionGateway}${PROBE_PATH}`, { redirect: 'manual' });
    results.onionGatewayViaNodeFetch = {
      status: response.status,
      body: await response.text(),
      socksSeen: [...socksSeen],
    };
  } catch (err) {
    results.onionGatewayViaNodeFetch = {
      error: String(err && err.message),
      socksSeen: [...socksSeen],
    };
  }

  // A loopback gateway is unaffected: same PAC, no proxy hop.
  socksSeen.length = 0;
  originSeen.length = 0;
  try {
    const response = await gatewayFetch(`${loopbackGateway}${PROBE_PATH}`, { redirect: 'manual' });
    results.loopbackGatewayUnderTor = {
      status: response.status,
      body: await textOf(response),
      socksSeen: [...socksSeen],
      originSeen: [...originSeen],
    };
  } catch (err) {
    results.loopbackGatewayUnderTor = { error: String(err && err.message) };
  }

  // ---- #351 hardening, over the real Chromium stack, still through Tor ----
  originSeen.length = 0;
  try {
    const response = await gatewayFetch(`${onionGateway}/ipfs/bafydir/docs`, {
      redirect: 'manual',
    });
    results.manualRedirect = {
      status: response.status,
      location: response.headers.get('location'),
      hasBody: !!response.body,
      originRequests: [...originSeen],
    };
  } catch (err) {
    results.manualRedirect = { error: String(err && err.message) };
  }

  try {
    const response = await gatewayFetch(`${onionGateway}/ipfs/bafygz`, { redirect: 'manual' });
    const body = await response.text();
    results.contentEncoding = {
      status: response.status,
      contentEncoding: response.headers.get('content-encoding'),
      contentLength: response.headers.get('content-length'),
      decodedLength: body.length,
      decoded: body.startsWith('zzzz'),
    };
  } catch (err) {
    results.contentEncoding = { error: String(err && err.message) };
  }

  try {
    const controller = new AbortController();
    const response = await gatewayFetch(`${onionGateway}/ipfs/bafystream`, {
      redirect: 'manual',
      signal: controller.signal,
    });
    const reader = response.body.getReader();
    const first = await reader.read();
    controller.abort();
    let abortName = null;
    try {
      await reader.read();
    } catch (err) {
      abortName = err && err.name;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    results.abort = {
      firstChunk: Buffer.from(first.value).toString('utf8'),
      abortName,
      serverSawSocketClose: streamSocketClosed,
    };
  } catch (err) {
    results.abort = { error: String(err && err.message) };
  }

  // ---- A plain HTTP proxy on the session (not Tor) ------------------------
  await setPac(
    ses,
    `function FindProxyForURL(u, h) { return "PROXY 127.0.0.1:${httpProxyPort}"; }`
  );
  httpProxySeen.length = 0;
  try {
    const response = await gatewayFetch(`${remoteGateway}${PROBE_PATH}`, { redirect: 'manual' });
    results.remoteGatewayViaHttpProxy = {
      status: response.status,
      body: await textOf(response),
      proxySeen: [...httpProxySeen],
    };
  } catch (err) {
    results.remoteGatewayViaHttpProxy = { error: String(err && err.message) };
  }

  httpProxySeen.length = 0;
  try {
    const response = await gatewayFetch(`${loopbackGateway}${PROBE_PATH}`, { redirect: 'manual' });
    results.loopbackGatewayViaHttpProxy = {
      status: response.status,
      body: await textOf(response),
      proxySeen: [...httpProxySeen],
    };
  } catch (err) {
    results.loopbackGatewayViaHttpProxy = { error: String(err && err.message) };
  }

  await clearOnionProxy(ses);
  process.stdout.write(`PROBE-RESULT ${JSON.stringify(results)}\n`);
  app.exit(0);
}

app.whenReady().then(() =>
  main().catch((err) => {
    process.stdout.write(`PROBE-FAILED ${err && err.stack}\n`);
    app.exit(1);
  })
);
