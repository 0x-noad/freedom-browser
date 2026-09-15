const {
  FakeClientRequest,
  FakeIncomingMessage,
} = require('../../../test/helpers/fake-electron-net');

const {
  gatewayFetch,
  netGatewayFetch,
  isLoopbackHostname,
  isLoopbackGatewayUrl,
} = require('./gateway-transport');

function startNetFetch(url, init = {}) {
  let request = null;
  const requestImpl = jest.fn((options) => {
    request = new FakeClientRequest(options);
    return request;
  });
  const promise = netGatewayFetch(url, init, { requestImpl });
  // The request is built synchronously inside the promise executor.
  return { promise, requestImpl, request };
}

async function readAll(response) {
  const reader = response.body.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

const REMOTE = 'http://gateway.example:8080/ipfs/bafkqaaa';

describe('isLoopbackHostname / isLoopbackGatewayUrl', () => {
  test.each([
    ['127.0.0.1', true],
    ['127.1.2.3', true],
    ['localhost', true],
    ['LOCALHOST', true],
    ['::1', true],
    ['[::1]', true],
    // A `127.` prefix test would accept these; they resolve wherever their
    // owner points them, so they are remote and must be proxied like any
    // other remote host.
    ['127.evil.example', false],
    ['127.0.0.1.evil.example', false],
    ['127x0x0x1', false],
    ['gateway.example', false],
    ['1.2.3.4', false],
    ['abc.onion', false],
    ['', false],
  ])('isLoopbackHostname(%s) === %s', (hostname, expected) => {
    expect(isLoopbackHostname(hostname)).toBe(expected);
  });

  test('a URL that cannot be parsed is not treated as loopback (fail closed)', () => {
    expect(isLoopbackGatewayUrl('not a url')).toBe(false);
    expect(isLoopbackGatewayUrl(null)).toBe(false);
    expect(isLoopbackGatewayUrl('http://127.0.0.1:8080/ipfs/bafkqaaa')).toBe(true);
  });
});

describe('gatewayFetch transport selection', () => {
  // #355: a remote gateway must go through Chromium so the session's proxy
  // policy (the `.onion` PAC tor-proxy.js installs) applies. Node's fetch has
  // its own socket stack and never sees `session.setProxy`.
  test.each([
    'http://gateway.example:8080/ipfs/bafkqaaa',
    'https://ipfs.io/ipfs/bafkqaaa',
    'http://abcdefgh.onion:8080/ipfs/bafkqaaa',
    'http://192.168.1.9:8080/ipfs/bafkqaaa',
    'http://127.evil.example:8080/ipfs/bafkqaaa',
  ])('a remote gateway (%s) is dialled through Electron net', async (url) => {
    const nodeFetch = jest.fn();
    const requestImpl = jest.fn((options) => {
      const request = new FakeClientRequest(options);
      setImmediate(() => request.emit('response', new FakeIncomingMessage({ statusCode: 204 })));
      return request;
    });

    const response = await gatewayFetch(url, { redirect: 'manual' }, { nodeFetch, requestImpl });

    expect(response.status).toBe(204);
    expect(requestImpl).toHaveBeenCalledTimes(1);
    expect(requestImpl.mock.calls[0][0].url).toBe(url);
    expect(nodeFetch).not.toHaveBeenCalled();
  });

  // The documented Kubo/IPFS Desktop setup. Chromium bypasses proxies for
  // loopback anyway (measured), so nothing is gained by moving it — and the
  // local path stays exactly what it was before this change.
  test.each([
    'http://127.0.0.1:8080/ipfs/bafkqaaa',
    'http://localhost:8080/ipfs/bafkqaaa',
    'http://127.1.2.3:8080/ipfs/bafkqaaa',
    'http://[::1]:8080/ipfs/bafkqaaa',
  ])('a loopback gateway (%s) keeps Node fetch', async (url) => {
    const nodeFetch = jest.fn(async () => new Response('local', { status: 200 }));
    const requestImpl = jest.fn();

    const response = await gatewayFetch(url, { redirect: 'manual' }, { nodeFetch, requestImpl });

    expect(await response.text()).toBe('local');
    expect(nodeFetch).toHaveBeenCalledWith(url, { redirect: 'manual' });
    expect(requestImpl).not.toHaveBeenCalled();
  });
});

describe('netGatewayFetch', () => {
  test('dials with the options that keep the request identical to the undici one', () => {
    const headers = new Headers({ range: 'bytes=0-10', accept: 'text/html' });
    const { requestImpl, request } = startNetFetch(REMOTE, { method: 'GET', headers });

    expect(requestImpl.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      url: REMOTE,
      // Never followed — see the SSRF note in serveExternalGatewayRequest.
      redirect: 'manual',
      // Nothing of the session travels to a third-party gateway but its proxy
      // policy: no cookies, no stored credentials.
      credentials: 'omit',
      useSessionCookies: false,
      // Straight to the network, never into a registered http(s) protocol
      // handler (the e2e harness registers one).
      bypassCustomProtocolHandlers: true,
    });
    expect(request.sentHeaders).toEqual({ accept: 'text/html', range: 'bytes=0-10' });
    expect(request.ended).toBe(true);
  });

  test('refuses any redirect mode but manual', async () => {
    await expect(netGatewayFetch(REMOTE, { redirect: 'follow' })).rejects.toThrow(
      /redirect: 'manual' only/
    );
    await expect(netGatewayFetch(REMOTE, { redirect: 'error' })).rejects.toThrow(
      /redirect: 'manual' only/
    );
  });

  test('surfaces a 3xx with its Location instead of following it', async () => {
    const { promise, request } = startNetFetch(REMOTE, { redirect: 'manual' });
    request.emit('redirect', 301, 'GET', 'http://gateway.example:8080/ipfs/bafkqaaa/', {
      location: ['/ipfs/bafkqaaa/'],
      'x-ipfs-path': ['/ipfs/bafkqaaa'],
      'content-length': ['0'],
    });

    const response = await promise;

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('/ipfs/bafkqaaa/');
    expect(response.headers.get('x-ipfs-path')).toBe('/ipfs/bafkqaaa');
    expect(response.body).toBeNull();
    // Aborting the request is what stops Chromium from taking the hop.
    expect(request.aborted).toBe(true);
  });

  test('streams a body and reports the headers the proxy hop has to strip', async () => {
    const { promise, request } = startNetFetch(REMOTE);
    const upstream = new FakeIncomingMessage({
      statusCode: 200,
      statusMessage: 'OK',
      headers: {
        // Chromium hands back a *decoded* body while still reporting the
        // upstream encoding and its compressed length — exactly like undici,
        // which is why DROPPED_UPSTREAM_RESPONSE_HEADERS is still needed.
        'content-encoding': 'gzip',
        'content-length': '41',
        'content-type': 'text/plain',
        'set-cookie': ['a=1', 'b=2'],
      },
    });
    request.emit('response', upstream);
    const response = await promise;

    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');
    expect(response.headers.get('content-encoding')).toBe('gzip');
    expect(response.headers.get('content-length')).toBe('41');
    expect(response.headers.get('set-cookie')).toContain('a=1');
    expect(response.headers.get('set-cookie')).toContain('b=2');

    const read = readAll(response);
    upstream.emit('data', Buffer.from('hello '));
    upstream.emit('data', Buffer.from('world'));
    upstream.emit('end');
    expect((await read).toString()).toBe('hello world');
  });

  test.each([
    ['a 204', { statusCode: 204, statusMessage: 'No Content' }, 'GET'],
    ['a 304', { statusCode: 304, statusMessage: 'Not Modified' }, 'GET'],
    ['a HEAD', { statusCode: 200, statusMessage: 'OK' }, 'HEAD'],
  ])('%s response carries no body', async (_label, resInit, method) => {
    const { promise, request } = startNetFetch(REMOTE, { method });
    const upstream = new FakeIncomingMessage({ ...resInit, headers: { 'x-ipfs-path': '/ipfs/x' } });
    request.emit('response', upstream);

    const response = await promise;

    expect(response.status).toBe(resInit.statusCode);
    expect(response.body).toBeNull();
    expect(response.headers.get('x-ipfs-path')).toBe('/ipfs/x');
  });

  test('rejects with an AbortError when the signal fires before the response', async () => {
    const controller = new AbortController();
    const { promise, request } = startNetFetch(REMOTE, { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(request.aborted).toBe(true);
  });

  test('an already-aborted signal never opens a connection', async () => {
    const controller = new AbortController();
    controller.abort();
    const requestImpl = jest.fn();

    await expect(
      netGatewayFetch(REMOTE, { signal: controller.signal }, { requestImpl })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestImpl).not.toHaveBeenCalled();
  });

  test('aborting mid-stream tears down the request and errors the body', async () => {
    const controller = new AbortController();
    const { promise, request } = startNetFetch(REMOTE, { signal: controller.signal });
    const upstream = new FakeIncomingMessage({});
    request.emit('response', upstream);
    const response = await promise;

    const reader = response.body.getReader();
    upstream.emit('data', Buffer.from('partial'));
    expect(Buffer.from((await reader.read()).value).toString()).toBe('partial');

    controller.abort();

    await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' });
    expect(request.aborted).toBe(true);
  });

  test('cancelling the body stream aborts the upstream request', async () => {
    const { promise, request } = startNetFetch(REMOTE);
    const upstream = new FakeIncomingMessage({});
    request.emit('response', upstream);
    const response = await promise;

    await response.body.cancel();

    expect(request.aborted).toBe(true);
  });

  test('a connection failure rejects with the network error', async () => {
    const { promise, request } = startNetFetch(REMOTE);
    request.emit('error', new Error('net::ERR_CONNECTION_REFUSED'));

    await expect(promise).rejects.toThrow('net::ERR_CONNECTION_REFUSED');
  });

  test('a stream that dies mid-body errors the reader', async () => {
    const { promise, request } = startNetFetch(REMOTE);
    const upstream = new FakeIncomingMessage({});
    request.emit('response', upstream);
    const response = await promise;
    const reader = response.body.getReader();
    upstream.emit('data', Buffer.from('half'));
    await reader.read();

    upstream.emit('error', new Error('net::ERR_CONNECTION_RESET'));

    await expect(reader.read()).rejects.toThrow('net::ERR_CONNECTION_RESET');
  });

  test('applies backpressure instead of buffering the whole gateway response', async () => {
    const { promise, request } = startNetFetch(REMOTE);
    const upstream = new FakeIncomingMessage({});
    request.emit('response', upstream);
    const response = await promise;

    // Nobody has read yet: one chunk fills the default queue.
    upstream.emit('data', Buffer.alloc(64 * 1024));
    expect(upstream.paused).toBe(true);

    const reader = response.body.getReader();
    await reader.read();
    await new Promise((resolve) => setImmediate(resolve));
    expect(upstream.paused).toBe(false);
  });

  // Fail closed: with no usable `net`, the request must fail rather than fall
  // back to a transport that ignores the session proxy.
  test('fails when Electron net is unavailable rather than dialling around it', async () => {
    await expect(netGatewayFetch(REMOTE)).rejects.toThrow('Electron net.request is unavailable');
  });
});
