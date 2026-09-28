# Mythical DAO Telegram governance notifier

> This is an isolated, versioned rehearsal copy of the existing local service. The original was preserved. Database IDs are deliberately unset and Worker names end in `v2-rehearsal`. No messages or deployments were performed.

## Independent portal mode

`GOVERNANCE_MODE=portal` and `PORTAL_URL=https://dao.mythicalbeings.io` activate `src/portal.ts`. This mode skips both Snapshot and direct legacy Governor polling. It requires the portal health check to report verified data, consumes a resumable composite-cursor feed, silently imports earlier history, refreshes active proposals, and reuses existing delivery deduplication/leases/retries. Community outcomes are explicitly advisory.

Default mode remains `legacy` for safe comparison in staging. Read [portal operation and cutover instructions](../dao-portal/docs/OPERATIONS.md) before changing a live publisher. Keep exactly one publisher active for a production channel.

## Original service documentation

Cloudflare Worker that checks Mythical DAO governance every 15 minutes and publishes English alerts to a Telegram channel. Snapshot is monitored as an off-chain voting source; the Governor contract on Polygon is read directly as the authoritative on-chain source.

## What it publishes

- New proposals and voting activation.
- One reminder when voting first enters its final 24 hours.
- Snapshot results, including ties and proposals with no votes.
- Governor outcomes: passed, defeated, cancelled, expired, and executed.
- A private operator alert after three consecutive source failures, or immediately for permanent Telegram authentication/permission errors.

The first Snapshot read and the recent Governor seed are silent. New activity after activation is notified. Older Governor proposals are imported progressively without messages so a limited RPC provider is not asked to scan the complete chain in one execution.

## Architecture

- `src/index.ts`: Cron and HTTP entry points.
- `src/snapshot.ts`: bounded Snapshot GraphQL polling and validation.
- `src/governor.ts`: confirmed Polygon logs, state polling, recent seed, and historical backfill.
- `src/db.ts`: D1 state, event deduplication, delivery leases, and health incidents.
- `src/telegram.ts`: Telegram delivery, `retry_after`, exponential retry, and operator messages.
- `migrations/`: versioned D1 schema.

D1 prevents normal duplicate deliveries with a unique deterministic event key and a conditional delivery lease. Telegram does not accept an idempotency key, so a Worker termination after Telegram accepts a message but before D1 records its message ID leaves a small residual duplicate window.

## Prerequisites

1. Create a bot with BotFather.
2. Create a Telegram channel and grant the bot permission to post messages.
3. Start a private conversation with the bot so it can send operator alerts.
4. Obtain a Polygon RPC endpoint that supports `eth_getLogs` in ranges of at least 10,000 blocks.
5. Create separate Cloudflare D1 databases for staging and production.

The configured production identities are:

- Snapshot space: `mythicalbeings.eth`
- Polygon chain ID: `137`
- Governor: `0x7B9e327748462F1038c9D081c98d189b22C60A27`
- Governor deployment block: `48674443`

Recheck the network, full address, and deployed bytecode immediately before production activation.

## Initial setup

Install and verify locally:

```sh
npm install
npm run check
```

Create the two databases, then replace the placeholder `database_id` values in `wrangler.jsonc` with the returned IDs:

```sh
npx wrangler d1 create mythical-dao-telegram-staging
npx wrangler d1 create mythical-dao-telegram-production
```

Configure each secret interactively for both environments; never place the values in source control:

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN --env staging
npx wrangler secret put TELEGRAM_CHANNEL_ID --env staging
npx wrangler secret put ADMIN_CHAT_ID --env staging
npx wrangler secret put POLYGON_RPC_URL --env staging
npx wrangler secret put ADMIN_API_TOKEN --env staging
```

Repeat with `--env production`. `TELEGRAM_CHANNEL_ID` may be a public `@channel` username or the numeric channel ID. Use a private test chat or channel for staging.

Apply migrations before deploying code:

```sh
npx wrangler d1 migrations apply mythical-dao-telegram-staging --remote --env staging
npm run deploy:staging
```

After staging validation, apply the production migration and deploy:

```sh
npx wrangler d1 migrations apply mythical-dao-telegram-production --remote --env production
npm run deploy:production
```

## HTTP interface

- `GET /health` returns source health, last successful delivery, and pending delivery count. It never returns secrets or proposal bodies.
- `POST /admin/run` runs a poll immediately.
- `POST /admin/test-telegram` queues and delivers one deterministic, clearly labelled test event through D1 to the configured staging destination. Repeating it does not send again. It returns `404` outside staging.
- `POST /admin/retry/:eventKey` retries a non-delivered event.

Administrative requests require `Authorization: Bearer <ADMIN_API_TOKEN>`. The comparison is made against SHA-256 digests rather than direct secret strings.

## Staging acceptance

1. Apply D1 migrations and deploy staging.
2. Call `/admin/run` with the administrative bearer token; the initial run must not publish historical alerts.
3. Check `/health` and confirm that Snapshot, Governor, and Telegram are healthy.
4. Call `/admin/test-telegram` and confirm receipt of the labelled staging message before production promotion.
5. Confirm that a repeated execution does not add a second delivery for the same `event_key`.
6. Confirm the bot can send a private operator message and publish in the staging destination.

Cloudflare deployment versions provide rollback for Worker code. D1 migrations are forward-only in this project; take a D1 backup or confirm Time Travel availability before a destructive future migration.
