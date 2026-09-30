# The Graph — comparison-only backend

Published to the preview Worker on 30 September 2026, version `8d7985fa-e647-4a45-8c38-2a8d4a5893fd`, with comparison off. [HTTP verification](evidence/graph-comparison-preview-2026-09-30.json) confirms the new diagnostics route, signing enabled and D1 history still syncing. The portal still serves history from D1 and verifies live state and transactions through RPC. The Graph reader cannot supply signing eligibility, change a cursor, import events or replace those data sources.

## Validation completed

The authenticated Gateway comparison at Polygon block **94,706,303** passed against Infura and Tenderly: all **73 indexed MANA accounts** (balance, voting power, delegation), **44 positive balances**, conservation of **1,000,000 MANA**, and both proposals (action/description hash, voting interval, vote totals, execution/cancellation state). All ten indexed Governor events, the three historical samples and both exported D1 proposal rows also matched. The anchor was checked again on both RPCs and Graph at completion.

Evidence: [entity comparison](../../dao-subgraph/evidence/entity-comparison-2026-09-30.json). The export was subsequently refreshed and its two Governor rows were unchanged. These checks do **not** prove that no event was omitted from an entirely undiscovered block. `fullHistoryVerified` remains false.

## Worker integration

- Shared bounded reader: `shared/graph-pilot.mjs`. The CLI re-exports the same implementation. Gateway destination, deployment CID, Polygon sources and start blocks are fixed and validated.
- `worker/graph-comparison.ts` runs only with `GRAPH_COMPARE_MODE=shadow`, `GRAPH_SUBGRAPH_RESTRICTED=true` and a private `GRAPH_API_KEY`. All committed environments remain **off / false**. The restriction flag records operator verification; it cannot configure or prove the provider's restriction by itself.
- One attempt per hour, with an atomic lease and a conservative reservation of three Graph queries before network work; at most 3,000 reserved queries/month for this feature. This does not meter separate manual commands or other keys on the account. No public request can trigger a comparison.
- At most 200 accounts / 50 proposals per snapshot; cron further limits on-chain proposal verification to ten and compares two known accounts. The offline `--entities` check verifies every returned account. Over-limit responses fail explicitly rather than silently truncate.
- Three Graph requests per completed attempt: latest metadata, snapshot pinned to a canonical hash, final metadata. Responses are bounded to 4 MB and requests/body reads to 30 seconds; new comparison work stops after a 90-second budget. RPC reads use their own bounded transport; the lease expires after three minutes.
- A stale index (over 256 blocks behind the confirmed head), wrong CID, indexing errors, divergent RPC reads, changed canonical hash, invalid totals, proposal differences or incomplete response causes failure. Failed attempts replace prior success. Reports older than two hours are marked stale.
- The additive `0005_graph_comparison.sql` creates only a comparison table. Existing events, checkpoints, cursors, quotas and Snapshot rows are preserved. `GET /api/graph-status` reports mode/status without performing Graph/RPC requests. `/api/health` and signing availability are independent.

## Key restrictions

The user configured `*.mythicalbeings.io` as the only authorized domain. A real request without Origin was rejected with `domain not authorized by user`; the same query with `Origin: https://dao-preview.mythicalbeings.io` succeeded. Authenticated requests now send that fixed origin; they never copy a browser-supplied origin. The key remains server-side, in ignored local files and the Worker secret, and is never included in a URL or public response.

The domain restriction is complementary to the subgraph allow-list: Origin/Referer can be supplied by a non-browser client. The Studio subgraph selector still needs to authorize only `56FJGyLgf4QM8C7DNVKjzv4xUMPfWuLSzLsGeEheiZUb`. Keep `GRAPH_SUBGRAPH_RESTRICTED=false` until the provider's saved list and an allowed/denied query test confirm it. Do not upgrade the Free Plan or set a positive spending limit to work around the selector.

## Operation

Repeat the full entity comparison from `services/dao-subgraph`, loading the existing ignored environment files without echoing credentials:

```sh
GRAPH_REPORT_PATH=evidence/entity-comparison.json node --env-file=.env --env-file=../dao-portal/.dev.vars scripts/compare.mjs --infura --gateway --governor-events --entities
```

Add `GRAPH_D1_EVENTS_PATH` pointing to a bounded, read-only export for D1 reconciliation (see the subgraph README). Direct invocations are deliberately manual; they do not consume or bypass the Worker's D1 quota reservation. They use the same fixed authenticated destination and Origin.

For a later shadow activation: verify the provider restriction, apply the additive migration to the staging database, then set `GRAPH_SUBGRAPH_RESTRICTED=true` and `GRAPH_COMPARE_MODE=shadow` in the reviewed staging configuration and deploy. Check `/api/graph-status` after a scheduled attempt. Disable with `GRAPH_COMPARE_MODE=off`; preserve comparison evidence and all D1 history. Even a successful shadow comparison does not switch the portal's data source.

## Tests and remaining acceptance

117 portal tests pass, including 11 new comparison tests; the 11 existing subgraph validation tests also pass. Coverage includes changed anchor/recovery, final metadata mismatch, stale data, pagination caps, altered actions/descriptions, D1 reconciliation, failed/slow responses, fixed credential destination/Origin, concurrent attempts, hourly/monthly quota, late completion fencing and unchanged history. Types, frontend build and staging Worker dry-run pass. The existing JavaScript bundle-size warning remains.

The reorg tests simulate a canonical-chain change at the reader boundary; **a controlled Graph Node rollback/retention acceptance test is still pending**. A reproducible isolated Anvil/Graph Node test is prepared in `services/dao-subgraph/scripts/rehearse-reorg.mjs` and added to CI, with a 4 GB disk preflight and a 40 GB reserve. It exercises replacement of MANA events and derived balances/totals, retained canonical history and rejection of an orphan block. Its result must be checked before claiming service rollback acceptance. No Docker image was pulled into the internal disk below its mandatory reserve. Full-history omission checks also remain pending; the independent D1 scan continues and must eventually be reconciled through the same acceptance anchor. Neither gate is marked complete by entity/state agreement alone.

No Governor/MANA migration, treasury transaction, ragequit deployment, notification-service switch or active Graph data-source cutover is part of this change.

Builds used the existing dependencies from the external checkout. The external volume passed the 0.8 GB preflight (246.891 GB free); measured after the main validation work: 246.869 GB free. Internal free space remained below the 40 GB reserve (~39.570 GB), so no dependency install, large build or Docker pull was performed there. On this external mount the colon in the path breaks npm script PATH lookup; validation used explicit `node_modules/.bin` executables.
