# Graph supplemental history activated — 1 October 2026

The user accepted proceeding with a private backend query key while Studio cannot apply the per-subgraph restriction. The preview is active under an explicit exception, not a false restriction attestation.

- Worker: `6a9a3f23-5b90-466e-85ee-c63068c0694e`.
- `GRAPH_COMPARE_MODE=shadow`, `GRAPH_READ_MODE=verified`, `GRAPH_REORG_VERIFIED=true`.
- `GRAPH_SUBGRAPH_RESTRICTED=false`, `GRAPH_ALLOW_UNRESTRICTED_SERVER_KEY=true`.
- The frontend build is unchanged and already deployed on Vercel. No production-environment setting, wallet authority, DAO contract or billing plan was changed.

## Live acceptance

[HTTP and cache evidence](evidence/graph-activation-2026-10-01.json) records a successful scheduled comparison at Polygon block **94,763,472**, with both account samples, both proposals and ten Governor events verified using two RPCs. The published portal returns Graph history `ready`, keeps governance signing available and reports `historyComplete=false`.

The live endpoints and browser show two executed proposals, zero active votes and zero pending executions **among the verified indexed proposals**, and ten delegate candidates with voting power read live through both RPCs. `/api/events` returns 45 merged, deduplicated rows including the ten Governor events. The independent D1 scan is still around 1.52%; this activation does not relabel it as complete. Its 37 events and six cursors remain in place. [Live overview screenshot](evidence/graph-active-overview-2026-10-01.jpg).

The initial cron failed before its first Graph request because workerd rejects `redirect: "error"`. A new test reproduced this with native workerd fetch. The reader now uses `manual` and explicitly rejects every 3xx response, never following the Location or forwarding the credential. This passes the runtime regression test and the real remote cron. Independent account/proposal reads and groups of three historical blocks reuse the existing three-call JSON-RPC batching to reduce HTTP subrequests.

One controlled acceptance retry reset only `graph_comparison.next_attempt`, conditional on the exact failed report and its four reserved queries. Its owner, report, monthly usage and all independent history/cursors were preserved. The next normal cron succeeded. Eight queries are reserved for the two attempts; subsequent scheduled attempts retain the hourly spacing and 3,000/month cap. Public endpoint requests do not initiate Graph queries.

## Accepted risk and remaining work

This query credential can consume API quota; it cannot sign a transaction, spend DAO funds or publish new mappings. The endpoint is fixed to our subgraph and the key stays in private local files and Cloudflare secrets. A leaked key can be used outside our backend and bypass its local quota guard. The domain allowlist relies on request headers and does not authenticate an arbitrary server. A subgraph restriction reduces the credential's scope but still permits quota abuse against the allowed subgraph. No paid plan or positive spending cap was enabled. [The Graph access controls](https://thegraph.com/docs/en/gateways/subgraphs/consumer-side/serving-queries/).

Provider scope remains recommended hardening when Studio permits it. After verifying it, set `GRAPH_SUBGRAPH_RESTRICTED=true` and remove `GRAPH_ALLOW_UNRESTRICTED_SERVER_KEY`. Full-history omission checks and long-term Gateway retention remain pending; they are not bypassed by this operational exception. Runtime source/hash validation, canonical RPC checks, cache freshness and D1 fallback remain mandatory.

To roll back reads set `GRAPH_READ_MODE=off`; to stop scheduled comparisons set `GRAPH_COMPARE_MODE=off`. With no provider restriction, removing the exception also closes both gates. None of these operations removes history or changes signing authority.

## Validation

127 portal tests passed across 20 files, including real-workerd success/redirect rejection, exception policy reporting, private-key requirements, quota preservation, reorg rejection and withdrawn-exception fallback. Type checking and frontend build passed; eight affected subgraph reader tests passed. No frontend code changed. Live HTTP endpoints returned 200 and browser inspection confirmed the source label, counts and delegates. A transient browser verification warning recovered on the next check; the portal correctly kept prior data labeled and the subsequent health response again reported signing available and Graph history ready. No console errors were observed. Existing bundle-size warnings remain.

The 2 GB disk preflight passed with 357.776 GB free. Existing dependencies/runtime were reused; available space after validation was approximately 357.724 GB (about 52 MB additional usage), above the 40 GB reserve.
