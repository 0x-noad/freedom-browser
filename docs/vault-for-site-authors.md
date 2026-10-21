# The Freedom Data Vault for Site Authors

`window.vault` gives a site its own encrypted store inside the browser. You
declare the JSON Pointer paths you want and whether you need to write them; the
user approves the partition, not the paths. Data is sealed under a key derived
from the user's wallet mnemonic; the browser derives the calling origin from the sender frame, never
from anything the page claims, and that origin is the isolation boundary.

The one way across that boundary is deliberate and narrow: a site may publish
under the reserved `/shared` subtree, and another site may be granted read-only
access to it. See [Publishing under `/shared`](#publishing-under-shared) and
[Reading another site's shared data](#reading-another-sites-shared-data).

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
convention — but on the normal path that happens *before* your first script
runs, so a listener your page adds can never catch it. Check `window.vault`
first; add the listener only as a fallback, for the case where the early
injection failed and a late one is still to come.

Nothing is injected in private windows: `window.vault` is simply absent there.

## Origins, schemes and local development

`bzz://`, `ipfs://` and `ipns://` are registered as **standard, secure,
fetch-enabled, CORS-enabled** schemes with streaming and service-worker support.
Two consequences worth relying on:

- **Cross-scheme reads work.** A page served from `http://app.localhost:8765`
  can `fetch('bzz://meinhard.eth/')` successfully. You do not need a gateway
  fallback for development.
- **Your dev loop represents production.** In production the app is served from
  `bzz://` and the same read is same-origin; nothing about the fetch changes.

That is about *fetching*. Which partition you get is the next section.

### What your partition is keyed by

**Your partition is keyed by your origin.** Scheme, host and port, verbatim:

```
https://site.example         ->  web:https://site.example
http://app.localhost:8765    ->  web:http://app.localhost:8765
bzz://name.eth               ->  web:bzz://name.eth
```

That is the same boundary the browser already enforces for `localStorage`,
IndexedDB, cookies and service workers, so there is nothing vault-specific to
learn. Two different origins are two partitions; the same origin is the same
partition. There is no suffix list, no granularity setting and no per-scheme
exception.

Four consequences, because each one catches somebody:

- **`http://` and `https://` are different partitions.** An `http` origin is
  network-attackable and is not the same principal as its `https` twin — which
  is why every other storage API splits them too.
- **A subdomain is a different site.** `site.example` and `app.site.example` do
  not share, so a staging host cannot read or overwrite production's data. If
  you *want* to share across your own subdomains, that is what `/shared` plus
  consent is for.
- **A port is part of an origin.** Two dev servers on one hostname never share
  or race on a partition. The flip side is that restarting your dev server on a
  different port gives you an empty vault, with yesterday's data in a partition
  only the old port can reach. (A scheme's default port is not a port:
  `https://site.example` and `:443` agree.)
- **For dweb, the transport is part of your identity.** Freedom serves a `.eth`
  name under whatever its contenthash resolves to, so one name can be
  `bzz://name.eth` or `ipfs://name.eth` — and those are two partitions.
  **Changing your contenthash from a Swarm reference to an IPFS one strands
  every user's data**, as surely as changing the name would. Keep the name *and*
  the transport stable.

  This one is a deliberate choice, and it deliberately differs from the rest of
  the browser: site *permissions* key a name host on the bare name, so a
  permission survives a transport change. A partition does not, because the
  blast radius is different. A name can be reached through several resolution
  paths, and the suffixes Freedom treats as names — `.eth`, `.box`, `.wei`,
  `.gwei`, `.tez` — are governed by different registries with different owners
  and different failure modes. Key on the bare name and every one of those
  paths opens the same partition, so a hijacked IPNS key or a contenthash set
  through a compromised controller reaches data that was written over a path
  nobody compromised. Keeping the scheme means a bad resolution path only ever
  reaches what was written through that same path. The cost is this bullet; the
  sanctioned way to carry data forward is `/shared` plus the user's consent.

And one that is not about two origins at all: **a raw content reference is
not a stable identity.** If your app is published at a content address, that
address changes on every redeploy, so your origin changes, so every returning
user silently gets an empty vault with their old profile in a partition nothing
can reach. No error, no prompt — just a first-run experience for a returning
user. An ENS name whose contenthash record you update survives every release.

**Accepted schemes** are `http(s)` and the dweb set: `bzz`, `ipfs`, `ipns`,
`hyper`, `ens`, `rad`, `swarm`, `ar`. `localhost` and IP literals are fine —
`http://localhost:9999` and `http://127.0.0.1:9999` are perfectly good origins.
The provider is injected on any page that is neither internal nor in a private
window, so `window.vault` exists on a `web3://` page, but `connect()` there
rejects with *unsupported origin scheme*. A URL carrying userinfo, a path, a
query or a fragment is rejected rather than trimmed, so two display URLs for
one site can never be steered to different partitions.

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
        { path: '/profile/displayName', read: true, write: true },
        { path: '/profile/watchlist', read: true, write: true },
      ],
    },
  ],
  appMetadata: { name: 'DKey', icon: 'data:image/png;base64,…' },
});
// { sessionId, grant, namespace }
```

Paths are JSON Pointers — `/profile/displayName`, not `profile.displayName`. A
rule path that is neither empty nor `/`-prefixed is rejected, so a dotted path
matches nothing.

**A rule is a prefix rule, and it cuts one way only.** A granted rule on
`/save` covers `/save`, `/save/state` and everything below. A granted rule on
`/save/state` does *not* let you `get(['/save'])` — that rejects with `4305`
(`FieldOutOfScope`). Declare the root of the subtree you intend to own, not the
leaves you happen to write first.

`sensitive: true` on a field rule is accepted, persisted — and inert here. The
engine supports it as a per-read confirmation, but Freedom runs the one-unlock
model, where a single unlock covers routine access, so setting it changes
nothing and `4310` never fires. Do not build a flow that depends on it.

The consent sheet appears on first connect. It opens in the wallet sidebar's
**Data** tab and is modal there — it covers the tab bar, so the sheet can be
answered but not navigated away from. It approves **per partition, not per
field**: one row naming your site, exactly as the Data pane lists it, and — when
you asked to read another site — one row per owner partition with a `read`
checkbox. A field path is your own schema and means little to the person
approving it; which partitions are being opened is the decision.

So there is nothing on the sheet that narrows your own field list: it is
approved as asked, or rejected. The one thing the user can narrow is the set of
other partitions you may read, by unticking an owner. Read `session.grant` back
rather than assuming you got what you asked for.

A remembered grant reconnects silently. Asking for more prompts again — and
"more" is judged by **exact path equality**, not by the prefix rule above: a
remembered grant on `/save` does not cover a later connect asking for
`/save/state`, even though that same grant would happily *read* it. So send the
same field list every time. Changing your declared schema is a user-visible
event: the next visit raises the sheet again.

A write at or below `/shared` also raises a note on the sheet, in so many words:
that what you store there is something other sites can ask to read. See
[Publishing under `/shared`](#publishing-under-shared).

`appMetadata.name` is **not** shown on the consent sheet. The sheet names the
origin the browser observed on your frame and nothing else, deliberately: a
page-supplied name sitting above that origin would be the spoofable half. Your
name reaches the `freedom://dapps` launcher tile and the monogram fallback.

`vault_getPermissions` is granted whether or not you ask for it, so
`vault.getPermissions(sessionId)` always works on a live session.

`appMetadata.icon` must be a `data:` URI — PNG, JPEG or WebP only (SVG is
rejected, since the launcher page renders it), the declared MIME must match the
actual magic bytes, at most 16 KiB decoded, 8–512 px. Bytes above the cap are
rejected, not downscaled. It is re-encoded — which is what strips EXIF, ICC and
animation — and downscaled to at most 128×128, never upscaled, so **128×128 is
the size to send**: anything smaller is kept at its own size and will look soft
on the launcher's 56 px tile, and anything larger is thrown away. Anything else
falls back to
a monogram derived from your namespace. Icons ride in-band precisely so that
rendering the launcher never touches the network.

### Reading and writing

```js
const { values, version } = await window.vault.get(session.sessionId, ['/profile/displayName']);
await window.vault.set(session.sessionId, { '/profile/displayName': 'ada' }, version);
```

At most 64 paths per call. `version` is an ETag: pass the one you read back as
`baseVersion` to get optimistic concurrency, or omit it to overwrite.

**A path you never wrote reads as `null`, not as an error.** Same as a foreign
read, for a plainer reason: there is nothing there. Only a path outside your
grant errors.

A stale `baseVersion` rejects with **`4321` (`VersionConflict`)**, and the error
carries the version you lost to:

```js
try {
  await window.vault.set(sessionId, { '/notes/draft': text }, version);
} catch (err) {
  if (err.code === 4321) {
    // err.data.version is the current etag — retry against it without re-reading.
    await window.vault.set(sessionId, { '/notes/draft': text }, err.data.version);
  }
}
```

Retrying blind (no `baseVersion`) is also legitimate — it is last-write-wins,
which is the right answer for a value only your own tab writes.

**Saving on the way out.** `set()` resolves only after the write is stored, so
the promise *is* the durability signal — but a page cannot await anything during
`pagehide` or `unload`, because it is already going away. The browser's own
behaviour, if it helps: a request that reaches the main process is applied in
full even when the frame is gone (the reply is what gets lost); a request that
has not been dispatched when the renderer tears down never happens at all. So
save on **`visibilitychange` → `hidden`**, where you can still await, and treat
`pagehide` as a best-effort repeat rather than your only save.

`subscribe(sessionId, paths)` returns `{ subscriptionId }` and pushes updates
through the `change` event. The payload is
`{ subscriptionId, changes, version }`, where `changes` maps each changed
pointer to its new value — `null` for one that was removed — and carries only
pointers you both subscribed to and may read. It fans out to **every live
session on your partition, your own other tabs included**, which is the usual
way a second tab learns the first one wrote.

`permissionsChanged` fires whenever the user moves your grant from the Data tab
— revoked, narrowed, or a cross-origin read switched back on. Its payload is
`{ sessionId, fields, revokedSubscriptions }`. Your session ends with it in
every case, so treat it as "reconnect and read `session.grant`", never as "you
lost access": one of the things it reports is gaining some.

**Sessions are per page load and live only in memory.** A reload gets a new one,
through a silent reconnect if the remembered grant still covers what you ask
for. Two tabs of your site are two sessions writing one document, which is
where `4321` comes from in practice. If the browser's main process restarts
while your page lives on, the old `sessionId` starts rejecting with `4900`
(`Disconnected`) — reconnect rather than reading it as a lost grant.

`disconnect(sessionId)` ends **the session and nothing else.** The remembered
grant survives it, so your next `connect()` reconnects silently. It is not a
revocation; a site cannot revoke its own grant, because that control belongs to
the user in the Data pane.

**Limits, and what they cost you.** Your whole partition is capped at **16 MiB**
on the UTF-8 serialization of its document, and a write that would cross that
rejects with `QuotaExceeded` rather than truncating. Within that: 64 paths per
read or subscribe, 128 changes per `set` or `patch`, pointers up to 512 UTF-8
bytes, and 32 levels of nesting counted from the document root (your pointer's
own depth counts toward it). **There is no per-value cap** — one 10 MB string
is as acceptable as a thousand small ones, as long as the document fits.

Every write is a whole-document read-modify-write — load, decrypt, parse,
mutate, serialize, encrypt, save — so **the cost of a write tracks what the
partition holds, not what you changed.** Measured on a 2023 laptop, through the
real store:

| What | Time |
| --- | --- |
| Writing 0.9 MB (a 0.7 MB value plus a 170 KB one) | ~13 ms |
| Writing **one small field** with that 0.9 MB already stored | ~12 ms |
| Reading both large values back | ~5 ms |
| Writing one 8 MB value | ~70 ms |
| Writing **one small field** with 8 MB already stored | ~110 ms |

So a megabyte-scale partition is comfortable, and an 8 MB one makes every
keystroke-sized write a tenth of a second. Nothing throttles you. Keep the hot,
frequently-written values in their own shallow pointers, and if you store
something big, expect to pay for it on every unrelated write — or keep it in a
separate partition's worth of thinking: there is one document per origin, and no
way to split it.

**Binary data goes in as base64.** Values are JSON, so there is no `Uint8Array`
or `ArrayBuffer` type; a blob costs 33 % more than its bytes, and that inflated
size is what every subsequent write re-serializes.

### Errors

Every rejection carries a numeric `code` on the `Error`. **Branch on the code,
never the message** — the text comes from the engine's `DEFAULT_MESSAGE` table
or from a host-supplied reason, and both are free to change.

| Code | Name | When, and what to do |
| --- | --- | --- |
| `4001` | `UserRejected` | `connect()` was refused. All four refusals share this code — see below. |
| `4010` | `InvalidRequest` | Malformed params: a dotted path, a bad pointer, a non-`data:` icon. Your bug, not a user decision. |
| `4100` | `Unauthorized` | The method is not in your grant. `vault_getSharedData` is the one you must ask for. |
| `4305` | `FieldOutOfScope` | A path outside your rules — including a path *above* a granted rule. Fix your field list. |
| `4306` | `WriteForbidden` | A write to a rule you hold only `read` on. |
| `4310` | `BiometricFailed` | Cannot currently happen in Freedom; see `sensitive` above. |
| `4311` | `KeyInvalidated` | The partition will not open. `error.data.reason` attributes it — see [If a partition will not open](#if-a-partition-will-not-open). |
| `4312` | `VaultLocked` | Auto-locked. Offer `requestUnlock` — see [Locking](#locking). |
| `4321` | `VersionConflict` | Stale `baseVersion`. `error.data.version` is the current etag; retry against it. |
| `4330` | `QuotaExceeded` | Over a cap: the 16 MiB document, 64 paths, 128 changes, 8 owners, 16 paths per owner. |
| `4900` | `Disconnected` | Unknown `sessionId` — typically a stale session after a main-process restart. Reconnect. |
| `-32603` | — | *Vault request timed out*: no answer within **120 s**. The transport's error, not the vault's; in practice, a sheet nobody answered. |

**What a refused `connect()` looks like.** Four situations all reject with
`4001`, and what separates them reaches you only in the message you have just
been told not to branch on. In one case that is deliberate. So treat `4001` as
a single outcome — *stop asking on your own initiative, and put connecting
behind a button the user presses* — and read the messages as debugging aid
only:

- The user rejected the sheet (*user denied*).
- The user has rejected you **three times running**, and the sheet will not
  open again for five minutes. Reported identically to a plain rejection on
  purpose: a site that could tell them apart could count the user's refusals.
- **Another origin's sheet is already open** (*another request is awaiting an
  answer*). One sheet at a time, whoever asks, so the newcomer is refused
  rather than left waiting behind a sheet it cannot see. This is the one worth
  retrying, and the user's button press is the retry.
- **The page that asked is gone** — you navigated away while the sheet was
  open, so the answer has nothing to attach to. Nothing was granted; the next
  page load asks afresh.

### Publishing under `/shared`

`/shared` is reserved, and **location is the mark** — there is no shareable
flag. Anything you write under it is what another site can be granted, and
nothing outside it can ever be read by another site.

To you it is ordinary data: read and write it under your own grant like
anything else. Two things follow from the location being the mark:

**Publishing is explicit.** A write under `/shared` needs a granted rule rooted
at or below `/shared`. A grant on the whole document carries every other right
but not this one, so a site cannot end up publishing because it asked for
everything.

Note what this does and does not tell the user. Asking to write at or below
`/shared` raises a note on your own consent sheet — "This site writes data
marked `/shared` into its partition. Other sites can read this data if you give
them permission." — so the user is told that what you store there is askable
for, at the moment they grant it. What they are not told is *which* of your
fields end up there, or when: that is your own schema, and the sheet does not
list paths. Nothing is actually read by anyone until a reader asks and the user
approves that separately, which is a second, per-pair decision.

Publishing more under `/shared` later is immediately covered by an existing
whole-subtree grant, and *not* by a specific-pointer grant — so a reader
granted the whole subtree keeps up with you, and one granted a named pointer
does not.

### Reading another site's shared data

Declare it at `connect`, so one sheet covers your own fields and your
cross-origin reads:

```js
const session = await window.vault.connect({
  requestedScopes: [
    {
      methods: ['vault_getData', 'vault_setData', 'vault_getSharedData'],
      fields: [{ path: '/profile', read: true, write: true }],
      foreign: [{ origin: 'bzz://social.eth', paths: ['/shared/displayName'] }],
    },
  ],
});

const { values } = await window.vault.readShared(session.sessionId, 'bzz://social.eth', [
  '/shared/displayName',
]);
```

- Read-only. There is no cross-origin write and no cross-origin `subscribe`, so
  poll if you need to see changes.
- Name the owner's **exact origin**, since that is its partition: scheme, host
  and port. `https://social.example`, `http://social.example` and
  `bzz://social.eth` are three different asks, and a wrong one is
  indistinguishable from an owner with nothing published.
- You may name specific pointers or `/shared` wholesale. Neither the sheet nor
  the Data pane shows which pointers you asked for — both name the partition and
  nothing else — so a wholesale ask is approved on the same terms as a narrow
  one. Ask for only what you need anyway: the grant is what the engine enforces
  on every read, whatever the user was shown, and a narrower ask survives the
  owner publishing something you had no business reading.
- `vault_getSharedData` must be requested. Unlike `vault_getPermissions` it is
  never granted implicitly, because it is the cross-origin surface.
- At most 8 owners and 16 paths each per connect.

**Absent data reads as empty, and there is no error for "no such owner."** A
path the owner never wrote, an owner with no partition at all, an owner the user
declined, a grant since removed, and a pointer outside `/shared` all resolve to
`null`. That is deliberate: anything that told them apart would let you probe
which sites the user has visited. It also means a typo in an origin is
indistinguishable from an owner with nothing published — check the Data pane,
which lists the pairs the user actually approved, and whether each is on.

### Revoking, and switching off

The user controls a cross-origin read from the wallet's Data pane, from either
end, with the same control: a `read` checkbox under **Permissions** on either
partition's page — "this site reads" on the reader's, "reads this site" on the
owner's. It is one grant and one state, so unticking it on either page switches
the same read off, and it stays on record so the user can tick it back on.
`permissionsChanged` fires on the reader's live session, no data is deleted on
either side, and deleting a partition drops every grant naming it in both
directions — after which the reader prompts again rather than appearing to
still hold it.

A read that is off starts returning empty rather than rejecting, so code that
already handles absent data already handles this.

**A switched-off read does not re-prompt.** The approval is still on record, so
connecting again does not raise the consent sheet for it — your reads just keep
answering `null` until the user ticks it back on. Do not treat empty results as
a cue to ask again.

### Letting your next version read this one

A partition is keyed by origin, so **the next iteration of your site is a
different site**: a new subdomain, a new scheme, a new port, a new name, a new
transport — any of them, and the document starts empty. `/shared` is the way
across that, if you plan for it on the way in. Write what a future version will need under `/shared` from the start, and v2
declares a read of v1's origin and migrates on first run. The engine repo's
README works the pattern through in code, under *Sharing data under `/shared`* →
*Forward compatibility*.

Two things to keep in mind. The user approves that read, on v2's sheet, naming
v1's partition — it is not automatic, and if they decline, v2 starts empty. And
an absent v1 is indistinguishable from a declined one: both read `null`, so
treat an empty result as "nothing to migrate" rather than as a failure to retry
or report.

### A reader can re-publish what it reads

Said plainly: nothing stops a site that reads `/shared/displayName` from writing
that value into **its own** `/shared`, where a third site can then ask to read
it. The grant is per reader/owner pair and is not transitive; the data is not
bound at all. Once a reader has a value it holds a copy, and the browser cannot
un-copy it — revoking stops future reads, not past ones.

Treat `/shared` as published. If you would not put it on a page, do not put it
there.

### Locking

The vault auto-locks after 15 minutes idle. That is the browser's current
default rather than part of the contract, so do not hard-code the interval or
try to predict the lock — handle `4312` wherever it lands. Vault reads and
writes count as activity and push the timer out, so an actively used session
stays open. A
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
