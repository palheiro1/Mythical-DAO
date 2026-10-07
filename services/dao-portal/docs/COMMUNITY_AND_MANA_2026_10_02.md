# Community and MANA trading — delivery record

Public preview: https://dao-preview.mythicalbeings.io

The Camp now places **Stay connected** between recent decisions and the six existing destinations. It offers Telegram governance alerts, the Campfire Discord chat, and Buy / Sell MANA. Governance and proposal detail have compact community access; Delegation has a trading shortcut. Existing routes, the six-place map, contracts, drafts, exact transaction amounts and signature guards are preserved.

## Telegram

The user supplied `https://web.telegram.org/a/#-1004467111638`. It is configured as an **existing-member Telegram Web destination**, not a public invitation. The interface says “Open governance alerts” and explicitly explains that a join link for new members is not available yet. It does not claim a subscription or notification state. The existing bot and its 15-minute schedule were not modified, and no Telegram messages were sent.

A `https://t.me/name` public link or `https://t.me/+…` invitation is still needed for onboarding new members. Once supplied, replace `telegram.channelUrl` in the integration configuration; the interface switches to “Get governance alerts” with join instructions. No new frontend deployment is required for a configuration-only change after the Worker update.

## Discord

- Server: `809857155401646151`, reused from the wallet and verified as **Mythical Beings** in the live widget.
- Campfire channel supplied by the user: `1195328129435177041`.
- Direct URL: https://discord.com/channels/809857155401646151/1195328129435177041
- The wallet uses the **emerald.widgetbot.io** deployment. Testing the generic e.widgetbot.io endpoint returned “Server unavailable”; the implementation therefore uses the existing Emerald deployment, not the generic endpoint.

The iframe is created only after Open DAO chat and removed on close. It is isolated from the parent document and its wallet connection; no third-party script is injected into the portal. CSP permits only the specific Emerald frame origin. Escape, native modal focus containment and focus return are covered by browser tests. The direct Discord link remains visible even if the widget cannot load.

**Observed external limitation:** anonymous access to this DAO channel is denied by the existing Discord/WidgetBot permissions. This is displayed in the widget and the portal explains that existing channel access is required. Authenticated access with a DAO member account was not available for this automated check. No server roles, channel visibility or bot permissions were changed, and no Discord messages were posted. Any subsequent verification should use an existing authorized member; do not make the private channel public to remove the error.

## MANA trading

The local panel defaults to Buy MANA using native Polygon USDC, also supports WETH and Sell MANA, and accepts an optional exact input amount. Only the approved Polygon MANA, WETH and native USDC addresses from the deployment manifest are accepted. USDC.e cannot be substituted. The link builder rejects malformed amounts, excess token decimals, zero, overflow and unexpected token/network identities.

The Continue on Uniswap link passes `chain=polygon`, `inputCurrency`, `outputCurrency`, and, if supplied, `value` with `field=input`. It preserves decimal strings, including tiny fractions and values larger than JavaScript's safe integer range. No local quote, slippage, approval, transaction, new market API or polling is introduced. Uniswap supplies the final quote and signing flow. On return, existing membership/vote-status queries are invalidated once; the portal does not assume a swap succeeded.

[Real Uniswap verification](evidence/community-2026-10-02/external-verification.json) covers all eight combinations: buy/sell, USDC/WETH, amount present/absent. Both displayed inputs, token labels and the entered amount were inspected after rendering. No wallet was connected to Uniswap and no trade was submitted. Quote outputs in screenshots are incidental external data, not values exposed or promised by this portal.

## Configuration and source changes

- `deployments/integrations.json`: public destinations only. A deployment manifest's optional `integrations` field can override the defaults.
- `/api/config` adds optional `integrations.telegram.channelUrl` and `integrations.discord.{serverId,channelId,channelUrl}`. Invalid destinations are omitted independently; governance availability is unaffected. Discord and Uniswap origins are built centrally, never taken from page query parameters.
- `src/Community.tsx` and its stylesheet hold the shared section, shortcuts and dialogs. Responsive dialog limits and a container rule for existing Camp destinations also prevent overflow at 200% zoom.
- Service SVG marks are local Simple Icons assets; [provenance](../public/community/SOURCES.md). MANA and the existing Mythical Beings illustrations are reused. No packages were installed.

## Validation

- TypeScript and frontend build passed. Main bundle: about 752 kB / 221 kB gzip; the existing large-chunk warning remains.
- Full unit suite: **200 passed across 30 files**, including 23 new URL/configuration/precision tests.
- New community browser suite: **14 passed**, desktop and mobile. It covers lazy iframe loading, close/Escape/focus, denied/blocked chat fallback, missing configuration, eight trade link combinations, input errors, disconnected wallet, revalidation after returning, accessibility, both themes, 320 px and 200% reflow.
- Existing flows/results/visual regression run: **24 passed** initially and one infrastructure failure while a concurrent build temporarily replaced the local static output. The failed exit-preview test was rerun on the stable build and **passed**. This includes the existing 390/768/1440 theme matrix.
- Exact static upload artifact scanned with Gitleaks: **no secrets found**. `git diff --check` passed.
- [Public screenshots and runtime checks](evidence/community-2026-10-02/public-verification.json) record the final preview: six theme/width combinations, no JavaScript errors or horizontal overflow, and all six checked static artifacts match local hashes. Real external service limitations are retained rather than mocked away. [Screenshot gallery](evidence/community-2026-10-02/index.html).

## Publication and rollback

Frontend: `dpl_AUy3U3xD1XAFSkt1rrPStkfxqrCr`, https://mythical-dao-preview-ljyy45uik-palheiro1s-projects.vercel.app . It was verified before promotion to the existing preview domain.

Worker staging: `8f5dd029-d252-4a8d-9f38-a85d34b1d7a9`. No database migration was required.

Previous recoverable frontend: `dpl_FUC7NjoC8DSnXUBxXAnufamxEcvF`, https://mythical-dao-preview-26fblav25-palheiro1s-projects.vercel.app . Previous Worker: `ec3d5e67-7b64-4aef-b788-a43baec9130d`. This task's pre-edit source copies and bounded logs are kept in ignored `.task-community/` for selective rollback; earlier unrelated workspace edits were preserved.

Disk preflight passed with a 0.5 GB cumulative task estimate: initial available space **319.43 GB**, later **319.35 GB**, above the mandatory 40 GB reserve. Existing dependencies and local preview servers were reused.

References: [Uniswap custom links](https://developers.uniswap.org/docs/trading/custom-interface-links), [WidgetBot iframe](https://docs.widgetbot.io/tutorial/iframes), [WidgetBot deployment option](https://docs.widgetbot.io/embed/html-embed/attributes).

## Channel-name clarification

The user confirmed that Discord channel `1195328129435177041` is named **Campfire**. The card, dialog and accessible iframe title now use that name; the Telegram destination and Discord server/channel IDs are unchanged.

The label correction passed TypeScript/build and all four affected desktop/mobile browser checks (lazy loading, exact destination, Escape, focus restoration and blocked-widget fallback). Static artifacts passed the secret scan. Frontend deployment `dpl_4XMfXFeAUqAsqC6Pyxa77HyHu8Ap` (https://mythical-dao-preview-8kvld1s5l-palheiro1s-projects.vercel.app) was verified and promoted to the preview domain. The immediately preceding frontend deployment above remains recoverable. No backend change or Worker deployment was needed for this copy correction.

## Public Telegram onboarding follow-up

See [public alerts preparation and activation](TELEGRAM_PUBLIC_ALERTS.md) for the latest frontend deployment and remaining channel-link dependency. The current interface distinguishes pending public access from an existing-member Telegram Web link. Once a confirmed public/invitation URL is configured, it explicitly states that no MANA or wallet connection is required.
