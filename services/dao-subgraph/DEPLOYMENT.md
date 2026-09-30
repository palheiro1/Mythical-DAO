# Studio deployment and network publication — 30 September 2026

The existing-Governor/MANA pilot is published on The Graph Network, has caught up, and passed real authenticated Gateway comparisons against two Polygon RPCs and existing D1 proposal rows. The API key restriction in Studio and the remaining full-history/reorg acceptance gates are still pending. The portal continues to use its existing D1/RPC backend.

| Field | Value |
|---|---|
| Studio | [mythical-dao-pilot](https://thegraph.com/studio/subgraph/mythical-dao-pilot) |
| Version / network | `v0.1.0` / Polygon (`matic`, chain 137) |
| Deployment CID | `QmQ5GTG5cGpPDXc9duief12uyPsALnq569DJUY8PVvN7BW` |
| Development endpoint | `https://api.studio.thegraph.com/query/1762785/mythical-dao-pilot/v0.1.0` |
| Remote state | Caught up; Gateway verified, with no indexing errors in recorded metadata |
| Publication / billing | Published on Arbitrum One at 08:49:12 UTC; no paid upgrade or deployer GRT signal |

## Network publication

The user confirmed `publishNewSubgraph` in MetaMask. The transaction succeeded in Arbitrum block **510,297,306**. Its receipt agrees between the official Arbitrum RPC and dRPC, and the published deployment digest decodes to the exact CID above. The registry reports `isPublished=true`; the ownership NFT belongs to `0x86708d2cc6c45c82ee8a0894d7bcf24c809d4c43`.

- [Graph Explorer](https://thegraph.com/explorer/subgraphs/56FJGyLgf4QM8C7DNVKjzv4xUMPfWuLSzLsGeEheiZUb?view=Query&chain=arbitrum-one): subgraph ID `56FJGyLgf4QM8C7DNVKjzv4xUMPfWuLSzLsGeEheiZUb`, version `v0.1.0`.
- [Transaction](https://arbiscan.io/tx/0x116d6f23463cca98b2dbfcf95dff6859df37e02e55644240ba2f6bb4b6938f99): destination is the [official Arbitrum L2GNS](https://thegraph.com/docs/en/contracts/), `0xec9A7fb6CbC2E41926127929c2dcE6e9c5D33Bec`.
- Value sent: **0 ETH**. Gas paid: **0.000005683984684 ETH**. No GRT transfer or approval occurred in this publication.
- Explorer displayed **457.3 signal** shortly afterwards. This did not come from a deployer signal in the publication transaction; its origin was not independently traced. The Explorer's index-status field did not return a usable readiness result during verification.
- [Publication evidence](evidence/network-publication-2026-09-30.json) records the receipt, deployment digest, owner, fee and Gateway URL template. Inclusion on Arbitrum and successful publication do not prove that an indexer has finished syncing or that Gateway queries are ready.

Immediately before publication, the [second comparison](evidence/prepublication-comparison-2026-09-30.json) passed at Polygon block **63,114,621**: total supply, two accounts, the MANA event sample, and the first Governor proposal's exact identifier, description and actions all agreed with Infura and Tenderly. Coverage of the pilot block interval was **35.43%**. The later Governor sample remains pending.

## First independent comparison

At **08:19:52 UTC**, the comparator passed all available checks at block **49,939,209**, against **Infura and Tenderly**, including a repeat check of the canonical hash. [Machine-readable evidence](evidence/comparison-2026-09-30.json).

- Expected CID, chain, source addresses and deployment blocks matched.
- Total supply matched: **1,000,000 MANA**. Indexed totals at that historical block were **13 holders, 76 transfers, zero proposals and zero votes**; these are not present-day DAO metrics.
- Treasury and known-member balances, voting power and delegate matched both RPCs. The member held **4,442.60045032 MANA** at that block.
- All **8 selected MANA events** from blocks 45,785,116–45,790,115 matched. Other event types outside the pilot's ABI are deliberately excluded.
- Governor samples at 58,427,770–58,432,769 and 89,169,940–89,174,939 remain ahead of the index. Exit code **2** means a successful partial comparison, not complete acceptance.

Relative to the confirmed target block 94,700,763, the pilot had covered approximately **8.49%** of its block interval. Studio displays about **52.7%** because it divides the current absolute block height by Polygon's height, including blocks before MANA existed. Neither percentage predicts completion time. The work runs in The Graph's infrastructure and continues with the local computer switched off.

## Fixes found during activation

1. Studio rejected the initial ABI upload because the event JSON lacked explicit `anonymous` fields. Both ABIs now include `anonymous: false` and explicit `indexed` flags, with a regression check. Mappings, event scope and contract addresses were not changed.
2. Number-based historical `_meta` queries returned `hash: null`. The comparator now pins every Graph read to the canonical hash agreed by both RPCs; a missing or mismatched hash still fails validation.
3. The public dRPC endpoint rejected a 5,000-block log range, then a 1,000-block range, with an inconsistent 10,000-block-limit message. The explicit `--infura` mode reuses the existing local Infura key, with paced requests and Tenderly as the independent second provider. Credentials stay out of shell arguments and reports.
4. A request for the earlier indexed block 45,791,243 was rejected with an earliest-available block of 48,834,282 while the latest block was 48,835,282, despite `prune: never`. Long-term historical entity retention is therefore **not verified**. Immutable historical event samples were successfully queried at the more recent comparison anchor. If a retained anchor disappears during a check, that check must fail and be rerun; it must not silently read a different block.

## Validation and credential handling

- Eight Node validation/deployment/ABI tests, ten Matchstick mapping tests and Graph code generation/WASM build passed.
- Three portal comparator tests passed, including exact proposal content preservation and explicit Infura opt-in.
- The dedicated account key is stored in ignored local `.env` with mode `600`; the previous global Graph CLI authentication was preserved. The wrapper invokes the pinned CLI in-process so the key is not an OS command argument.
- Before commit, all 422 candidate files (~23.2 MB) were checked against the local credentials and their encoded forms: no matches. Gitleaks 8.30.1 also found no leaks in the staged changes. The repository remains private; environment files, dependencies and generated builds are excluded.
- The subsequent network publication only registered the subgraph on Arbitrum. The DAO contracts and token approvals, D1 data, Telegram configuration, portal deployment and billing settings were unchanged.
- Dependencies were reused. Initial disk preflight reserved 0.15 GB against 40.380 GB free; approximately 40.227 GB remained after validation. No installations or project copies were made. Total free-space change was about 153 MB; concurrent application writes were not individually attributed. The 40 GB reserve was maintained.

## Next gate

The [official announcement of 24 September](https://thegraph.com/blog/subgraph-studio-traffic-to-network/) says Polygon's Studio staging query service ends on **8 October 2026**. Network publication is now complete. Network indexing has caught up and real Gateway queries now pass. Remaining steps are completing the key restriction in Studio, observing quota reporting, and completing full-history/reorg acceptance. The development endpoint must not become a production dependency.

While indexing continues, use Studio for status. Both planned Governor milestones now pass; continue with the remaining history and Gateway acceptance checks below. Before any portal integration, complete the history comparison, reconcile all Governor proposal/vote events with RPCs and D1, verify retention/reorg behavior, and measure latency and costs. Existing D1 history and direct transaction verification remain in place throughout.


## Gateway preparation and expanded comparison — 09:35 UTC

The [expanded comparison](evidence/governor-reconciliation-2026-09-30.json) passed all three planned event windows at block **89,532,857**, using Infura and Tenderly. The index had covered **89.43%** of the pilot's block interval toward confirmed block 94,703,788; that is progress through blocks, not a completeness assertion. The indexed supply and both account samples still matched.

All **10 Governor events** returned at that anchor agreed with both RPCs and canonical block hashes: **two proposals, six votes and two executions**. Both existing D1 proposal rows matched, including exact descriptions and action bytes. Eight verified events are not yet in D1; they were not imported and no cursors were advanced. The earlier seven-event milestone is preserved in [its report](evidence/governor-inventory-2026-09-30.json). Full-range RPC probes did not provide usable results; a smaller probe confirmed Infura's 10,000-block range limit. No unbounded rescan was started.

A live comparison exposed an empty-string representation difference: the generated nullable `reason` setter unsets an empty vote reason, returning `null` in GraphQL, while both RPCs return `""`. The comparator normalizes only this empty `VoteCast.reason` case. Tests still reject changed non-empty reasons, proposal identifiers, action bytes, duplicate events and changed block hashes.

The CLI now supports a dedicated Gateway key sent only in an Authorization header to the fixed published subgraph endpoint. Redirects, unexpected credential destinations, oversized streams, malformed responses and transport failures are rejected. Optional D1 reconciliation is read-only and explicitly reports events ahead of the anchor and events absent from D1. Eleven Node tests, five comparator tests and the portal TypeScript check passed. Mappings and the published CID were not changed, so their previous WASM/Matchstick results still apply; no frontend build or deployment was needed for these CLI-only changes.

**Credential setup initially stalled (subsequently resumed below).** The user authorized creating a dedicated query key and storing it in ignored local files and the Cloudflare Worker. Studio rejected the proposed `0 USD` per-key cap because that field requires a positive number; no key was created and no spending limit was raised. During billing verification, a network interruption was followed by account-load errors and an unresolved wallet connection. The user was asked to restore the Studio session. Verify the actual Free Plan state and agree the available no-charge configuration before creation, then restrict the key to this subgraph, store it securely and test real Gateway queries. Neither a working Gateway credential nor the Cloudflare secret is currently claimed as configured.

Disk preflight failed on the internal volume, which was already below the required 40 GB reserve (about 39.99 GB available). The authorized disk-guard cache maintenance completed without recovering enough space. Work therefore used a 24 MB source-only checkout on the external TOSHIBA volume after a successful 0.35 GB preflight, reusing existing dependencies and keeping test caches there. No credentials or dependency trees were copied. The checkout is retained until the change is merged and recoverable independently. The internal volume subsequently fell to about 39.59 GB while this work was running externally; that concurrent growth was not attributed to a specific application.


## Studio caught up — 09:45 UTC

Studio reached the Polygon head without indexing errors. The [caught-up comparison](evidence/caught-up-comparison-2026-09-30.json) passed at confirmed block **94,704,178**, canonical hash agreed by Infura and Tenderly. All three event samples, all ten indexed Governor events and both D1 proposals matched. Indexed observations were 44 MANA holders, 307 transfers, two proposals and six votes; total supply and the two sampled account balances/delegations matched the RPCs. This establishes catch-up and the stated comparisons, not proof against omissions in undiscovered event blocks or a controlled reorg test. It does not establish Gateway readiness.

[CI for code commit 80e4f23](https://github.com/palheiro1/Mythical-DAO/actions/runs/36697473168) passed all three jobs: portal, subgraph and Telegram. This includes type checks, tests, builds, browser/recovery validation and a Worker dry run. No production deployment or D1 mutation was performed.


## Authenticated network queries — 09:53 UTC

The user restored the Studio session and completed its login signature. The dashboard confirmed **Free Plan, 0 / 100,000 queries** before the key was used. The dedicated `Mythical DAO pilot server` query key was created without upgrading the plan. The optional per-key spending-limit field was left unset because Studio rejects zero; **a 0 USD per-key cap is not configured**. No positive limit, card, billing deposit or paid upgrade was added.

The first Gateway metadata/statistics request completed in approximately **525 ms**. The subsequent [Gateway comparison](evidence/gateway-comparison-2026-09-30.json) passed at confirmed Polygon block **94,704,475**, with the exact published CID, no indexing errors, all three event samples, all ten returned Governor events, both account samples, total supply and both existing D1 proposals matching Infura/Tenderly or D1 as applicable. The index was already ahead of the confirmed anchor. This is a real network Gateway result, not the Studio development endpoint. One latency observation is not a performance guarantee.

The key was transferred through a short-lived loopback password form, without printing it or placing it in shell arguments. The form server exited after saving; the temporary clipboard value was cleared and its tab closed. `services/dao-subgraph/.env` and `services/dao-portal/.dev.vars` are ignored by Git and have mode `600`. `wrangler secret put` stored `GRAPH_API_KEY` in `mythical-dao-portal-staging`; a separate secret listing confirmed the binding and preserved the three existing RPC/Infura secrets. No frontend credential was added. Updating the secret creates a Worker version using its existing code; the runtime still uses D1/RPC and does not query Graph.

**Remaining credential issue:** Studio's `Restrict to a Subgraph` selector returned an empty list for the project name, exact network subgraph ID and a name prefix, including after a page reload. The key currently has no provider-side subgraph restriction. The user was asked to try the visible selector; do not report this restriction as enabled until its saved state is verified. The CLI itself only sends the key to the fixed approved Gateway URL. Full-history omission checks, controlled reorg/retention acceptance and runtime integration also remain pending; no D1 rows or cursors were changed.
