# `src/main/vault/vendor/` — the data vault's engine

Generated. Do not edit by hand: the next bundle overwrites it, and an edit here
is invisible to the engine's own test suite.

## What it is

| File | What |
| --- | --- |
| `vault-bundle.js` | the whole engine — `@vault/vault-core`, `@vault/crypto-core`, `@vault/protocol` — as one CommonJS file |
| `vault-core.js` | two-line shim: `require('./vault-bundle.js').vaultCore` |
| `crypto-core.js` | two-line shim: `require('./vault-bundle.js').cryptoCore` |

The engine owns the cryptography, the grant arithmetic, the document store and
namespace derivation. The host glue beside this directory owns the boundary:
which frame a session belongs to, which origin is authoritative, and what the
user approved. See `docs/vault-for-site-authors.md` for the page-facing contract.

- **Source:** <https://github.com/absolutions19/vault3r-code-public>
- **License:** MPL-2.0, the same as Freedom Browser.
- **Revision:** stamped in the bundle's own banner (`Revision:` on line 4). A
  banner reading `+local` was built over uncommitted work and is not traceable
  to a published commit — it should not be merged.

## Rebuilding

From the engine repo's root:

```bash
node tools/bundle-for-freedom.mjs <path-to-freedom-browser>
```

It writes all three files here and stamps the banner with the revision it built
from. The output is deterministic: rebuilding the same revision changes nothing
but the banner, so a bundle commit's diff shows exactly what moved in the
engine.

Commit a regenerated bundle **on its own**, with the engine revision in the
commit message as well — nothing else in Freedom's history records which engine
a given release shipped.

## Third-party code inside the bundle

The bundler keeps Node builtins external and inlines everything else, so these
ship inside `vault-bundle.js`. All MIT, all attributed in `NOTICES`, all
recorded in `LICENSE_AUDIT.md`:

| Package | Version | Why the engine needs it |
| --- | --- | --- |
| `@noble/ciphers` | 1.3.0 | XChaCha20-Poly1305, the seal on every partition |
| `@noble/hashes` | 1.8.0 | SHA-256 and HKDF: storage keys and per-partition subkeys |
| `@noble/curves` | 1.9.7 | Ed25519, for the device identity the adapter interface requires |
| `@scure/base` | 1.2.6 | base64url / hex encoding of sealed blobs |
| `@scure/bip39` | 1.6.0 | reading the mnemonic the browser already holds |
| `tldts` | 6.1.86 | the Public Suffix List: eTLD+1 for host-granularity namespaces, and the authoritative-domain check |

Five of the six are already in Freedom's npm tree at these same versions, as
transitive dependencies of the wallet. `tldts` is not — it arrives only with
this bundle, which is why it has its own line in `LICENSE_AUDIT.md`. Electron
exposes no Public Suffix List API, so the data has to come from somewhere; a
naive "last two labels" check would make `attacker.co.uk` authoritative for
`victim.co.uk`.
