# Mythical DAO portal

React/TypeScript/Vite, Wagmi/Viem, Cloudflare Worker + D1. The active architecture keeps the existing Polygon Governor, treasury, MANA and delegation. Only `MythicalRagequitModule` is new. Snapshot remains external. The API never signs transactions.

## Local development

Reuse installed dependencies. Run the repository disk preflight before substantial allocations. Configure two independent RPC secrets in `.dev.vars` using `.dev.vars.example`.

For a local live-data preview, copy the example only if `.dev.vars` does not already exist (`cp -n .dev.vars.example .dev.vars`). It contains two public Polygon endpoints; replace them with dedicated endpoints when their usage limits are insufficient. Restart an already running `wrangler dev` after creating this file: adding it does not reload bindings in the existing process. `.dev.vars` is ignored by Git.

```sh
npm run types
npm run db:local
npm run build
npm run dev:api
```

Open http://127.0.0.1:8787. Without RPC configuration the portal explicitly shows setup/unavailable data. Draft import/export works offline. For hot reload use `npm run dev`. Existing Snapshot records stay in D1; do not reinitialize a populated database.

Check `/api/health` after starting. A non-null `head` confirms the two-provider chain check succeeded; `syncing` still blocks transactions until historical indexing is complete. `/api/members/<wallet-address>` and `/api/treasury` read live contract values independently of that backfill. Empty historical lists are not proof of zero activity. Membership displays its verified block and lets the user retry a failed read.

## Active behavior

Public MANA and governance reads use the published subgraph; treasury balances retain the last independently verified RPC update. See [Graph primary reads](docs/GRAPH_PRIMARY_READS.md) for coverage, freshness, budgets and live transaction checks.

- Existing Governor: propose, vote, execute directly when Succeeded, cancel eligible pending proposals, current on-chain parameters and original proposal identities.
- Treasury: one DAO account; GEM/WETH/native USDC basket; POL and historical USDC.e remain visible and excluded.
- Ragequit: immutable noncustodial module; continuous treasury allowances, exact member MANA approval, proportional burn, per-asset minimums, deadline and atomic balance checks.
- English light/dark portal, four-step executable wizard, preserved old drafts, Snapshot advisory link/archive and accessible wallet reviews.
- Two-provider verification, independent governance readiness, additive sources, deduplication, fenced indexing and reorg recovery.

## Validation

```sh
npm run check
POLYGON_FORK_RPC=<polygon-archive-rpc> npm run rehearse
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
npm run deploy:check
```

The fork test creates, votes and executes authorization and revocation proposals through the real Governor, uses real basket tokens/MANA, and proves rollback with real USDC paused. `POLYGON_FORK_BLOCK` optionally pins a block. It never broadcasts. Browser tests require the local Worker. `npm run contracts:build` exports the curated `ExistingGovernor.json` and module ABI. Historical V2 artifacts remain for provenance.

[Operations](docs/OPERATIONS.md) describes deployment of only the new module, proposal generation, verification and staged activation. [Implementation status](docs/IMPLEMENTATION_STATUS.md) records actual checks and remaining live steps. [Threat model](docs/THREAT_MODEL.md) documents permissions and economic limits. [OpenAPI](worker/openapi.json) preserves routes and adds explicit module/basket capabilities.

The manifest uses schema version 2. `treasury`, `ragequitModule`, `gem`, `usdcNative`, and `usdcBridged` are explicit. Historical `usdc` still means USDC.e. The missing module never disables governance. `enabled` permits verified governance; it does not assert that the local Worker or a public deployment is operational.

V2 scripts/contracts and [historical operations](docs/historical/OPERATIONS_V2.md) are retained solely as history. Do not run `contracts/script/Deploy.s.sol` for this release. The existing Telegram service stays in its existing Governor + Snapshot mode.
