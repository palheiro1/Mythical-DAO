# Visual and UX implementation — 28 September 2026

The [visual plan](VISUAL_PLAN.md) is implemented in the existing local portal. Preview at **http://127.0.0.1:8787** while the local Worker is running. This update preserves the contracts, economic rules, ABIs, API endpoints, database schema, game authentication and Telegram service. It performs no public deployment or real transaction.

## Delivered

| Area | Implemented behavior |
|---|---|
| Identity | Unmodified official Mythical logos and asset icons, local system fonts, graphite/white surfaces, turquoise navigation and lime primary actions. Shared tokens provide readable light and dark variants. |
| Navigation | Compact header, separate proposal action, desktop sidebar, accessible mobile dialog, preserved hash routes and direct proposal links, secondary technical resources. |
| Themes | System preference on first visit; persistent System/Light/Dark selection. A local blocking script applies the theme before the application bundle loads. |
| Overview | Compact introduction, verified participation/treasury indicators, recent decisions, participation help and governance guide. Setup mode supports local drafts without fabricated activity. |
| Governance | Executable proposals and advisory ballots remain distinct. Cards expose author, state, original publication block and recognized payment summaries. Search explicitly covers the loaded page. |
| Proposal detail | Decision and consequences precede voting, timing and technical sources. Approval, timelock and execution remain distinct. Recognized actions use readable amounts/recipients; unknown calls are explicitly uninterpreted. Estimated dates retain authoritative block values. |
| Proposal wizard | Decision → Plan → Actions/Choices → Review. Field/step validation, acceptance-criteria and success-metric guidance, payment summary and explicit budget consistency confirmation. Existing version-1 drafts import/export/save unchanged without a wallet. The reviewed text reaches the wallet unchanged. |
| Treasury | Separate V2 and legacy holdings, official icons, exact balances/addresses/reference blocks, identified pending payments limited to loaded proposals, and an adjacent explanation that approvals do not reserve funds. Unavailable balances never become invented zeros. |
| Delegation | Separate MANA balance, voting power and representative; self-delegation and explanatory disabled states. The connected wallet opens a menu containing Disconnect. |
| Exit and review | Default connected-wallet recipient, explicit custom recipient, exact percentage-to-basis-point conversion (initial 0.5%, range 0–5%). Expected/minimum amounts and preview validity are visible. Approval and permanent burn remain separate. Relevant edits, wallet changes and expiry invalidate the review. Closing a dialog restores keyboard focus. |
| History | Original Governor, V2 and Snapshot remain separate. Snapshot uses the original decision date, with import date and verification limits inside provenance details. Exact timestamps are accessible and formatted in UTC. |
| Data and copy | Shared loading, setup, syncing, unavailable, confirmed-empty, available and stale states. Discriminated client types reflect the existing unavailable responses. UI copy is in the English catalog; proposal contents are not rewritten. |

## Validation

**34 logic/API tests and 45 browser tests passed.** The full browser suite deliberately skips its 11 duplicated matrix cases in the mobile runner: those cases explicitly exercise all viewport sizes in the desktop runner. Behavioral tests run separately on desktop and mobile.

- TypeScript checking and the production build passed.
- All eight top-level routes, executable/advisory detail views, the four populated wizard steps, and connected exit preview/review were checked in light and dark at **390, 768 and 1440 px**.
- All top-level routes and an active proposal detail passed horizontal-overflow checks at **320 px** and at **200% CSS zoom** in a 720 px viewport. This is a Chromium reflow check, not a separate operating-system magnification test.
- Automated axe checks reported no WCAG A/AA violations in the tested views, including open exit-review dialogs. Keyboard tests cover menu opening/closing, Escape, and focus restoration. Selected desktop/mobile captures were visually inspected; these checks do not claim a complete assistive-technology certification.
- Device-theme changes, persistent overrides and theme initialization with the application bundle blocked passed. No Google Fonts requests are made; graphical assets are local.
- Controlled fixtures exercise preparation, synchronization, unavailable/error, stale cached data, confirmed empty data and verified balances/proposals. The real local Worker remains in its honest setup state and serves the original archived Snapshot records.
- Draft import/export preserves the original schema and exact contents. Navigation between stages preserves edits. A decoded wallet request matches the reviewed proposal text and alternatives exactly. Editing the budget clears its confirmation.
- Wrong network, account changes, declined signatures, final simulation failure, reverted receipts and successful confirmation windows are checked. Replacement handling is retained and covered by receipt tests. Exit edits and expiry block stale acknowledgments and signing.
- Contracts, backend/indexer, ABIs, migrations and Telegram were unchanged in this visual update. Their initial implementation evidence remains in [the earlier validation report](evidence/VALIDATION.md).

Run the checks using the installed dependencies and browser:

```sh
npm run typecheck
npm test
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

Browser checks require the local Worker on port 8787. `PORTAL_TEST_URL` can select a different local preview. The existing test setup uses intercepted APIs and test wallets for active operations; it never requests a real signature.

[Build output](evidence/visual-build.txt), [type checking](evidence/visual-typecheck.txt), [logic/API test output](evidence/visual-unit.txt) and [browser output](evidence/visual-browser.txt) retain the bounded final command results. The [dialog capture check](evidence/visual-dialogs.txt) also passed after adjusting modal captures to use the viewport.

## Visual evidence and asset provenance

The [capture index](evidence/visual/README.md) covers both themes and all three primary widths. Files prefixed `controlled-` and `proposal-controlled-` contain explicitly synthetic test data, including balances, proposal text, addresses and transaction previews; they are not evidence of an active deployment or real treasury holdings.

| Example | Light | Dark |
|---|---|---|
| Overview, desktop | [1440 px](evidence/visual/overview-light-1440.png) | [1440 px](evidence/visual/overview-dark-1440.png) |
| Treasury, mobile fixture | [390 px](evidence/visual/controlled-treasury-light-390.png) | [390 px](evidence/visual/controlled-treasury-dark-390.png) |
| Completed proposal review | [1440 px](evidence/visual/controlled-review-light-1440.png) | [1440 px](evidence/visual/controlled-review-dark-1440.png) |
| Exit review, mobile fixture | [390 px](evidence/visual/controlled-exit-review-light-390.png) | [390 px](evidence/visual/controlled-exit-review-dark-390.png) |

The [asset inventory](visual-assets.json) records original paths/URLs and SHA-256 hashes. Mythical logos, MANA, WETH and Polygon artwork come from the local official wallet checkout. The unmodified USDC token SVG comes from [Circle’s official pressroom](https://www.circle.com/pressroom); the portal explicitly labels the asset **USDC.e**, preserving the distinction from native USDC. Functional governance icons are local SVG paths. No seasonal art or generated substitute logo is used.

## Compatibility and practical limits

- On-chain proposal list responses currently expose the original publication block rather than its timestamp. The portal displays that authoritative block; it does not manufacture a calendar date. Snapshot records preserve their original source timestamps and do not imply a verified on-chain outcome.
- Public activation remains the separate process described in [implementation status](IMPLEMENTATION_STATUS.md). Setup mode and disabled signing accurately reflect the absent public V2 configuration.
- The build retains a non-failing large-chunk warning for the wallet-enabled application bundle (about 692 kB before compression, 203 kB gzip).
- The English catalog is maintained with `npm run messages:sync`. It scans literal `m(...)` calls and includes the existing draft-section labels without changing stored keys or descriptions.
- Dependencies and the local Worker were reused. Disk preflight budgeted 0.5 GB of cumulative additional allocation and preserved the 40 GB reserve. Available space was about 45.53 GB before the refresh and 45.34 GB after validation; the captures occupy about 16 MiB. No user files, caches or operational backups were removed.
