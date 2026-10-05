# Verified supplemental history — 1 October 2026

The portal can supplement the independent D1 index with Governor events discovered through The Graph and decoded from matching RPC logs. This is an additive read path, not a replacement for D1 or wallet preflight.

On 1 October the user accepted proceeding with a private, server-only query key without a provider subgraph restriction. `GRAPH_ALLOW_UNRESTRICTED_SERVER_KEY=true` explicitly records this exception in staging; `GRAPH_SUBGRAPH_RESTRICTED=false` remains truthful. Local and production defaults retain the restriction gate. The Studio selector is still empty ([UI evidence](evidence/graph-studio-selector-2026-10-01.jpg)), but fixing it is now hardening work rather than an activation prerequisite. See [activation evidence](GRAPH_ACTIVATION.md).

This key permits querying public subgraphs, not signing transactions, spending DAO funds or updating mappings. If it leaks, an attacker could consume the account's query allowance. Restricting it to one subgraph reduces its usefulness elsewhere but cannot prevent quota exhaustion by repeated allowed queries. The domain allowlist checks client-supplied headers; it is not proof that an arbitrary server request originates from our website. The 3,000-query monthly guard limits this Worker's scheduled usage, not a stolen key's external use. The key stays in ignored private files/Worker secrets, is sent only to the fixed approved Gateway in a Bearer header, and is never available to the browser. No billing upgrade or new credential is part of this exception. [Provider access controls](https://thegraph.com/docs/en/gateways/subgraphs/consumer-side/serving-queries/).

Initial publication with reads disabled: Worker `80e970cf-60ca-4250-8f4b-951c89d45e2a`, Vercel `dpl_99MTxRBX1BTnmB2XvupffW9b4JVo`. [Live HTTP verification](evidence/graph-history-preview-2026-10-01.json). The additive migration was applied; remote D1 contains 37 events, six independent cursors and eight Snapshot records. The live portal was inspected with no console errors observed.

## Acceptance

- The [live acceptance](evidence/graph-history-acceptance-2026-10-01.json) passed with the staging provider pair (dRPC/Tenderly): two proposals, ten Governor events, and ten positive-power delegate candidates. All Governor event bytes/identities come from two matching RPC responses. Candidate voting power is read again from both RPCs when the delegate list is requested. This command uses an ephemeral local D1 and changes no remote settings or cursors.
- The earlier [all-account comparison](../../dao-subgraph/evidence/entity-comparison-2026-09-30.json) checked 73 MANA accounts, 44 positive balances and supply conservation. The scheduled comparison still samples two accounts and checks every returned proposal; it does not claim to recheck all accounts each hour.
- A real, isolated Graph Node v0.45.0/Anvil rehearsal [passed](../../dao-subgraph/evidence/reorg-acceptance-2026-10-01.json): MANA supply/balance rolled back from 110 to 107, old events disappeared, a Governor execution was undone, a replacement proposal appeared, and a canonical historical supply of 100 remained queryable. No Polygon transaction was sent.
- The initial orphan-hash assertion failed: Graph Node returned canonical-height data rather than rejecting an orphan hash. This is a [documented Graph limitation](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/#time-travel-queries-example). The rehearsal now records that behavior explicitly (`graphRejectsOrphan: false`) and verifies canonical RPC hash rejection. Portal tests exercise the actual cache reader rejecting changed anchors. Never rely on Graph's hash parameter alone.
- Full-history omission checks remain pending. Matching returned events and balances does not discover an event omitted from an entirely absent block. Neither the API nor the interface claims complete historical coverage.

## Serving behavior

`GRAPH_COMPARE_MODE=shadow`, a private `GRAPH_API_KEY`, `GRAPH_READ_MODE=verified`, and `GRAPH_REORG_VERIFIED=true` are required for the optional read path. Key policy requires either verified `GRAPH_SUBGRAPH_RESTRICTED=true` or the explicit `GRAPH_ALLOW_UNRESTRICTED_SERVER_KEY=true` exception. `/api/graph-status.keyPolicy` reports these separately; the exception never claims provider enforcement. The reorg flag attests only to the controlled acceptance above, not full history or long-term Gateway retention. Local/production defaults remain off. Staging enables comparison and verified reads under the server-only exception; it cannot serve supplemental history until a scheduled comparison successfully publishes the verified cache.

The scheduled job reserves four Graph queries when collecting history (three in comparison-only mode), at most once per hour and 3,000 per month. Public endpoints cannot cause Graph queries. A comparison uses its own cron invocation rather than sharing the invocation with the heavy D1 backfill. Other invocations continue the existing scan; a scheduling failure falls back to the independent indexer.

The additional query is limited to 100 Governor events across 15 blocks, in addition to the existing ten-proposal cron cap. Over-limit, malformed, duplicate, missing, divergent or mismatched events fail the whole supplemental update. Proposal descriptions, actions, proposer and timing must match decoded RPC logs; execution/cancellation flags and vote counts must match the event inventory. The anchor is rechecked before publication. The limits are explicit operational caps and must be reviewed if DAO activity grows.

Migration `0006_graph_history.sql` adds one nullable cache column to `graph_comparison`. Cache/report/timestamp are published atomically under the existing lease owner. Failed runs clear supplemental data. No event, independent cursor, checkpoint, Snapshot record or notification cursor is imported, advanced or deleted.

Each serving request checks feature gates, a successful report no older than two hours, its anchor against the current confirmed height and the canonical hash from both RPCs. Failure returns to the existing D1 read path. Original routes remain:

- `/api/proposals` and proposal detail: merge canonical creation events, preserve IDs/actions/descriptions/direct URLs, read current proposal states by RPC.
- `/api/events`: merge verified Governor events, deduplicate, sort and paginate with the existing cursor tuple.
- `/api/delegates`: add candidate addresses, obtain displayed voting power from RPC.
- `/api/overview`: display current states **among verified indexed proposals**, with `countsVerified: true` and `complete: false`. These are scoped counts, not a claim to have discovered every proposal.
- `/api/health`: adds `graphHistory` with source, availability, checked time, anchor and `complete: false`. Independent sync percentage and signing availability retain their original meaning.
- `/api/graph-status`: exposes configured read mode and reorg acceptance without querying Graph or exposing the key.

Wallet membership/balances, treasury, rules, signatures, simulations and the notification feed keep their existing sources and guards. The interface names the supplemental source, shows its anchor, retains incomplete-history warnings and distinguishes fallback from a successful comparison. Snapshot stays external and the Telegram service is unchanged.

## Validation and operation

127 portal tests passed, including eight history tests covering the real D1 cache, route integration, deduplication/pagination, false metadata, missing logs, failure clearing, reorg rejection, quota edges and preserved membership access. Type checking, build and Worker dry-run passed. Six selected browser checks passed on desktop/mobile, including light/dark layouts at 320/390/768/1440 px and automated accessibility checks. Screenshots `graph-history-*.png` use controlled fixtures, not live DAO balances. The existing large-bundle warning remains.

Run the live acceptance from `services/dao-portal` using ignored local environment files:

```sh
node --env-file=.dev.vars --env-file=../dao-subgraph/.env scripts/check-graph-history.mjs
```

It uses four manually requested Graph queries, outside the scheduled quota counter. Local `.dev.vars` was aligned with staging's public Tenderly secondary after its old PublicNode endpoint timed out. No query key is included in the report or URL.

Activation under the accepted exception requires a real successful scheduled comparison and verification of `/api/health`, proposals/events/delegates and scoped counts. Later, when Studio permits it, restrict the key to our subgraph, verify enforcement, set `GRAPH_SUBGRAPH_RESTRICTED=true` and remove the exception. No automatic full-history cutover is implied. To disable reads, set `GRAPH_READ_MODE=off`; to stop comparisons too, set `GRAPH_COMPARE_MODE=off`. Preserve D1 and the evidence.

The local checkout was fast-forwarded to GitHub before editing. A cumulative 5 GB disk preflight passed with 358.730 GB free. Existing Node dependencies and Chromium were reused. Docker Compose v5.5.1 was installed from its official release with checksum verification; downloaded Graph Node/IPFS/PostgreSQL images are retained for reproducible testing. Only this rehearsal's containers/volumes were removed; unrelated services were preserved. Free space after the main work was approximately 357.9 GB, within budget and above the 40 GB reserve.
