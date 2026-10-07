# Public governance alerts

## Intended onboarding

Alerts are open to everyone. Holding MANA, connecting a wallet, signing a message or linking a Telegram identity to a wallet is not required.

Camp, Governance and proposal detail reuse the same configured Telegram destination. With a confirmed `https://t.me/<channel>` or `https://t.me/+<invite>` URL, the portal displays **Get governance alerts**. Visitors open Telegram, join the channel and enable notifications there. The portal never claims that someone has joined or enabled notifications.

Governor and Snapshot alerts continue through the existing bot's periodic checks. This change does not create a new subscription service or modify governance eligibility.

## Activation dependency

The only confirmed destination is currently `https://web.telegram.org/a/#-1004467111638`. It is retained for existing members, with an explicit explanation that public onboarding is pending. No public username or invitation has been invented.

Telegram Web in the available Chrome session requires login. No local bot credentials were found in either bot service's environment files. No Telegram permissions or messages have been changed.

An administrator should open the **existing alerts channel** (ID `-1004467111638`) and provide either:

- Its public channel link, if a public username is configured; or
- A dedicated portal invitation, without expiration, usage limits, paid subscription or administrator approval. Give it a recognizable internal name such as `DAO portal alerts`. An invitation provides open enrollment to anyone with the link; it does not make the channel publicly searchable.

Use the channel's information/edit screen to inspect Channel type or Invite links; exact labels vary by Telegram client. Do not supply a bot profile, message link or the browser's internal `web.telegram.org` address.

## Completing deployment once the link is confirmed

1. Verify that the link names the intended alerts channel and offers Join, rather than Request to join or a paid subscription. Check from a non-member account without joining automatically on behalf of the user.
2. Change only `telegram.channelUrl` in `deployments/integrations.json`. If the deployment manifest overrides `integrations`, update that override too. Keep Discord unchanged.
3. Run type checking, the integration tests and relevant community browser checks. Build and deploy the staging portal Worker using the existing environment and secrets; no database migration or bot deployment is needed.
4. Confirm `/api/config` on `https://dao-preview.mythicalbeings.io` returns the confirmed URL, then verify Camp, Governance and proposal detail show **Get governance alerts** and the exact destination with a disconnected wallet.
5. Verify the mobile and desktop Telegram landing pages. The user can perform the final Join and notification preference steps in their own Telegram account.

The frontend public-access copy is prepared separately; while the Web-only destination remains configured, it must continue to show the pending-access explanation. Revoking a dedicated invitation later requires updating the portal destination; do not revoke other existing invitations.

Reference: [Telegram Bot API — invite links](https://core.telegram.org/bots/api#createchatinvitelink). Creating an invitation through the bot requires appropriate administrator rights. No such API operation was performed for this preparation.

## Preparation verification — 2026-10-02

TypeScript/build passed, as did 23 integration unit tests and four relevant desktop/mobile browser checks. The static deployment artifact passed the secret scan. No packages were installed. Disk availability before this small preparation was 319.29 GB; the build reuses the existing dependencies and output directories.

Prepared copy deployed to the existing preview: `dpl_8ZH4LSN2vwtAqb6GxF1YLkkXQ3JW`, https://mythical-dao-preview-nnm7vz79g-palheiro1s-projects.vercel.app . Its index was verified before promotion. Previous recoverable frontend: `dpl_4XMfXFeAUqAsqC6Pyxa77HyHu8Ap`. The Worker and configured Telegram URL are unchanged; **public enrollment is still pending the confirmed join link**.

## Activated — 2026-10-02

The previous join-link dependency is resolved. The channel's primary invite was found and verified in Telegram: `https://t.me/+yod9k6rLKOo5YjQ8`. It is configured on both the public portal and preview. The channel remains private by type (not publicly searchable), open to readers via invitation, with no linked discussion group. Owner and governance bot are its only administrators. See [publication record](PUBLICATION_2026_10_02.md).
