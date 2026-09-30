# Mythical DAO — The Graph pilot

Pilot for the existing Polygon Governor and MANA. **Deployed to [Studio](https://thegraph.com/studio/subgraph/mythical-dao-pilot) as `v0.1.0` on 2026-09-30 and indexing.** It is not an active portal backend. Cloudflare D1, its history/cursors and the Telegram service continue operating unchanged. Initial MANA samples passed comparison with two independent RPCs; complete history and Governor samples remain pending. See the [deployment report](DEPLOYMENT.md) and [release record](pilot-release.json).

**Service deadline:** The Graph announced that Polygon staging queries end on **2026-10-08**. Continuing beyond that date requires publication to The Graph Network and a Gateway endpoint. This pilot is not published on-chain; no paid plan or portal cutover was activated. [Official announcement, 2026-09-24](https://thegraph.com/blog/subgraph-studio-traffic-to-network/).

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

Studio's displayed percentage uses the absolute Polygon block height. Pilot history coverage is `(indexedBlock - 45785116 + 1) / (targetBlock - 45785116 + 1)`, clamped to 0–100%; it measures blocks covered, not event completeness or remaining time. Indexing runs remotely and continues with the local computer switched off.

## Acceptance before any portal experiment

- Complete Governor/MANA history with no indexing errors, and matching canonical block hash on two RPCs.
- Match supply and account samples, proposal IDs/descriptions/actions, vote totals and event samples; then reconcile **all** Governor proposal/vote events and the existing D1 rows before using history counters.
- Exercise a controlled reorg, failed/slow endpoint, wrong CID, stale head and pagination limits. Measure catch-up time, query latency and actual query/storage costs.
- Keep direct RPC verification/simulation for signatures, balances, allowances, delegation and ragequit. Never trust a subgraph as approval to sign.
- Any fallback/cutover must be an explicit later change with its own tests. No automatic source switch or deletion of D1 cursors is included.

References: [manifest](https://thegraph.com/docs/en/subgraphs/developing/creating/subgraph-manifest/), [Studio deployment and development limits](https://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/using-subgraph-studio/), [GraphQL block and metadata queries](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/), [Polygon support](https://thegraph.com/docs/en/supported-networks/matic/).
