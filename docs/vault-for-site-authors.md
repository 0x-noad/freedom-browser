# The Freedom Data Vault for Site Authors

`window.vault` gives a site its own encrypted store inside the browser, with
per-field consent. Data is sealed under a key derived from the user's wallet
mnemonic; the browser derives the calling origin from the sender frame, never
from anything the page claims, and that origin is the isolation boundary.

Type definitions ship in [`types/freedom-vault.d.ts`](../types/freedom-vault.d.ts).

## Detecting it

The provider is installed at **document-start**, before any page script runs —
including a deferred `<script type="module">` — so you can read it directly:

```js
if (window.vault?.isVault3r) {
  // the data vault is available
}
```

It also dispatches `vault#initialized` on install, following the EIP-1193
convention, if you would rather not depend on the timing.

Nothing is injected in private windows: `window.vault` is simply absent there.

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

**Dev hosts are keyed by port.** For `*.localhost` hosts only, the port is part
of the namespace: `http://app.localhost:8765` and `:8766` are two partitions,
so two dev servers never share — or race on — one another's data. Real origins
keep the port out, so a production redeploy on a new port keeps its namespace.

### If a partition will not open

Wrong identity and corruption look identical to the cipher. The vault records a
fingerprint of the identity that sealed each store, so the Data tab can tell you
which it was: **sealed under a different identity** (unlock with that mnemonic,
or delete), **corrupt** (unrecoverable — delete so the site can start over), or
**unknown** for stores written before fingerprints existed. A site sees the same
attribution as `error.data.reason` on any `KeyInvalidated` (4311) rejection.

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
long-lived page will still meet a locked vault eventually.

A locked vault rejects data-plane calls with **code `4312`**. Branch on the
code, never the message — the text comes from the engine's `DEFAULT_MESSAGE`
table and is free to change; the code is the contract. The provider preserves
`code` on the rejected `Error`, which is what makes this possible:

```js
try {
  await window.vault.get(sessionId, ['/profile']);
} catch (err) {
  if (err.code !== 4312) throw err;
  const { unlocked, reason } = await window.vault.requestUnlock(sessionId);
  if (unlocked) return retry();
  // reason: 'dismissed' — the user said no this time
  //         'cooldown'  — asked too recently; wait before offering again
  //         'embargoed' — dismissed repeatedly; stop offering until they unlock
}
```

`requestUnlock` raises the browser's own unlock screen — the very same one the
wallet uses for its own signing flows, Touch ID and all — so you never have to
describe where that control lives. The prompt names your site, using the origin
the browser observed on your frame rather than anything your page supplied. It **resolves rather than rejects** when the user declines, so a
refusal is a branch, not an exception.

It is not in your grant and you do not request it: holding a live session is the
authorisation. What it cannot be is a nuisance — concurrent calls from any
number of sites share one prompt, a site that just asked is refused with
`cooldown` for a minute, and three dismissals in a row earn `embargoed` until
the user unlocks by some other means. Offer it from a button the user pressed;
do not call it on a timer.
