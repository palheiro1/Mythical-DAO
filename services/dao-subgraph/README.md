# Mythical DAO — The Graph pilot

Pilot for the existing Polygon Governor and MANA. **Published to [The Graph Network](https://thegraph.com/explorer/subgraphs/56FJGyLgf4QM8C7DNVKjzv4xUMPfWuLSzLsGeEheiZUb?view=Query&chain=arbitrum-one) as `v0.1.0` on 2026-09-30.** Publication is registered on Arbitrum One; indexed contracts remain on Polygon. It is not an active portal backend. Cloudflare D1, its history/cursors and the Telegram service continue operating unchanged. All three planned samples and ten indexed Governor events passed comparison with two independent RPCs through the network Gateway at confirmed block 94,704,475 after indexing caught up; both existing D1 proposals matched. The dedicated query key is stored locally and in the staging Worker, but its Studio subgraph restriction is still pending because the selector returns no results. All 73 indexed MANA accounts and both proposals additionally passed complete entity-state comparisons at block 94,706,303. A [comparison-only Worker integration](../dao-portal/docs/GRAPH_COMPARISON.md) is implemented and disabled. Full-history acceptance and active portal integration remain pending. See the [deployment report](DEPLOYMENT.md) and [release record](pilot-release.json).

**Service deadline:** The Graph announced that Polygon staging queries end on **2026-10-08**. Network publication and real Gateway queries are verified; credential restriction and the remaining validation are still required before any portal cutover. The local comparator uses Studio by default and supports an explicit authenticated Gateway check with `--gateway`. No paid plan was activated. [Official announcement, 2026-09-24](https://thegraph.com/blog/subgraph-studio-traffic-to-network/).

## Scope

| Source | Polygon address | First block | Events |
|---|---|---:|---|
| Governor / treasury (one source) | `0x7b9e327748462f1038c9d081c98d189b22c60a27` | 48674443 | ProposalCreated, VoteCast, ProposalExecuted, ProposalCanceled |
| MANA | `0x2cacca1266653bb090d3fb511456ebca33150562` | 45785116 | Transfer, Approval, DelegateChanged, DelegateVotesChanged |

There are no global token queries, call handlers, block handlers, treasury basket sources or V2 sources. Existing proposal IDs, exact description/action bytes and signatures are preserved. Immutable event IDs use transaction hash and log index; the external `eventKey` also includes chain and contract. Repeated events do not double count. Missing mint/proposal history fails indexing explicitly.

MANA supply, balances, holder count and voting power derive from events. These are historical observations, **not transaction authorization**. Proposal execution/cancellation flags come from events; current voting state, quorum and executable status must still be read from the Governor at the chosen block. An executed proposal is not assumed to describe current treasury balances.

The manifest requests historical entity retention (`prune: never`), but Studio rejected an older time-travel query during the live trial. Do not assume the service retains arbitrary past entity snapshots. The comparator pins reads to a recent indexed hash agreed by two RPCs and fails if that anchor becomes unavailable. Historical immutable event records remain queryable at a retained anchor. Graph Node handles rollback on canonical reorgs; a controlled reorg acceptance test remains pending. Unit tests do not prove that service behavior.

## Reproduce

Use Node 22.12 or later. Run the workspace disk preflight before allocating dependencies. Reuse the existing installation if present.

```sh
npm ci --ignore-scripts
npm run check
```

`check` runs comparator guards, ten real AssemblyScript mapping tests through Matchstick 0.6.0, code generation and WASM compilation. Matchstick downloads its official Linux/macOS test binary on first use. CI uses Ubuntu 24.04; no Docker image is necessary. The production mappings never call an RPC from a handler. The project explicitly uses standard npm peer resolution (`legacy-peer-deps=false`), with TypeScript and Node types pinned: the machine-wide legacy setting originally hid missing peers from the first lockfile, which CI detected.

## Studio deployment

1. The dedicated Polygon subgraph `mythical-dao-pilot` already exists. Reuse this project for subsequent reviewed versions; do not overwrite unrelated subgraphs.
2. Its account's deploy key is stored only in local ignored `.env`, with permissions `600`. The pre-existing global Graph CLI credential belongs to a different configuration and was preserved. For another checkout, copy `.env.example` to `.env`, securely set `GRAPH_DEPLOY_KEY` from the correct Studio account and set `GRAPH_STUDIO_CREATED=mythical-dao-pilot`. Keep keys out of chat, shell arguments, committed files and build artifacts.
3. Set a new `GRAPH_VERSION` for a subsequent reviewed deployment, then run:

```sh
npm run deploy:studio
```

The wrapper invokes the pinned CLI in-process and targets only `https://api.studio.thegraph.com/deploy/`. It does not put the key in OS command arguments or overwrite global CLI authentication. This deploys an unpublished development version; it does not publish on-chain, submit a transaction, purchase a plan or configure a portal cutover. Uploading a subgraph sends the manifest, ABI and mappings to The Graph/IPFS; the pilot contains only public contract addresses and code intended for this purpose. Verify the actual deployment in Studio and its query metadata; a successful local build alone does not prove remote activation.

Record the returned deployment CID, version and development query endpoint in a local ignored `.env`. Copy `.env.example`; fill `GRAPH_PILOT_URL` and `GRAPH_PILOT_DEPLOYMENT`. A CID change requires an explicit configuration change. The comparator rejects an unexpected deployment even if its schema matches.

## Verify against Polygon

The comparison command reuses the sibling portal's installed `viem`; run its `npm ci` only if those dependencies are absent. It is read-only and does not update D1.

```sh
node --env-file=.env scripts/compare.mjs
```

The default public dRPC endpoint rejected the 5,000-block event sample during the live trial, even with an inconsistent error claiming a 10,000-block limit. The successful comparison used the existing Infura Free key and independent Tenderly RPC instead. Reproduce it without copying the key or putting it in shell arguments:

```sh
node --env-file=.env --env-file=../dao-portal/.dev.vars scripts/compare.mjs --infura
```

Infura calls are paced at least 1.1 seconds apart. This is a bounded manual check sharing the existing key's quota, not a continuously running job. It neither changes the Worker nor resets its daily budget.

The script checks chain 137, two distinct HTTPS RPC hosts, close heads, the subgraph deployment, indexing errors, explicit source identities, a shared block/hash, total supply and two accounts (treasury and the known member). Every anchored Graph query uses the agreed block hash: number-based `_meta` queries return a null hash in Studio and are not accepted as proof. It compares normalized event samples near MANA creation and two known Governor proposals, including exact proposal actions. It rechecks the block hash at the end. Provider-specific extra log fields are excluded from comparison. Safe error codes identify the failed RPC stage without exposing credentials or response bodies.

Exit `0` means these samples passed, **not full-history acceptance**. Exit `2` means the available anchored data passed but some sample ranges are still ahead of the index. Exit `1` means configuration, provider or comparison failure. Optional `GRAPH_REPORT_PATH` writes a report without endpoints/keys. `GRAPH_RPC_PRIMARY` and `GRAPH_RPC_SECONDARY` can override the default independent public RPCs.

Pagination is bounded and fails rather than silently truncating; GraphQL errors also fail. Do not continuously poll this full comparison. Studio development endpoints currently have a 3,000-query/day limit; monitor progress in Studio and compare at milestones. The code does not assume a published-network free query allowance applies to Studio.

### Gateway and Governor reconciliation

Store the dedicated query credential as `GRAPH_API_KEY` in the ignored `.env`, separately from `GRAPH_DEPLOY_KEY`. Restrict the key to subgraph `56FJGyLgf4QM8C7DNVKjzv4xUMPfWuLSzLsGeEheiZUb`. Keep the account on the Free Plan; do not upgrade billing to complete the pilot. Studio rejected a per-key spending cap of `0 USD` during setup, so that cap must not be reported as configured. The account was subsequently confirmed on the Free Plan with 100,000 monthly queries, and the key was created without upgrading billing or setting a positive spending limit. Restriction is not yet configured: Studio's selector returned no candidates by name or exact ID. The key is private and restricted by the user to `*.mythicalbeings.io`. Authenticated CLI/Worker queries send the fixed `https://dao-preview.mythicalbeings.io` Origin; a request without Origin was rejected and one with it passed. Domain restriction does not replace the pending subgraph restriction. The CLI pins its destination to this subgraph, and the Worker comparison remains off.

```sh
node --env-file=.env --env-file=../dao-portal/.dev.vars scripts/compare.mjs --infura --gateway --governor-events
```

`--gateway` uses the fixed network endpoint with an `Authorization: Bearer` header. The credential is never put in the URL; redirects and other destinations are rejected. Responses are streamed with a 4 MB limit and a 30-second timeout. Transport, malformed JSON, HTTP and GraphQL failures return sanitized error codes. There is no automatic fallback to Studio and no change to the portal's backend.

`--governor-events` verifies every Governor event returned at the agreed anchor against both RPCs, including all four supported Governor event types in each discovered block, canonical block hashes and proposal bytes. It cross-checks event counts with pilot statistics. Verification is bounded to 2,500 events and 100 distinct event blocks and fails if a bound is reached. This does not discover omitted events in completely absent blocks and therefore **does not establish complete history**.

To compare existing D1 data, first export only the four Governor event types with a read-only Wrangler query from `services/dao-portal`:

```sh
./node_modules/.bin/wrangler d1 execute DAO_DB --env staging --remote --json --command "SELECT chain_id,contract,block_number,block_hash,tx_hash,log_index,event_name,args_json FROM events WHERE chain_id=137 AND contract='0x7b9e327748462f1038c9d081c98d189b22c60a27' AND event_name IN ('ProposalCreated','VoteCast','ProposalExecuted','ProposalCanceled') ORDER BY block_number,log_index LIMIT 2501" > /tmp/mythical-d1-governor.json
```

Then set `GRAPH_D1_EVENTS_PATH=/tmp/mythical-d1-governor.json` on the comparison command. Existing D1 events at or below the anchor must all match; events ahead of the anchor are reported separately. Graph events not yet present in D1 are counted without importing them or advancing cursors. D1 does not store transaction index, so that field is checked against the two RPCs instead. The export limit includes one extra row to detect truncation.

The generated nullable-string setter stores an empty `VoteCast.reason` as `null`. The comparator treats only this field on this event as equivalent to the contract's empty string; non-empty text must still match exactly. Event mismatches report bounded event keys and field names, without credentials or full response bodies.

Studio's displayed percentage uses the absolute Polygon block height. Pilot history coverage is `(indexedBlock - 45785116 + 1) / (targetBlock - 45785116 + 1)`, clamped to 0–100%; it measures blocks covered, not event completeness or remaining time. Indexing runs remotely and continues with the local computer switched off.

Use `--entities` to additionally check every returned MANA account and proposal against the two RPCs, including balance conservation, holder count, proposal hashes/intervals/vote totals/state. Collection caps fail explicitly. This does not prove absence of omitted event blocks.

## Acceptance before serving Graph data in the portal

- Complete Governor/MANA history with no indexing errors, and matching canonical block hash on two RPCs.
- Match supply and account samples, proposal IDs/descriptions/actions, vote totals and event samples; then reconcile **all** Governor proposal/vote events and the existing D1 rows before using history counters.
- Exercise a controlled reorg, failed/slow endpoint, wrong CID, stale head and pagination limits. Measure catch-up time, query latency and actual query/storage costs.
- Keep direct RPC verification/simulation for signatures, balances, allowances, delegation and ragequit. Never trust a subgraph as approval to sign.
- Any fallback/cutover must be an explicit later change with its own tests. No automatic source switch or deletion of D1 cursors is included.

References: [manifest](https://thegraph.com/docs/en/subgraphs/developing/creating/subgraph-manifest/), [Studio deployment and development limits](https://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/using-subgraph-studio/), [GraphQL block and metadata queries](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/), [Polygon support](https://thegraph.com/docs/en/supported-networks/matic/).

## Isolated Graph Node reorg rehearsal

The manually dispatched `graph-reorg.yml` workflow runs `node scripts/rehearse-reorg.mjs` with Graph Node v0.45.0, Anvil, IPFS and an ephemeral PostgreSQL database. It checks rollback of MANA Transfer events and derived entities, canonical historical reads and rejection of an orphaned block. It never uses Polygon/Studio credentials, modifies the production manifest or contacts a funded wallet. Test-only emit bytecode is installed at the MANA address on the empty local chain. Artifacts retain the result and bounded Graph Node logs for seven days.

Local execution requires `GRAPH_REORG_LOCAL=1`, existing Node/Graph CLI/Anvil/Docker dependencies, free test ports and the disk preflight (4 GB peak addition, 40 GB reserve on Docker's filesystem). Existing test containers cause refusal. Cleanup targets only containers/volumes created under the dedicated `mythical-graph-reorg` compose project; images and unrelated resources are preserved. This short rehearsal does not establish long-term Gateway retention or full Polygon history completeness.

The initial hosted-runner attempt was blocked **before Docker downloads**: only 13.31 GB were available, below the required 40 GB reserve plus 4 GB peak allocation. See `evidence/reorg-preflight-2026-09-30.json`. The normal CI continues to test the mappings and build; the separate acceptance workflow requires a suitable runner and has not yet passed the service-level rollback test.

1 October update: the local rehearsal passed after space became available, including Governor rollback. Orphan-hash queries require the portal’s RPC guard; see [acceptance evidence](evidence/reorg-acceptance-2026-10-01.json) and [serving limitations](../dao-portal/docs/GRAPH_HISTORY.md).
