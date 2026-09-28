# Mythical DAO portal

React + TypeScript + Vite frontend, Wagmi/Viem wallets, Cloudflare Worker + D1, and four immutable Solidity/OpenZeppelin contracts. All member transactions go directly from their wallet to the contracts. The API holds no signing key.

## Run locally

```sh
npm ci
npm run types
npm run db:local
npx wrangler d1 execute DAO_DB --local --file archives/snapshot.sql
npm run build
npm run dev:api
```

Open **http://127.0.0.1:8787**. For hot reload, run `npm run dev` in another terminal.

Without configured deployments or RPC providers, the public UI works in clearly labeled setup mode. Drafts can be written, saved, imported and exported. Financial actions remain disabled.

## Implemented

- Executable governance: 250 MANA threshold, historical vote/supply checkpoints, 10% quorum, inclusive 2/3 majority and a hard 72-hour timelock.
- Treasury: fixed POL/WETH/USDC.e ragequit basket, permanent MANA burn, exact approval, per-asset minimums, expiry, complete atomicity and no operational spending key.
- Advisory community ballots: 2–20 immutable alternatives plus abstention, historical weights, frozen rules, ties/no quorum produce no winner.
- English responsive portal: proposals, voting, scheduling/execution/cancellation, delegation, treasury, exits, history and wallet transaction review.
- Bounded D1 event indexing, two-provider verification, lease fencing, deduplication, reorg recovery and public OpenAPI.
- Eight archived Snapshot proposals, isolated Telegram integration, deployment/verification/recovery scripts.

## Visual and UX review

The portal uses the official Mythical visual identity, persistent system/light/dark themes, a four-step proposal wizard and accessible transaction reviews. [Visual implementation and validation](docs/VISUAL_UX_REVIEW.md) includes captures, asset provenance and the latest UI test results. The [source plan](docs/VISUAL_PLAN.md) records the scope.

## Verify

```sh
npm run check
npm run test:browser
npm run test:recovery
npm run rehearse
npm run deploy:check
```

Browser tests require the local Worker and Chromium. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to reuse an installed browser. The optional Polygon fork test requires POLYGON_FORK_RPC. Read [operation instructions](docs/OPERATIONS.md) before testnet or production deployment.

[Validation evidence](docs/evidence/VALIDATION.md) records the executed checks. [Implementation status](docs/IMPLEMENTATION_STATUS.md) lists remaining external release requirements. [Threat model](docs/THREAT_MODEL.md) documents assumptions and economic behavior. [OpenAPI](worker/openapi.json) describes the public API. No contracts have been deployed to a public network as part of this implementation.

## Layout

- `contracts/src`: Governor, timelock, vault, advisory ballots.
- `contracts/test`: economic boundaries, failures, lifecycle, fuzz conservation and optional real-MANA compatibility.
- `src`: English UI and transaction review; `shared`: ABIs, exact integer data and integrity checks.
- `worker`, `migrations`: read-only API, scheduled indexer and D1 schema.
- `scripts`: local rehearsal, ABI export, Snapshot archive, deployment verification and recovery.
- `deployments`: deliberately inactive Polygon manifest and deployment evidence.
- `archives`: provenance-labeled historical Snapshot records, SQL import and checksum.

## Reference documentation

Implementation references: [OpenZeppelin governance](https://docs.openzeppelin.com/contracts/5.x/governance), [Cloudflare Workers practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Wagmi React](https://wagmi.sh/react/getting-started), [Foundry Anvil](https://www.getfoundry.sh/anvil/index.html).
