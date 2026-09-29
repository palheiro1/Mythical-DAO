# Operation, deployment, and recovery

## Local setup

Use Node >=22.12, Foundry (tested 1.3.5), Solidity 0.8.30 and the committed npm lockfile. Observe the parent disk budget before installation/builds; the implementation session budgeted 2 GB and reused the Telegram dependencies and installed Chromium.

```sh
cd services/dao-portal
npm ci
npm run types
npm run db:local
npx wrangler d1 execute DAO_DB --local --file archives/snapshot.sql
npm run build
npm run dev:api
```

The built portal is served at http://127.0.0.1:8787. For frontend hot reload, also run `npm run dev`; Vite proxies /api to the Worker. Setup mode works without RPC secrets and never fabricates live data.

`.dev.vars.example` lists the two server-side RPC settings; create an ignored `.dev.vars` with actual providers. Use archive-capable RPCs for historical blocks/logs and providers supporting `eth_simulateV1` for sequential proposal previews. Public RPC availability alone does not establish archive or simulation support. A public endpoint tested during implementation did not retain old historical code, so the MANA scan start conservatively remains block 0 pending independently verified deployment evidence.

Optional WalletConnect: set the public `VITE_WALLETCONNECT_PROJECT_ID` from a domain-restricted WalletConnect project before building. No wallet private key belongs in this app.

## Validation

```sh
npm run check
npm run test:browser
npm run test:recovery
POLYGON_FORK_RPC=https://your-archive-provider.example forge test --match-contract PolygonCompatibilityTest
npm run rehearse
npm run deploy:check
```

Browser tests require the local Worker at 8787 and a compatible Chromium. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing installation to avoid downloading another browser. Wallet tests inject a test provider and intercept RPCs; they never use real wallets. `rehearse` starts its own Anvil process on 18545 and stops only that process. It uses publicly known unlocked local accounts, an in-memory chain without historical state caching (token vote checkpoints remain on-chain), and writes transaction evidence to `deployments/local-rehearsal.json`.

`test:recovery` exports the small local public fixture, restores it into an isolated temporary D1 database, compares every row and removes only that temporary copy. It writes a checksum and table counts into `docs/evidence/local-recovery.json`; this does not replace a production recovery drill.

The optional fork test is skipped unless POLYGON_FORK_RPC is provided. Local mocks do not validate all properties of the deployed assets.

## Contract deployment

First rehearse on local Anvil, then deploy to Polygon Amoy with **test versions** of MANA/WETH/USDC.e. Supply their addresses explicitly. Production uses the existing Polygon MANA and fixed basket addresses from the plan.

```sh
forge script contracts/script/Deploy.s.sol:Deploy --rpc-url <rpc> --account <encrypted-keystore-name>
```

Export DEPLOYER_ADDRESS and the appropriate MANA_ADDRESS, WETH_ADDRESS and USDC_ADDRESS securely. Dry-run first. Add `--broadcast --verify` only for an authorized deployment with funded signing credentials. Never pass a private key through the portal or commit one. The script removes its bootstrap privileges.

Turn the deployment output into a **complete** manifest with network, all addresses, exact deployment/start blocks, receipt hashes, source commit, compiler/OZ version, code hashes and permissions. Keep `enabled:false` until release conditions are met. Run `scripts/verify-deployment.mjs` with two RPC URLs in the environment; reconcile all role events and verified source independently.

The checked-in Polygon manifest intentionally omits undeployed V2 addresses. New deployments are not proxies. Never replace addresses in an existing active manifest casually; a changed contract generation requires governed migration.

## Cloudflare release

Create separate staging/production D1 databases and replace the explicit zero UUID placeholders. Set RPC_PRIMARY_URL / RPC_SECONDARY_URL using `wrangler secret put --env staging|production`. Put the appropriate reviewed manifest JSON into DEPLOYMENT_MANIFEST for each environment; INDEX_BATCH_BLOCKS bounds the replay range.

Apply migrations, build, run `wrangler deploy --dry-run --env staging`, deploy staging, and verify every path. Only after independent review, DAO approval and asset/revenue reconciliation may production activation evidence be completed. Configure the authorized custom domain dao.mythicalbeings.io during production release. Domain ownership and Cloudflare account permissions have not been assumed or changed.

Cron runs every minute. If RPC log ranges fail or exceed the bounded event count, reduce INDEX_BATCH_BLOCKS. Initial backfill may take substantial time; monitor every cursor, never force signingAllowed. /api/health reports provider/data problems without RPC credentials.

## Migration

1. Independently verify code and all permissions before depositing assets.
2. Publish read-only portal and submit adoption through the actual old system.
3. `scripts/rehearse-migration.mjs` prepares exact candidate POL/WETH/USDC.e payloads from current balances, with a concrete new vault address.
4. Simulate the **old Governor's real execution route** on a Polygon fork. The candidate payload tool does not claim to prove that route.
5. Resolve ongoing legacy proposals explicitly; execute only with required approvals.
6. Identify each revenue source, its Tarasca/system owner and exact authorized configuration update. No inventory was supplied; this remains an external release dependency.
7. Reconcile balances and receipts; perform the approved small real ragequit.
8. Keep legacy residual funds/history visible and retire old notification sources only after successful cutover.

## Telegram cutover

The sibling telegram-governance-bot is an isolated source copy of the user's existing bot. Original files were preserved. Rehearsal names and zero database IDs prevent accidental reuse of production resources. Default GOVERNANCE_MODE remains legacy.

After staging validation, configure GOVERNANCE_MODE=portal and PORTAL_URL. The adapter reads the independently verified portal feed, uses chain:contract:id identities, silently imports history before its seed watermark, and retains delivery leases/retries. It does not call Snapshot or Tally in portal mode. No messages were sent during implementation.

Never run both old and new live publishers against the same channel during cutover. First activate the isolated staging channel using the existing bot procedure; then use one publisher with a documented watermark. Existing Telegram secrets need not and must not enter the portal Worker.

## Backup and rebuild

The chain is authoritative; D1 is replaceable. Export D1 using `scripts/export-recovery.sh` to suitable existing external storage, record/check the SHA-256, and test recovery into an isolated empty D1 database. Encrypt any operational backup containing sensitive configuration. The public index/export does not require bot secrets.

To reconstruct: create a fresh database, apply migrations, import the retained Snapshot SQL, configure the exact same manifest and resume cron from each source's start block. Never mutate a live cursor without retaining evidence. Validate counts, hashes, exact proposal identities and RPC health before routing reads to the restored database.

A schema-preserving app rollback uses the previous Cloudflare Worker version. Take an export and test forward recovery before any future destructive migration. Contract rollback is impossible: incompatible changes require a new deployment and DAO-approved migration.
