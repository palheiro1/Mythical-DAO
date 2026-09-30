# Studio pilot deployment — 30 September 2026

The existing-Governor/MANA pilot is deployed and indexing remotely. The portal still uses its existing D1/RPC backend; this release does not activate a data-source switch.

| Field | Value |
|---|---|
| Studio | [mythical-dao-pilot](https://thegraph.com/studio/subgraph/mythical-dao-pilot) |
| Version / network | `v0.1.0` / Polygon (`matic`, chain 137) |
| Deployment CID | `QmQ5GTG5cGpPDXc9duief12uyPsALnq569DJUY8PVvN7BW` |
| Development endpoint | `https://api.studio.thegraph.com/query/1762785/mythical-dao-pilot/v0.1.0` |
| Remote state | Deployed; indexing, with no indexing errors in the recorded metadata |
| Publication / billing | Unpublished; no on-chain transaction or paid upgrade performed |

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
- No contracts, token approvals, D1 data, Telegram configuration, portal deployment or billing settings were changed.
- Dependencies were reused. Initial disk preflight reserved 0.15 GB against 40.380 GB free; approximately 40.227 GB remained after validation. No installations or project copies were made. Total free-space change was about 153 MB; concurrent application writes were not individually attributed. The 40 GB reserve was maintained.

## Next gate

The [official announcement of 24 September](https://thegraph.com/blog/subgraph-studio-traffic-to-network/) says Polygon's Studio staging query service ends on **8 October 2026**. This development endpoint must not become a production dependency. Continuing service requires publishing this reviewed CID to The Graph Network, confirming network indexing and Gateway access, and assessing its billing configuration. Publication is a separate wallet operation; it has not been performed.

While indexing continues, use Studio for status and run the bounded comparison at the two Governor milestones. Before any portal integration, complete the history comparison, reconcile all Governor proposal/vote events with RPCs and D1, verify retention/reorg behavior, and measure latency and costs. Existing D1 history and direct transaction verification remain in place throughout.
