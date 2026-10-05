# Live signing health repair, 2026-10-05

The public portal's Cloudflare backend returned `LIVE_CHECK_EXPIRED` for every
GET health request. Its proposal snapshot had stopped at
2026-10-05T02:28:40.847Z, while direct live checks could still verify the chain
and permit signing. The scheduled snapshot refresh was reporting `exceededCpu`
at 10 ms. Signing availability must not depend on proposal snapshot refresh.

The deployed Worker contains changes absent from master, including proposal
snapshots and read RPC selection. A full deployment from master would discard
those changes. This repair therefore removes only the cached health route from
that exact deployed artifact; proposal caching, scheduled tasks, RPC selection,
preflight, assets, secrets and D1 bindings are preserved. The existing live
health handler continues checking both providers, current block freshness and
Governor/MANA identity. No timestamp is extended or signing check bypassed.

- Worker: `mythical-dao-portal-staging` (also serves the canonical public portal).
- Original version: `cf5b79c5-f608-436d-9fcc-71dd8bae79f9`.
- Original module SHA-256: `339f4e37e4ac8feda5d6b6b56c6d0b3d88263ad6c68f1eaa74f6ea64e3f25f74`.
- Repaired module SHA-256: `7fb8069e832d56e51c301065d647813b3e589459b53f76b7e57bf2c57a5b3d49`.

`scripts/repair-health-cache.mjs ORIGINAL.js REPAIRED.js` produces the repair
offline and rejects any other original artifact or overwrite. Download the
original module through the authenticated Cloudflare Workers API. Deploy the
repaired module with `keep_assets: true`, retain existing plain-text and secret
bindings, and explicitly preserve ASSETS, DAO_DB, compatibility and observability
settings. Check the active version before publishing; never overwrite another
operator's deployment. This does not require a D1 migration or cron change.

Regression verification:

```sh
PORTAL_WORKER_UNDER_TEST=ORIGINAL.js npm test -- tests/health-route.test.ts
# Five failing cases reproduce stale authorization and bypassed live checks.
PORTAL_WORKER_UNDER_TEST=REPAIRED.js npm test -- tests/health-route.test.ts
# Five passing cases verify the actual repaired artifact.
npm test -- tests/health-route.test.ts tests/health-request.test.ts tests/rpc.test.ts
# Nineteen passing cases verify the maintained source and RPC checks.
```

The source handler in `worker/index.ts` already performs live health checks;
the request-level regressions protect it against reintroducing this coupling.
The remaining deployed source differences must be reconciled before a future
full backend build. This repair does not fix the separate scheduled proposal
refresh CPU limit; expired proposal states continue to be shown as unknown.

Rollback is available through the original Cloudflare version. Retain the
downloaded original, repaired artifact, checks and deployment response as
incident evidence until source reconciliation and a normal backend release.
