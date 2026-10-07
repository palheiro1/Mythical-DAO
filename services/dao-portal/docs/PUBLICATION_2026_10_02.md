# Publication — dao.mythicalbeings.io

Published on 2026-10-02. Public URL: https://dao.mythicalbeings.io . The preview https://dao-preview.mythicalbeings.io remains available.

## Hosting and rollback

Both hostnames serve the previously validated immutable Vercel frontend `dpl_8ZH4LSN2vwtAqb6GxF1YLkkXQ3JW` in project `mythical-dao-preview` (`prj_0vM52DURDanudxowbZKwzWMcIdnd`). No frontend redesign or rebuild upload was needed. They share the existing Cloudflare API/indexer and D1 database; no new indexing service or database migration was introduced. The infrastructure environment still has the name `staging`; publishing a hostname does not create backend isolation.

Worker version after the Telegram/origin update: `cf5b79c5-f608-436d-9fcc-71dd8bae79f9`. Previous version: `8f5dd029-d252-4a8d-9f38-a85d34b1d7a9`. To roll back the frontend, assign an earlier validated immutable deployment to the intended hostname. Do not use project-wide promotion for a preview-only change: the two domains now belong to the same Vercel project. API deployments affect both domains.

DNS before publication: `dao` CNAME `mythicaldao.charmverse.io`, proxied, TTL automatic. It returned HTTP 530. DNS now: `dao` CNAME `cname.vercel-dns.com`, DNS only, TTL automatic (Vercel's recommended target). Added TXT `_vercel` with value `vc-domain-verify=dao.mythicalbeings.io,ba0ddf9a06866899fad8`. Preserved the separate preview verification TXT and all other DNS records. Vercel reports ownership verified and DNS correctly configured. Its automatic certificate issuance completed; HTTPS was checked with normal certificate validation.

If restoring the earlier external destination, restore the recorded CNAME and proxy setting; note that the earlier destination was already unavailable. No CharmVerse content was deleted.

## Application changes

- `PORTAL_ORIGIN` now uses `https://dao.mythicalbeings.io`.
- `PORTAL_PREVIEW_ORIGIN` permits exactly `https://dao-preview.mythicalbeings.io` for existing same-site API POSTs through Vercel. Unrelated origins and lookalike domains remain rejected. Wrangler bindings regenerated.
- Telegram destination now uses the verified invite `https://t.me/+yod9k6rLKOo5YjQ8`. Telegram's channel settings showed a private channel, owner plus governance bot as the two administrators, no linked discussion group, and a primary link allowing people to join. The external landing page identifies **Mythical DAO Governance** and offers **Join Channel**. No Telegram permissions, messages or membership were changed.

## Verification and limits

- TypeScript and build passed; 41 relevant unit tests passed, including both authorized origins and lookalike-origin rejection.
- Public API checks on both hostnames: config 200; canonical URL and invite correct; an empty transaction is rejected with 400, while an unrelated Origin is rejected with 403. No real transaction was submitted.
- Six public browser checks (390/768/1440 px, light/dark) passed without page JavaScript errors or horizontal overflow. Static artifact hashes match the local validated build. Telegram, MANA trading access, Governance/Delegation navigation and lazy Discord lifecycle checked.
- Historical sync remains in progress. Health reported `signingAllowed: true`, `historyComplete: false`. Publication does not claim complete historical metrics or a completed real-wallet transaction.
- Anonymous Discord access remains denied by the channel's existing permissions; the direct Discord link remains available.
- Existing `noindex` response header remains unchanged; search-engine indexing was not part of this publication.
- Evidence: [API checks](evidence/publication-2026-10-02/api-verification.json), [browser checks and asset hashes](evidence/publication-2026-10-02/public-verification.json), screenshots in the same directory.

Disk preflight passed with a 0.5 GB cumulative estimate. Available space: 319.15 GB before, 319.12 GB after. Existing dependencies reused.
