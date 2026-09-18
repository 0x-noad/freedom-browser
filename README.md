# Freedom Browser

[![CI](https://github.com/solardev-xyz/freedom-browser/actions/workflows/ci.yml/badge.svg)](https://github.com/solardev-xyz/freedom-browser/actions/workflows/ci.yml)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20|%20Linux%20|%20Windows-lightgrey)](https://freedom.baby)

> **VAULT fork.** This is
> [`0x-noad/freedom-browser`](https://github.com/0x-noad/freedom-browser), a fork of
> [`solardev-xyz/freedom-browser`](https://github.com/solardev-xyz/freedom-browser).
>
> **What this fork adds on top of upstream:**
>
> - **VAULT data vault** — per-site encrypted storage with per-field consent:
>   `window.vault` for pages, the wallet **Data** tab for the owner, and the
>   `freedom://dapps` launcher. One unlock covers wallet and vault; the grant
>   store is sealed with the OS keychain where one exists; export/import carries
>   sealed blobs — no plaintext data or site list. Engine + reference glue:
>   [`absolutions19/vault3r-code-public`](https://github.com/absolutions19/vault3r-code-public)
> - **`window.ens`** — ENS (`.eth`), WNS (`.wei`) and GNS (`.gwei`) resolution for
>   pages, through the browser's own quorum-checked resolver and caches, with a
>   batched `reverseMany()` for feeds. Upstream resolves all three for the address
>   bar but exposes none of it to a page
> - **Every provider at document-start** — upstream installs `window.ethereum`
>   synchronously in the page's main world but still defers `window.swarm` and
>   `window.radicle` to `DOMContentLoaded`, after a deferred
>   `<script type="module">` has already run. This fork installs all of them —
>   `ethereum`, `swarm`, `radicle`, `vault`, `ens` — the same early way, plus a
>   `freedom#initialized` readiness event
> - **Verifiable Swarm content longevity** — publish results carry `batchId` and
>   `bytesSize`, and `swarm_isRetrievable()` / `swarm_getBatch()` let a site check
>   that content is still served and how long it stays paid for
> - **Actionable Swarm readiness** — capability reasons carry `reasonMessage` (the
>   action that clears them) and `setupAvailable`, instead of naming a state and
>   stopping there
> - **Vault data safety** — concurrent writes to one partition can no longer tear
>   its sealed blob: unique temp files in the storage adapter, every engine
>   mutation serialised through one write queue, and delete loads the manifest
>   before touching the blob. A partition that still will not open is attributed
>   — sealed under a different identity, corrupt, or unknown — instead of a raw
>   `KeyInvalidated`, with a different next step for each
> - **Vault usability fixes** — data-plane use keeps the vault unlocked,
>   `vault_getPermissions` is granted with every grant, the Data tab shows the
>   current tab's partition in a banner matching the wallet's, and listed sizes
>   update live as a site writes
> - **Dev partitions keyed by port** — `*.localhost` origins include the port in
>   their namespace, so two dev servers on one hostname never share a partition.
>   Real origins are unchanged
> - **Site-author documentation** — [`docs/site-authors.md`](docs/site-authors.md)
>   covers all four providers together, with type definitions in
>   [`types/freedom-providers.d.ts`](types/freedom-providers.d.ts)
> - **Correct host arch on macOS** — binary downloads and build checks resolve the
>   real hardware architecture, so an x64 Node under Rosetta no longer fetches
>   `darwin-x64` for an arm64 Electron
>
> ```bash
> npm install
> unset ELECTRON_RUN_AS_NODE   # if launching from Cursor/VS Code agent terminals
> npm start
> # optional test dApp (from a sibling vault3r checkout):
> #   pnpm serve:vault-test  →  open http://vault-test.localhost:8765/
> ```

Freedom is a browser for the decentralized web, with Swarm, IPFS, Radicle, and ENS as first-class protocols.
It ships with integrated Swarm, IPFS, and Radicle nodes, enabling direct peer-to-peer network access without relying on centralized HTTP gateways. Radicle is available on macOS and Linux; the Windows build ships without Radicle until official Windows binaries are published upstream.

Freedom is a browser for the decentralized web, with Swarm, IPFS, onchain applications, Radicle, ENS, and Tezos Domains as first-class protocols. Integrated Ant, freedom-ipfs, Radicle, experimental Myotis, and Tor components provide direct access to decentralized and onion networks without relying on centralized HTTP gateways.

## Download

Download the latest build for macOS, Linux, or Windows from the official download page at [freedom.baby](https://freedom.baby).

Radicle is available on macOS, Linux, and Windows (x64 and ARM64). The release workflow bundles the Tor (Arti) client for macOS arm64, Linux x64/arm64 and Windows x64. Windows x64 bundling landed in September 2026, so only releases cut after that carry Arti on Windows — an earlier Windows install has none, and updating to the latest build is the fix. No Windows ARM64 build is published at all, so `.onion` access is unavailable on that architecture.

## What Freedom supports

- Native `bzz://`, `ipfs://`, `ipns://`, `web3://`, and `rad://` navigation, plus optional `.onion` routing through Tor.
- Contract-hosted applications (draft ERC-8244) loaded straight from an Ethereum-compatible chain, with no HTTP gateway.
- Integrated Ant (Swarm), freedom-ipfs, Radicle, experimental Myotis, and Tor components with per-profile configuration.
- ENS, WNS, GNS, and Tezos Domains resolution, including `.eth`, `.box`, `.wei`, `.gwei`, and `.tez` names.
- Tabs, sidebar, bookmarks, history, downloads, find-in-page, shortcuts, themes, permissions, and automatic updates.
- Ad blocking with signed list updates and per-site allowlisting.
- Wallet and dApp flows, x402 payments, hardware-wallet support, and Swarm/Radicle provider APIs.
- Custom protocol origins so decentralized applications can use relative assets, storage, service workers, and range requests naturally.

See the [feature guide](docs/features.md) for the detailed capability list.

## Run from source

Development uses Node.js 24 LTS. The exact repository version is pinned in [`.nvmrc`](.nvmrc).

```bash
nvm install
nvm use
npm ci
npm run ant:download
npm run ipfs:download
npm run myotis:download
npm run myotis:build-supervisor
npm start
```

Swarm and IPFS start automatically. Radicle and Myotis are opt-in under **Settings → Startup**. Run `npm run radicle:download` before enabling Radicle under **Settings → Nodes**; run `npm run tor:download` (macOS, Linux, and Windows) before enabling Tor under **Settings → Experimental** — the Tor rows only appear once that build exists. For prerequisites, platform notes, tests, debugging, and local builds, read the [development guide](docs/development.md).

## Architecture

Freedom is an Electron application. Protocol, node-lifecycle, permission, wallet, download, and persistence logic lives in the main process. The renderer is a modular UI layer that communicates with the main process through the allowlisted channels in `src/shared/ipc-channels.js`.

The main process handles `bzz:`, `ipfs:`, `ipns:`, `web3:`, `rad:`, and `.onion` navigation, manages per-profile nodes and storage, and resolves supported decentralized names. `web3:` needs no node or gateway: the handler reads the contract's ERC-8244 `html()` document through the same chain-data router the wallet uses. Security-sensitive capabilities stay out of page and renderer contexts unless exposed through a narrow preload or IPC API.

| Directory       | Responsibility                                                                         |
| --------------- | -------------------------------------------------------------------------------------- |
| `src/main/`     | Electron main process, services, native nodes, protocol handlers, IPC, and persistence |
| `src/renderer/` | Browser UI, internal pages, navigation, settings, and dApp integration                 |
| `src/shared/`   | Constants and utilities shared across processes                                        |
| `test-e2e/`     | Playwright harness and live Electron tests                                             |
| `config/`       | Runtime templates, default data, and platform entitlements                             |
| `scripts/`      | Build, download, smoke-test, and maintenance tooling                                   |
| `docs/`         | User, protocol, contributor, and maintainer documentation                              |

Contributors changing process responsibilities or adding IPC channels must follow the [architecture boundaries](docs/agent-playbooks/architecture-boundaries.md).

## Security model

- Electron runs with context isolation enabled and Node integration disabled in web content.
- Privileged internal APIs are restricted to trusted `freedom://` pages or narrow provider surfaces.
- Web permissions are denied by default and granted through per-site prompts.
- Nodes run locally by default; external endpoints are explicit per-profile settings.
- ENS resolution uses public RPC fallbacks unless a custom or locally verified endpoint is configured.

Do not post credentials, seed phrases, private keys, or sensitive logs in public issues. See [CONTRIBUTING.md](CONTRIBUTING.md) for disclosure guidance.

## Documentation

- [Documentation index](docs/README.md)
- [Development](docs/development.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Swarm content retrieval and migration](docs/protocols/swarm.md)
- [IPFS/IPNS content retrieval and migration](docs/protocols/ipfs.md)
- [Contract-hosted applications (ERC-8244)](docs/protocols/onchain-apps.md)
- [Radicle provider API](docs/radicle-provider-api.md)
- [Building a site for Freedom — `window.ethereum` / `swarm` / `vault` / `ens`](docs/site-authors.md)
  (fork; type definitions in [`types/freedom-providers.d.ts`](types/freedom-providers.d.ts))
- [Native IPFS desktop integration](docs/freedom-ipfs-native-desktop.md)
- [Changelog](CHANGELOG.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request. It explains issue scope, local verification, commit conventions, licensing, and the policy for AI-assisted contributions.

Freedom Browser is available under the [Mozilla Public License 2.0](LICENSE). Third-party notices are recorded in [NOTICES](NOTICES).
