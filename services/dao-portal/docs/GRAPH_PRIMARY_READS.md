# Public reads from the published subgraph

The 2026-10-05 release enables `GRAPH_READ_MODE=primary` for the Worker serving
both portal domains. This replaces the earlier RPC-gated Graph history pilot.
The user selected the existing MANA/Governor coverage plus treasury caching;
no new subgraph version, contract deployment or paid plan is involved.

## Read model

Delegates, membership, proposals, vote totals, overview counts and Governor/MANA
events come from the pinned published deployment. These routes run before RPC
clients are constructed, including when no RPC is configured. Snapshots validate
deployment identity, indexing errors, block hash, entity totals, source contracts,
proposal action hashes and event origins. This establishes an internally
consistent indexed view; it is not independent RPC verification of the indexer.
Every page of a refresh uses the same block hash. Bounds are 5,000 accounts,
500 proposals, 10,000 events and 1.5 MB of serialized cache data; exceeding a
bound preserves the previous snapshot instead of displaying a truncated result.

D1 stores a shared snapshot for 60 seconds. A persisted refresh lease prevents
visitors from issuing duplicate Graph requests. Failures retain the last valid
snapshot for up to seven days, visibly marked as stale with its block and check
time. A head older than three minutes is also marked stale. A cold outage returns
an error rather than an empty list. Retries wait at least 30 seconds after failure.

Each Graph request is reserved atomically against a 90,000-request monthly
application budget, below the existing [100,000-query free allowance](https://thegraph.com/docs/en/subgraphs/querying/introduction/).
Normal snapshots need two requests, shared by all visitors. Pagination consumes
the same budget. The comparison cron is disabled in primary mode. Budget
exhaustion uses stale cache and never enables paid overages. The key is server-only
and requests use the fixed gateway, with redirects rejected.

## Coverage and live checks

Treasury balances and Governor parameters have separate caches refreshed by two
independent RPC providers at an agreed confirmed block. They remain readable
during outages after their first successful refresh. Non-MANA treasury activity
continues to use saved D1 history, whose historical coverage may be incomplete.
The published subgraph does not index treasury assets or ragequit.

The schema does not expose historical quorum. Ended, unexecuted proposals are
therefore displayed as `Ended`, without inferring approval or defeat from vote
totals. Reviewing execution checks the actual outcome on the live contract.
Indexed events determine executed/canceled states. Ballots remain on Snapshot.

Public health advertises `operationVerification: on-demand`, while
`signingAllowed` stays false. The UI may begin a review; this never grants a
signature. The existing preflight runs live before review and again before the
wallet request, including chain/provider agreement, block freshness, operation
eligibility and simulation. Ragequit uses `members/:address?live=true` for its
current allowance. Account-switch and self-delegation protections remain active.

The full Worker source also retains the deployed metered foreground provider,
`/api/vote-status/:contract/:id/:account`, and both authorized portal origins.
The Graph cache replaces the former proposal snapshot cron and live-health hotfix;
the independent D1 indexing cron continues in the background.

## Release and rollback

Apply additive migration `0007_public_reads.sql`, publish the compatible frontend,
then deploy the Worker with its existing secrets retained. Warm and inspect
treasury/parameter caches, verify both portal domains, and run an unsigned live
delegation preflight. Keep the prior Worker version and frontend deployment IDs
as rollback evidence. Reverting the Worker version leaves the new cache tables
unused; no existing index tables or rollback data need to be removed.

Tests cover RPC-free public routes, failed live preflight, concurrent refreshes,
invalid snapshots, stale cache, expiry and persistent budgets. Browser coverage
checks that Graph data remains visible through a live-preflight failure without
opening a wallet signing prompt.
