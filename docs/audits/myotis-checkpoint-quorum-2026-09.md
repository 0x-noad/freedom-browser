# Checkpoint quorum integration — review notes

The only trust-policy addition is quorum for external checkpoint endorsement. Colibri 2.0.6 WASM proof verification remains mandatory, with the same proof providers and fresh isolated store. No native changes or dependency changes.

## Fixed providers

Ethereum 2/3: Sigma Prime (https://mainnet.checkpoint.sigp.io), EthStaker (https://beaconstate.ethstaker.cc), ChainSafe/Lodestar (https://beaconstate-mainnet.chainsafe.io).
Gnosis 2/2: https://checkpoint.gnosischain.com and https://checkpoint-sync-gnosis.dappnode.net.

The Ethereum community list identifies the three operator brands: https://eth-clients.github.io/checkpoint-sync-endpoints/. Gnosis docs list Gnosis and Dappnode: https://docs.gnosischain.com/about/networks/mainnet. Dappnode's own setup wizard now names the HTTPS .net endpoint: https://github.com/dappnode/DAppNodePackage-prysm-generic/blob/main/setup-wizard.yml. Its documented old .io endpoint redirects to HTTP and is not used.

Public /checkpointz/v1/status metadata observed 2026-09-15 exposes distinct upstream labels: Sigma Prime “oaks”, EthStaker “Geth + Lighthouse (self-hosted)”, ChainSafe “lodestar public”, Gnosis “Gnosis Beacon RPC”, Dappnode “web3-misc-1”. These operator attributions and self-reported upstreams support selection; they are not an audit of infrastructure ownership or proof that no dependencies are shared. Security depends on the required independent operators not jointly lying. All use Checkpointz, so implementation bugs remain a shared risk.

## Algorithm

Colibri's existing by-slot trust request is intercepted. For that exact slot the worker queries every fixed provider's block root and explicit finalized checkpoint. Each provider gets at most one vote. A source whose latest finalized root differs can endorse the same older block through Checkpointz's /checkpointz/v1/beacon/slots finalized-history API. The upstream implementation calls ListFinalizedSlots, rather than exposing arbitrary block existence: https://github.com/ethpandaops/checkpointz/blob/master/pkg/service/checkpointz/checkpointz.go.

Only a root with the fixed number of matching finalized endorsements is returned to Colibri. Its unchanged cryptographic verifier must accept the proof, and Freedom recomputes the decoded checkpoint-header root and requires an exact slot/root match with the quorum observation. Freshness (one hour), clock checks, HTTPS, no redirects, body caps, request timeouts, worker deadline and cancellation remain enforced. Publication lag/history absence is retryable, not automatically a conflict. A valid Ethereum majority can outweigh a dissenting/unavailable third source. Gnosis requires both. No denominator shrink or fallback to prover/RPC.

The evidence is an external finality assertion plus a Colibri proof, not a cryptographic proof that websites are honest. History entries have the same external trust as the service's latest-finality assertion.

## Records and lifecycle

New checkpoint schema v2 records store the distinct approved voter origins. Worker-result and new-generation validation require quorum provenance. Existing v1 single-authority generations can resume under their previous trust policy; they cannot authorize new recovery and are not relabeled as quorum-verified. Native staleness triggers new v2 acquisition. Existing ownership guards, fresh generation creation and read gating remain intact.

## UX

Successful recovery stays quiet. Lack of sufficient endorsements retries at the existing 15s/60s delays, then shows a connection/retry explanation. Conflicting votes without a majority pause recovery and show “Checkpoint sources disagree”. Retry remains available. Invalid proof stays a verification failure. The threshold never drops.

## Validation

[Live evidence and screenshots](evidence/myotis-checkpoint-quorum-2026-09/README.md) record actual quorum + Colibri WASM + Myotis recovery on both chains, verified reads before and after restart, confirmed native stops, and the ASAR worker path. Gnosis recovered after two retryable quorum failures; Ethereum recovered on its first attempt. Both themes were visually inspected.

Lint passes. The full unit suite has 4,517 passing, 13 skipped and three previously identified unrelated failures: two macOS shortcut-remap cases in `settings-store.test.js` and one Safe fork send expectation in `safe-fork.test.js`. All changed-module tests pass. Policy coverage includes each Ethereum authority unavailable, insufficient votes on either chain, disagreement, a dissenting minority, history alignment, missing/conflicting/duplicate history, duplicate/unapproved record voters, repeated lookups, invalid proofs, malformed bodies, wrong chain, clock/freshness, and preserved cancellation/storage guards.

Quorum orchestration stays in the existing isolated checkpoint worker, with provenance validation in the existing verifier and error mapping in the manager/UI. No new IPC, dependency or native-code change is needed. Keeping this policy here ensures the lifecycle only receives a fully verified checkpoint; it avoids moving trust decisions into the renderer or native addon.

All 211 focused checkpoint/store/manager/UI tests pass. The broader theme-parity run passed 6 of 8 cases; both chrome walks retain the existing Radicle contrast-baseline mismatch and macOS `Control+f` recipe timeout. Linux screenshot baselines were skipped on this Mac (12 cases). These do not replace the four directly inspected quorum-state screenshots.
