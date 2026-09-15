/**
 * Transport for the external IPFS gateway path (`ipfs-manager.js`).
 *
 * WHY THIS EXISTS
 *
 * `serveExternalGatewayRequest` and the gateway probes used Node's global
 * `fetch` (undici). undici has its own socket stack, so it never sees
 * `session.setProxy` — the PAC `src/main/tor-proxy.js` installs on every
 * tracked session. Sibling paths in this repo already dial through Chromium
 * (`ens-prefetch.js`, `favicons.js` use `net.request`), so the same request
 * class took two different routes depending on which file issued it (#355).
 *
 * The PAC's scope is `.onion`-only (see `buildOnionPacScript`): a clearnet
 * gateway resolves DIRECT with Tor on or off, so the everyday remote gateway
 * is a consistency gap rather than a live leak. A gateway *on* a `.onion`
 * host is the case that actually breaks today: undici hands the onion name to
 * the system resolver (a DNS leak of the endpoint the user configured) and the
 * load then fails, because only Tor can resolve it. Routing through Chromium
 * makes the gateway follow whatever proxy policy the session carries — today's
 * onion PAC and anything installed on that session later.
 *
 * WHY `net.request` AND NOT `net.fetch`
 *
 * Measured against Electron 44.3.0 on 2026-09-15 (probe in this PR's
 * description): `net.fetch(url, { redirect: 'manual' })` does not return the
 * 3xx — it rejects with "Redirect was cancelled". The external gateway path
 * *must* surface the 3xx (with its `Location` rewritten into the `ipfs://`
 * URL space, see `rewriteGatewayLocation`), so `net.fetch` cannot carry this
 * path's hardening. `net.request` can: with `redirect: 'manual'` it emits a
 * `redirect` event carrying the status and the response headers, and the
 * request is dropped as soon as we abort it — it is never followed.
 *
 * Same probe, other measurements this file depends on:
 *  - Chromium reports `content-encoding: gzip` plus the *compressed*
 *    `content-length` while handing back an already-decoded body — exactly
 *    like undici, so `DROPPED_UPSTREAM_RESPONSE_HEADERS` in `ipfs-manager.js`
 *    stays load-bearing after the transport change.
 *  - A PAC that proxies everything is bypassed for loopback hosts, so a
 *    loopback gateway is unaffected by any proxy policy either way.
 *  - `net.request` reaches registered custom protocol handlers unless
 *    `bypassCustomProtocolHandlers` is set. The test harness owns `http:` and
 *    `https:` (`test-harness.js`), so without that option a gateway request
 *    would be answered by the harness stub instead of the gateway. undici
 *    never saw those handlers; the option keeps the behaviour identical.
 */

const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

// `localhost` counts as loopback here: it resolves there, and Kubo binds its
// RPC API to loopback by default, so it is the same machine either way.
//
// Literal IPv4 loopback only: every octet must be digits. A `127.` *prefix*
// test would also accept a resolvable DNS name like `127.evil.example`, which
// points wherever its owner wants — and this gate is what keeps the
// unsolicited `:5001` RPC POST on the user's own machine.
function isLoopbackHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '[::1]' || host === '::1' || LOOPBACK_IPV4.test(host);
}

// Fail closed: a URL we cannot parse is not treated as loopback, so it takes
// the proxy-honouring transport rather than the one that ignores the session.
function isLoopbackGatewayUrl(url) {
  try {
    return isLoopbackHostname(new URL(String(url)).hostname);
  } catch {
    return false;
  }
}

// Statuses the fetch spec forbids a body on. Chromium delivers no body for
// them either, and `new Response(body, { status })` throws if one is passed.
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

function abortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted', 'AbortError');
  }
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

// Electron reports a response's headers as `string | string[]` values (the
// `redirect` event uses arrays throughout; `set-cookie` is always an array).
function headersFromNetResponse(rawHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(rawHeaders || {})) {
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      if (entry == null) continue;
      try {
        headers.append(name, String(entry));
      } catch {
        /* A header Chromium accepted but `Headers` rejects is dropped, not fatal. */
      }
    }
  }
  return headers;
}

function defaultNetRequest(options) {
  const { net } = require('electron');
  const request = typeof net?.request === 'function' ? net.request(options) : null;
  // Fail closed rather than falling back to a transport that ignores the
  // session proxy: an unusable `net` must surface as a failed gateway
  // request, never as a silently unproxied one.
  if (typeof request?.on !== 'function') {
    throw new Error('Electron net.request is unavailable');
  }
  return request;
}

/**
 * `fetch`-shaped GET/HEAD over Chromium's network stack, so the request
 * follows the session's proxy configuration.
 *
 * Supports exactly what the external gateway path uses: `method`, `headers`,
 * `signal` and `redirect: 'manual'`. Any other redirect mode is rejected
 * outright — `follow` on this path is the SSRF hole `redirect: 'manual'` was
 * added to close (a gateway answering `302 Location: http://127.0.0.1:1633/…`
 * would have Freedom fetch the user's own loopback services and hand the body
 * back under the `ipfs://` origin), so it must not be reachable by accident.
 *
 * @param {string} url
 * @param {{method?: string, headers?: Headers, signal?: AbortSignal, redirect?: string}} init
 * @param {{requestImpl?: Function}} deps - test seam for `net.request`
 * @returns {Promise<Response>}
 */
async function netGatewayFetch(url, init = {}, deps = {}) {
  const { method = 'GET', headers, signal, redirect = 'manual' } = init;
  if (redirect !== 'manual') {
    throw new Error(`gateway transport supports redirect: 'manual' only (got '${redirect}')`);
  }
  if (signal?.aborted) throw abortError();
  const requestImpl = deps.requestImpl || defaultNetRequest;

  return new Promise((resolve, reject) => {
    let settled = false;
    let bodyController = null;
    let onAbort = null;

    const request = requestImpl({
      method,
      url,
      redirect: 'manual',
      // Nothing from the session but its proxy policy: no cookies and no
      // stored credentials travel to a third-party gateway, matching what
      // undici sent (nothing) on this path.
      credentials: 'omit',
      useSessionCookies: false,
      // Straight to the network — never back into a registered `http(s)`
      // protocol handler (the test harness registers one).
      bypassCustomProtocolHandlers: true,
    });

    const detach = () => {
      if (onAbort && signal) signal.removeEventListener('abort', onAbort);
      onAbort = null;
    };
    const abortRequest = () => {
      try {
        request.abort();
      } catch {
        /* already finished */
      }
    };
    const fail = (err) => {
      detach();
      if (!settled) {
        settled = true;
        reject(err);
        return;
      }
      // The response was already handed back: surface the failure on its body
      // stream so the caller's reader (and its byte counter) unwinds.
      try {
        bodyController?.error(err);
      } catch {
        /* stream already closed or errored */
      }
    };
    const succeed = (response) => {
      settled = true;
      resolve(response);
    };

    if (signal) {
      onAbort = () => {
        abortRequest();
        fail(abortError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    // `redirect: 'manual'`: the hop is reported, never taken. Aborting here is
    // what stops Chromium from following it (an unanswered `redirect` event
    // leaves the request hanging), and the 3xx goes back to the caller with
    // its headers so `Location` can be rewritten into the `ipfs://` space.
    request.on('redirect', (status, _method, _redirectUrl, responseHeaders) => {
      abortRequest();
      detach();
      if (settled) return;
      succeed(new Response(null, { status, headers: headersFromNetResponse(responseHeaders) }));
    });

    request.on('response', (response) => {
      if (settled) {
        response.destroy?.();
        return;
      }
      const status = response.statusCode;
      const statusText = response.statusMessage || '';
      const responseHeaders = headersFromNetResponse(response.headers);

      if (method === 'HEAD' || NULL_BODY_STATUSES.has(status)) {
        response.resume?.();
        detach();
        succeed(new Response(null, { status, statusText, headers: responseHeaders }));
        return;
      }

      const body = new ReadableStream({
        start(controller) {
          bodyController = controller;
          response.on('data', (chunk) => {
            try {
              controller.enqueue(chunk);
            } catch {
              return; // cancelled/errored downstream
            }
            // Backpressure: stop pulling from the socket until the consumer
            // asks for more, so a fast gateway can't outrun a slow page.
            if (controller.desiredSize !== null && controller.desiredSize <= 0) {
              response.pause?.();
            }
          });
          response.on('end', () => {
            detach();
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          });
          response.on('aborted', () => fail(abortError()));
          response.on('error', (err) => fail(err));
        },
        pull() {
          response.resume?.();
        },
        cancel() {
          detach();
          abortRequest();
        },
      });

      succeed(new Response(body, { status, statusText, headers: responseHeaders }));
    });

    request.on('error', (err) => fail(err));

    try {
      // `Headers` on this path, but a plain object must not silently send
      // nothing if a future caller passes one.
      const entries =
        typeof headers?.entries === 'function' ? headers.entries() : Object.entries(headers || {});
      for (const [name, value] of entries) {
        request.setHeader(name, value);
      }
      request.end();
    } catch (err) {
      fail(err);
    }
  });
}

/**
 * Dial an external IPFS gateway URL.
 *
 * Loopback gateways (the documented Kubo/IPFS Desktop setup) keep Node's
 * `fetch`: Chromium bypasses proxies for loopback anyway, so there is nothing
 * to honour, and the local path stays byte-for-byte what it was. Everything
 * else goes through Chromium, where the session's proxy policy applies.
 *
 * @param {string} url
 * @param {object} init - `fetch` init, restricted to what `netGatewayFetch` supports
 * @param {{nodeFetch?: Function, requestImpl?: Function}} deps - test seam
 * @returns {Promise<Response>}
 */
async function gatewayFetch(url, init = {}, deps = {}) {
  if (isLoopbackGatewayUrl(url)) {
    return (deps.nodeFetch || fetch)(url, init);
  }
  return netGatewayFetch(url, init, deps);
}

module.exports = {
  gatewayFetch,
  netGatewayFetch,
  isLoopbackHostname,
  isLoopbackGatewayUrl,
};
