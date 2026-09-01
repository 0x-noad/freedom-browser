# Building a Site for Freedom Browser

Everything a page needs to know about the four providers Freedom injects:
`window.ethereum`, `window.swarm`, `window.vault` and `window.ens`. A real dapp
uses more than one, so they are documented together.

Type definitions for all four ship in [`types/freedom-providers.d.ts`](../types/freedom-providers.d.ts).

- [Detecting the browser](#detecting-the-browser)
- [Origins, schemes and local development](#origins-schemes-and-local-development)
- [`window.ethereum` — wallet](#windowethereum--wallet)
- [`window.swarm` — publishing and reading Swarm](#windowswarm--publishing-and-reading-swarm)
- [`window.vault` — per-site encrypted storage](#windowvault--per-site-encrypted-storage)
- [`window.ens` — name resolution](#windowens--name-resolution)

## Detecting the browser

All four providers are installed at **document-start**, before any page script
runs — including a deferred `<script type="module">`. A page that boots on
`DOMContentLoaded` or later can read them directly:

```js
if (window.swarm?.isFreedomBrowser) {
  // running in Freedom
}
```

If your code runs earlier than that, or you would rather not depend on the
timing at all, wait for the readiness event. `freedom#initialized` fires once
all four providers exist; each provider also dispatches its own
(`ethereum#initialized`, `swarm#initialized`, `vault#initialized`,
`ens#initialized`), following the EIP-1193 convention.

```js
function whenReady() {
  if (window.ens) return Promise.resolve();
  return new Promise((resolve) =>
    window.addEventListener('freedom#initialized', resolve, { once: true })
  );
}
```

Do not poll, and do not attach your own `DOMContentLoaded` listener and assume
the providers are there — listener ordering is not something you control.

## Origins, schemes and local development

`bzz://`, `ipfs://` and `ipns://` are registered as **standard, secure,
fetch-enabled, CORS-enabled** schemes with streaming and service-worker support.
Two consequences worth relying on:

- **Cross-scheme reads work.** A page served from `http://localhost:8765` can
  `fetch('bzz://meinhard.eth/')` successfully. You do not need a gateway
  fallback for development.
- **Your dev loop represents production.** In production the app is served from
  `bzz://` and the same read is same-origin; nothing about the fetch changes.

Origins are compared **including scheme and port**. `https://site.example` and
`bzz://site.example` are different origins to every provider here, and moving a
dev server from `:8765` to `:8766` silently drops the grants held by `:8765`.

## `window.ethereum` — wallet

A standard EIP-1193 provider, announced over EIP-6963 (`eip6963:announceProvider`),
so wagmi, Web3Modal and RainbowKit discover it without any Freedom-specific code.
`isMetaMask` is also set for older dapps that sniff for it.

```js
const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
```

Events: `connect`, `disconnect`, `chainChanged`, `accountsChanged`, `message`.

## `window.swarm` — publishing and reading Swarm

### Reads need nothing; publishing needs a grant

`getCapabilities`, `readFeedEntry`, `listFeeds`, `readChunk`,
`readSingleOwnerChunk`, `isRetrievable` and `getBatch` all work with no
permission at all, under a per-origin rate budget. So a site can read a feed,
fetch manifests and render its whole UI before discovering it was never
connected.

Publishing requires a grant, and `swarm.requestAccess()` is how you get one.
**It is user-facing**: it raises the browser's connect sheet and resolves when
the user approves. It reads like a passive query next to `getCapabilities`; it
is not.

### `canPublish` is the readiness check

`requestAccess()` resolving does **not** mean a publish will work — with no
Swarm node running at all, both `getCapabilities()` and `requestAccess()` still
resolve. The only readiness signal is `canPublish` inside the capabilities
payload:

```js
const caps = await window.swarm.getCapabilities();
if (!caps.canPublish) {
  showBanner(caps.reasonMessage, { setupAvailable: caps.setupAvailable });
  return;
}
```

| `reason`           | What it means                      | What clears it                            |
| ------------------ | ---------------------------------- | ----------------------------------------- |
| `not-connected`    | This origin holds no publish grant | Call `swarm.requestAccess()`              |
| `node-stopped`     | No Swarm node is running           | Start it from the browser's node controls |
| `node-not-ready`   | The node is starting up            | Wait and re-check                         |
| `ultra-light-mode` | The node cannot see the chain      | Run the wallet's **publish setup** flow   |
| `no-usable-stamps` | No postage batch with capacity     | Buy storage in the wallet's publish setup |

`reasonMessage` carries the same guidance as prose you can show directly, and
`setupAvailable` is true when the browser has a flow that fixes it — render your
own call to action off that.

A note on `ultra-light-mode`, because it is the one that costs people a day:
Freedom starts its node in ultra-light mode by default, so `swap-enable` is
false and no chequebook can be deployed. The wallet's publish setup flow
switches the node to light mode, funds it and buys storage as part of
onboarding. Funding the node wallet by hand — which the node's own startup
warning suggests — produces a byte-identical config and still cannot publish.

### Publishing

```js
const { reference, bzzUrl, batchId, bytesSize } = await window.swarm.publishData({
  data: JSON.stringify(listing),
  contentType: 'application/json',
  name: 'listing.json',
});
```

**There is no `success` field, and there never was.** Failures reject. Freedom's
own internal channel (`swarm:publish-data`, used by the browser's renderer)
returns `{ success: true, … }` for the same operation, and it is the easier of
the two to find by grepping for the method name. Checking `res.success` on a
site-facing result yields `undefined` on every _successful_ upload, so the happy
path looks exactly like the sad path with no error text to contradict it.

`batchId` names the postage batch that paid for the upload. It is on-chain state
on Gnosis, so anyone — you included — can read its remaining balance and depth
and work out how long the content stays paid for. See `getBatch` below.

`publishFiles` takes a manifest and returns a `tagUid` you can poll with
`getUploadStatus({ tagUid })`:

```js
const result = await window.swarm.publishFiles({
  files: [{ path: 'index.html', bytes, contentType: 'text/html' }],
  indexDocument: 'index.html',
});
```

### Limits

Read them at runtime from `caps.limits`; the current values are:

| Limit                  | Value                            |
| ---------------------- | -------------------------------- |
| `maxDataBytes`         | 10 MB per `publishData`          |
| `maxFilesBytes`        | 50 MB total per `publishFiles`   |
| `maxFileCount`         | 100 files per `publishFiles`     |
| `maxPathBytes`         | 100 UTF-8 bytes per virtual path |
| `maxChunkPayloadBytes` | 4096 per chunk                   |

### Checking that content is still there

```js
const { isRetrievable } = await window.swarm.isRetrievable({ reference });
const batch = await window.swarm.getBatch({ batchId }); // null if unknown
// batch: { depth, bucketDepth, batchTTL, utilization, usable, immutable, owned }
```

Both are reads of public network state and need no grant. `isRetrievable` wraps
the node's stewardship endpoint, so you can distinguish "expired" from "my node
is having a bad day" instead of attempting a fetch and inferring. `getBatch`
answers for any batch ID, not just the node's own — `utilization` and `usable`
are null for a batch this node does not hold.

Together they let a marketplace show "storage paid until _date_" as a claim the
other party can verify, rather than a self-report.

## `window.vault` — per-site encrypted storage

The vault gives each origin its own encrypted partition, with per-field consent.
Data is sealed under a key derived from the user's mnemonic; the browser derives
the calling origin from the sender frame, never from anything the page says.

### Publish under a stable name, or lose user data

**This is the single most consequential fact about building on the vault.** The
namespace is derived from your origin: `bzz://<host>` maps to
`web:dweb:bzz:<host>`. For an app published at a **raw content reference**, the
reference changes on every redeploy — so the namespace changes, so every
returning user silently gets an empty vault and their profile is stranded in a
partition nothing can reach. There is no error and no prompt; a returning user
simply gets a first-run experience.

Publish under a stable name — an ENS name with a contenthash record you update —
and the namespace survives every release. `ens://name.eth` and `bzz://name.eth`
share one namespace by design, so moving between them is safe; moving between
content references is not.

### Connecting

```js
const session = await window.vault.connect({
  requestedScopes: [
    {
      methods: ['vault_getData', 'vault_setData', 'vault_subscribe'],
      fields: [
        { path: 'profile.displayName', read: true, write: true },
        { path: 'profile.watchlist', read: true, write: true },
      ],
    },
  ],
  appMetadata: { name: 'DKey', icon: 'data:image/png;base64,…' },
});
// { sessionId, grant, namespace }
```

The consent sheet appears on first connect and lets the user approve read and
write per field. A remembered grant reconnects silently; asking for more than
was granted prompts again.

`vault_getPermissions` is granted whether or not you ask for it, so
`vault.getPermissions(sessionId)` always works on a live session.

`appMetadata.icon` must be a `data:` URI — PNG, JPEG or WebP only (SVG is
rejected, since the launcher page renders it), the declared MIME must match the
actual magic bytes, at most 64 KB decoded, 8–512 px. Anything else falls back to
a monogram derived from your namespace. Icons ride in-band precisely so that
rendering the launcher never touches the network.

### Reading and writing

```js
const { values, version } = await window.vault.get(session.sessionId, ['profile.displayName']);
await window.vault.set(session.sessionId, { 'profile.displayName': 'ada' }, version);
```

At most 64 paths per call. `version` is an ETag: pass the one you read back as
`baseVersion` to get optimistic concurrency, or omit it to overwrite.

`subscribe(sessionId, paths)` pushes updates through the `change` event;
`permissionsRevoked` fires when the user revokes your grant from the Data tab.

### Locking

The vault auto-locks after 15 minutes idle. Vault reads and writes count as
activity and push the timer out, so an actively used session stays open. A
locked vault rejects data-plane calls — surface that as a re-unlock prompt, not
as an error.

## `window.ens` — name resolution

Freedom resolves ENS (`.eth`), WNS (`.wei`) and GNS (`.gwei`) through a
quorum-checked provider pool with caching. Use it instead of shipping your own
resolver against a public RPC:

```js
const { name, system, verified } = await window.ens.reverse(address);
const owners = await window.ens.reverseMany(addresses); // ≤ 50 per call
const { address } = await window.ens.resolve('alice.eth');
```

All three are reads of public chain state: no prompt, no grant, and results come
from the same cache the address bar uses, so a feed of twenty cards costs at
most twenty cache reads. Use `reverseMany` for feeds.

`verified` is true only when the lookup met the browser's resolver quorum. A
name that resolved without verifying still comes back with `verified: false` and
a `reason`, so you can render it differently rather than dropping it.

All three name systems resolve on **mainnet**, whatever chain your dapp itself
uses.
