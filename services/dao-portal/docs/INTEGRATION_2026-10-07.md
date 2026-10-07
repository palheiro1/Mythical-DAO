# Portal reconciliation — 2026-10-07

## Cause and preserved history

The public release of 5 October came from `feat/graph-primary-reads` (`9b8a9f7`), subsequently merged into remote master (`b8394e7`). Its base did not include the local journal, community and presentation work. This was a divergence between local and published sources, not evidence of deleted D1 data.

The full local state was preserved in `a78c960` before merging remote master. This integration retains both parent histories. No contract, deployment manifest, token basket, delegation, D1 cursor or bot configuration was changed.

## Reconciliation inventory

| Area | Integrated behavior |
| --- | --- |
| Camp and interior pages | Journal design, compact map, organic artwork, light/dark/system themes, local assets and accessible navigation restored. |
| Community | Telegram invitation and Discord Campfire in Camp, Governance and proposal details; on-demand WidgetBot and direct Discord fallback. |
| MANA market | Buy/sell panel in Camp and Delegation, exact decimal strings and fixed Polygon token identities; external Uniswap signing only. |
| Presentation | Human-readable deadlines, short addresses with exact disclosure, adaptive token precision; exact Max, transaction review and calldata preserved. |
| Voting | Vote results on decision rows, prior-vote checks, snapshot voting power and account/network invalidation preserved. Graph source and delayed-update labels added to the restored rows. |
| Graph primary reads | Remote Graph model, cache, query budget, indexed-count scope, incomplete-history notices and on-demand verification retained. |
| Wallet | Remote multi-account wallet-client fix, preflight, simulation and expired-health repair retained. Indexed data cannot authorize a signature. |
| Treasury and exit | Existing treasury, distinct native/bridged USDC, authorization display and pinned ragequit release unchanged. Live member reads retained for exit. |
| Drafts and proposals | Original routes, IDs, proposal contents, four-step drafts/import/export and Snapshot advisory archive preserved. |
| Indexing | Remote minute cron retained. Retired proposal-snapshot refresh cron is not reactivated; its table/helper remains for rollback. Both additive 0007 migrations are already applied remotely. |
| Telegram service | Existing worker and delivery behavior untouched. No notifications sent by this integration. |

## Validation

- Type generation, TypeScript and frontend build passed with existing dependencies.
- 215 unit tests passed across 32 files.
- Browser matrix: 138 distinct cases passed across the full run and targeted rerun; 14 conditional cases skipped (including duplicate visual matrix on mobile and opt-in fork lifecycle). Initial failures in two older tests came from a missing local API; those tests now use the controlled fixtures, and both pass at desktop/mobile sizes.
- Added an integration regression checking journal/community with Graph reads, indexed counts, confirmed zero versus unavailable, stale vote totals and ended-proposal guidance.
- Browser coverage includes themes, responsive/reflow checks, accessibility, precise amounts, drafts, wallet rejection, account/network changes, delegation, vote guards and exit protections. No real transaction was signed.
- Solidity: 44 tests passed; 2 opt-in fork tests skipped. Pinned source/artifact/review package check passed. No new fork claim is made.
- Wrangler staging dry run passed. Remote migrations list reports no migrations pending. Existing Graph-primary configuration and four secret bindings were checked without exposing values.
- Staged local recovery snapshot passed gitleaks; the final code and publication artifacts are scanned before release.

## Release discipline and rollback

Publish only the reconciled commit, with a clean source tree and recorded Vercel/Worker versions. Fetch remote master and verify it is an ancestor before promoting. Run the browser community and Graph integration cases in addition to build/unit checks. Never publish an older feature branch just because its build passes.

`dao.mythicalbeings.io` and `dao-preview.mythicalbeings.io` currently alias the same Vercel project and share the staging-named API. Promoting this project updates both domains; preview is not a separate release environment.

Previous frontend: `dpl_EsKciiNCaW7LmWs36dm8LCWTquL5`, `https://mythical-dao-preview-m7or4f4ve-palheiro1s-projects.vercel.app`.
Previous Worker: `c614679f-6937-4f87-b38b-516860c7e560` (`graph-primary-release`). Keep both recoverable. Rolling back does not require deleting or resetting D1.

Remaining service limits: Discord anonymous access may be denied by the existing channel permissions; the direct link remains available. Graph does not supply historical quorum in this schema, so ended proposals require a live execution check. Treasury event history can remain incomplete. These are explicitly presented, not replaced with guessed values.

Publication evidence and final version identifiers are recorded in `evidence/integration-2026-10-07/` after release verification.

## Published result

Published both domains from source `decd5ec` as Vercel `dpl_2H4nDUVGDiHdbw3oTjw6dZirbhWD`; Worker version `68eb6778-b474-4dcb-9f1b-16f7ba6e8fb1`. Public HTML, JS, CSS and community icons match the tested local build byte for byte on both aliases.

All eight public routes passed at 390/768/1440 px in both themes, with zero JavaScript errors or horizontal overflow. The public API returns the confirmed Telegram invitation and Campfire channel; three proposals are served by Graph and one treasury account by the RPC-backed cache. WidgetBot has no requests before opening, loads the exact channel and unloads on closing. Trade links preserve the input decimal string.

See [public verification](evidence/integration-2026-10-07/public-verification.json), [release identifiers](evidence/integration-2026-10-07/release.json), and [community screenshot](evidence/integration-2026-10-07/community-light-1440.png). Controlled regression screenshots are stored separately from the preserved October 2 evidence.

Disk remained around 293 GB available; existing dependencies were reused, no new installation or full checkout was created, and the 40 GB reserve was preserved.
