# Mythical DAO — The Graph pilot

Pilot for the existing Polygon Governor and MANA. It is **not an active portal backend**. Cloudflare D1, its history/cursors and the Telegram service continue operating unchanged. The mappings compile and their tests run locally; a dedicated Studio subgraph and its deployment are still pending wallet login.

## Scope

| Source | Polygon address | First block | Events |
|---|---|---:|---|
| Governor / treasury (one source) | `0x7b9e327748462f1038c9d081c98d189b22c60a27` | 48674443 | ProposalCreated, VoteCast, ProposalExecuted, ProposalCanceled |
| MANA | `0x2cacca1266653bb090d3fb511456ebca33150562` | 45785116 | Transfer, Approval, DelegateChanged, DelegateVotesChanged |

There are no global token queries, call handlers, block handlers, treasury basket sources or V2 sources. Existing proposal IDs, exact description/action bytes and signatures are preserved. Immutable event IDs use transaction hash and log index; the external `eventKey` also includes chain and contract. Repeated events do not double count. Missing mint/proposal history fails indexing explicitly.

MANA supply, balances, holder count and voting power derive from events. These are historical observations, **not transaction authorization**. Proposal execution/cancellation flags come from events; current voting state, quorum and executable status must still be read from the Governor at the chosen block. An executed proposal is not assumed to describe current treasury balances.

The manifest retains historical entity versions (`prune: never`) so comparisons can use the same block on the subgraph and both RPCs. Graph Node handles rollback on canonical reorgs; a controlled reorg acceptance test remains pending. Unit tests do not prove that service behavior.

## Reproduce

Use Node 22.12 or later. Run the workspace disk preflight before allocating dependencies. Reuse the existing installation if present.

```sh
npm ci --ignore-scripts
npm run check
```

`check` runs comparator guards, ten real AssemblyScript mapping tests through Matchstick 0.6.0, code generation and WASM compilation. Matchstick downloads its official Linux/macOS test binary on first use. CI uses Ubuntu 24.04; no Docker image is necessary. The production mappings never call an RPC from a handler.

## Studio deployment

1. Sign in to [Subgraph Studio](https://thegraph.com/studio/) with the account's wallet and create a **new** subgraph named `mythical-dao-pilot`, on Polygon. Do not reuse/overwrite an unrelated subgraph. An existing local CLI authentication file was found, but its validity and ownership were not verified; the browser currently requires wallet connection.
2. If needed, run `npx graph auth` interactively using the deploy key shown by Studio. Keep keys out of the chat, command arguments, source tree and build artifacts. Confirm that the CLI credential belongs to the same Studio account before deployment.
3. Once the dedicated subgraph exists:

```sh
GRAPH_STUDIO_CREATED=mythical-dao-pilot npm run deploy:studio
```

The wrapper targets only `https://api.studio.thegraph.com/deploy/`. This deploys an unpublished development version; it does not publish on-chain, submit a transaction, purchase a plan or configure a portal cutover. Uploading a subgraph sends the manifest, ABI and mappings to The Graph/IPFS; the pilot contains only public contract addresses and code intended for this purpose.

Record the returned deployment CID, version and development query endpoint in a local ignored `.env`. Copy `.env.example`; fill `GRAPH_PILOT_URL` and `GRAPH_PILOT_DEPLOYMENT`. A CID change requires an explicit configuration change. The comparator rejects an unexpected deployment even if its schema matches.

## Verify against Polygon

The comparison command reuses the sibling portal's installed `viem`; run its `npm ci` only if those dependencies are absent. It is read-only and does not update D1.

```sh
node --env-file=.env scripts/compare.mjs
```

The script checks chain 137, two distinct HTTPS RPC hosts, close heads, the subgraph deployment, indexing errors, explicit source identities, a shared block/hash, total supply and two accounts (treasury and the known member). It compares normalized event samples near MANA creation and two known Governor proposals, including exact proposal actions. It rechecks the block hash at the end. Provider-specific extra log fields are excluded from comparison.

Exit `0` means these samples passed, **not full-history acceptance**. Exit `2` means the available anchored data passed but some sample ranges are still ahead of the index. Exit `1` means configuration, provider or comparison failure. Optional `GRAPH_REPORT_PATH` writes a report without endpoints/keys. `GRAPH_RPC_PRIMARY` and `GRAPH_RPC_SECONDARY` can override the default independent public RPCs.

Pagination is bounded and fails rather than silently truncating; GraphQL errors also fail. Do not continuously poll this full comparison. Studio development endpoints currently have a 3,000-query/day limit; monitor progress in Studio and compare at milestones. The code does not assume a published-network free query allowance applies to Studio.

## Acceptance before any portal experiment

- Complete Governor/MANA history with no indexing errors, and matching canonical block hash on two RPCs.
- Match supply and account samples, proposal IDs/descriptions/actions, vote totals and event samples; then reconcile **all** Governor proposal/vote events and the existing D1 rows before using history counters.
- Exercise a controlled reorg, failed/slow endpoint, wrong CID, stale head and pagination limits. Measure catch-up time, query latency and actual query/storage costs.
- Keep direct RPC verification/simulation for signatures, balances, allowances, delegation and ragequit. Never trust a subgraph as approval to sign.
- Any fallback/cutover must be an explicit later change with its own tests. No automatic source switch or deletion of D1 cursors is included.

References: [manifest](https://thegraph.com/docs/en/subgraphs/developing/creating/subgraph-manifest/), [Studio deployment and development limits](https://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/using-subgraph-studio/), [GraphQL block and metadata queries](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/), [Polygon support](https://thegraph.com/docs/en/supported-networks/matic/).
