# Implementation status — 2026-09-28

The local software implementation is delivered for review. **The production launch described in the plan is not complete.** No production contracts, asset transfers, domain changes, Telegram messages or Cloudflare deployments were performed.

| Plan area | Implemented locally | Remaining release evidence |
|---|---|---|
| Specification | Contract/economic rules, threat model, initial manifest, source references | Independently verified old permissions, complete revenue inventory and owners |
| Contracts | Four immutable contracts, Foundry tests/fuzzing, successful 31-transaction local rehearsal, deployment/verification scripts | Independent audit, Amoy deployment and full testnet rehearsal |
| Portal | English responsive UI, browser wallets/optional WalletConnect, drafts/import/export, proposal/vote/queue/execute/cancel, delegation, treasury, atomic exit review | WalletConnect project ID, real contract manifest and live wallet acceptance |
| Data | D1 migrations, bounded dual-RPC index, fencing/deduplication, reorg replay, OpenAPI, confirmation/health checks | Archive-capable providers, complete on-chain backfill and restore drill on target Cloudflare account |
| Historical records | Eight publicly available Snapshot proposals retained and imported into local D1 | Scores/signatures remain unverified off-chain history, explicitly labeled |
| Notifications | Existing bot source preserved; isolated copy adapted with portal mode, composite identity and silent seed | Staging channel validation and approved single-publisher cutover |
| Review/launch | 93 passing automated tests, complete local governance/exit rehearsal, local D1 export/restore, migration payload preparation, release gates | Independent review, DAO approval, exact old-system fork rehearsal, asset/revenue reconciliation, real small exit, domain activation |

The subsequent [visual and UX refresh](VISUAL_UX_REVIEW.md) is also delivered locally, with official assets, light/dark themes, revised governance flows and updated browser evidence. It does not change the public release requirements above.

No start-block guess is presented as confirmed evidence: the MANA deployment block remains 0 (safe complete replay) because the tested public RPC lacked deep historical state. The known legacy Governor start block is sourced from the existing bot.

The portal marks absent configuration as setup mode and keeps signing disabled until the real deployment and current indexed chain agree. These pending external steps cannot be replaced by mock results or the implementer's tests.
