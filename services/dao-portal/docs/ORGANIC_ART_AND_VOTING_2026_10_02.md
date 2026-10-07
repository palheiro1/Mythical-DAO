# Organic art, live proposal results and delegation diagnosis

Preview: https://dao-preview.mythicalbeings.io

## Verified voting figures

The current ragequit authorization proposal uses snapshot **94815126**, timestamp **2026-10-02 07:57:09 UTC / 09:57:09 Europe/Madrid**. Independent Infura and Tenderly reads agree on the Governor's historical voting power. Raw integer evidence is in [account-snapshot.json](evidence/organic-votes-2026-10-02/account-snapshot.json) and [account-snapshot-secondary.json](evidence/organic-votes-2026-10-02/account-snapshot-secondary.json).

| Wallet | MANA balance at inspection | Weight for this proposal | Voted |
|---|---:|---:|---|
| `0xc4ccc6a11329558582c2da79c18a9aeac00f59f9` | 33,670.936971428589697113 | 33,670.936971428589697113 | Yes |
| `0x09bff4758b652309704079f8a3cf271a2cf6220e` | 17,009 | 1,000 | Yes |
| `0xa8938ced402299c359b2f82a5b68b45ea158e2f5` | 318,067.699999999999999999 | 0 | No |
| `0xb96a76ad90b28690250c4ed734942a4224997c52` | 147,250 | 0 | No |

For votes total **34,670.936971428589697113**, matching both the Governor and The Graph. The current 17,009 balance is not retroactively counted as 17,009 votes. The two undelegated wallets have a zero representative and no historical voting power in this proposal. Self-delegation is valid for both in read-only contract simulations; balances of about 50.48 and 0.78 POL exceed the observed fee estimate (~0.031 POL). Delegating now affects future proposal snapshots, not this vote. No transactions were signed or submitted.

## Causes and changes

- Missing second-voter feedback: the UI previously checked `hasVoted` only when preparing an operation. A fresh wallet-specific lookup now disables duplicate voting, checks again at review, and resets on account/network changes. It also displays the Governor's voting power for the proposal beside the current MANA balance. A failed check never enables voting.
- RPC and Worker pressure: repeated proposal discovery, totals, quorum and health reads for every visitor exceeded the free Worker's CPU budget in observed requests. Public dRPC also returned rate-limit failures. A scheduled, additive D1 presentation snapshot now serves proposal totals and health without RPC fan-out per page visit. Totals are fetched using Multicall3 at the same block from two providers. Expired results remain visible with a delayed label; they never become invented zeros or an actionable verified state.
- Scheduled refresh and indexing share a free Worker subrequest ceiling. They now use separate invocations. The existing minute trigger renews presentation data once older than 90 seconds, as a fallback for the dedicated two-minute trigger. Failed refreshes retain the previous verified results. No D1 event history or cursor was deleted.
- Delegation could be disabled by an expired general health check; fixing the scheduled refresh restores the verified availability check. Browser testing also reproduced a distinct intermittent dRPC failure in membership reads/preflight. The five membership contract reads are grouped in one Multicall per provider. Membership reads and delegation preflight now use the configured metered Infura primary plus the independent secondary. The normal chain identity, block agreement, operation verification, caller simulation and final pre-sign checks remain mandatory. Infura estimates and fee queries are accounted for in the same persisted free-tier budget.
- Every executable proposal card, open or closed, now shows For / Against / Abstain totals, a proportional result bar and verification time. Presentation remains approximate where appropriate; details expose exact integers/decimals.

The Graph remains useful for historical discovery and results cross-checking, reducing archive RPC demand. It does not substitute for simulation, permissions or present-state checks before signing. Existing hourly comparison and query-budget controls remain. Independent historical sync is still incomplete; it does not mean the current proposal's displayed totals are only partially counted. Other uncached APIs can still report temporary unavailability under provider load. During the final public capture, the initial treasury probe returned 503; this is recorded rather than hidden.

## Artwork

Seven contextual watercolor scenes were produced with the built-in **imagegen** tool using official illustrations as references: Grootslang/Treasury, Haechi/Council, Wati-kutjara/Delegation, Tulpar/Departure, Sumangâ/Planning, Şahmaran/Guide and Garuda/Camp. Alpha-transparent responsive WebPs replace the rectangular print treatment. Originals and previous assets remain recoverable.

- Saved frontend assets: `public/journal/organic/` (480 / 960 px variants).
- [Exact generation prompts and source outputs](organic-art-prompts.json).
- [Provenance, dimensions, hashes and uses](journal-assets.json).
- [Art direction and source notes](JOURNAL_ART.md).

All text, links, amounts, navigation and transaction controls remain HTML. The artwork does not invent new canonical positions for the creatures. No token amounts, Max, calldata, drafts, ABIs, contract deployments or signing permissions were changed by the visual work.

## Validation

- Full unit suite: **176 passed, 29 files** after historical voting-power support. The subsequent delegation transport and membership batching changes passed **49 targeted tests**; the scheduling fallback passed its regression test. TypeScript passed.
- Frontend build passed; the existing >500 kB chunk warning remains (main JS ~740 kB / ~218 kB gzip). No new dependency installation.
- Browser functional matrix before the final voting-power addition: **49 passed, 1 skipped**. Final affected flows and voting-power scenarios: **28 passed** across desktop/mobile. Coverage includes wallet changes, duplicate-vote prevention, lookup failure, updated totals, exact calldata, failed final simulation, drafts and rejection handling.
- Visual/a11y matrix: **11 passed**, including both themes at 390/768/1440, 320 px and 200% reflow, keyboard/focus and reduced motion. Real public capture: **36 page/theme/width combinations**, no JavaScript errors or horizontal overflow; one initial treasury API availability observation. [Public capture report](evidence/organic-votes-2026-10-02/public-verification.json) and [visual gallery with preceding deploy and wallet references](evidence/organic-votes-2026-10-02/index.html).
- All 49 deployed static artifacts checked against local SHA-256 during capture. Gitleaks found no secrets in the exact Vercel upload artifact. Raw operational tail logs remain ignored and are not included in public evidence.
- Final deployed API verification: both membership reads and both simulations delegating to `0xc4cc…59f9` returned HTTP 200. Membership reads took 4.8–6.6 seconds; delegation preflight took 13.2–23.1 seconds under the shared free-tier limiter. [Exact final API evidence](evidence/organic-votes-2026-10-02/final-api-check.json).
- Both supplied accounts reached the self-delegation review on the public site; [read-only review evidence](evidence/organic-votes-2026-10-02/delegation-review.json). Browser delegation verification uses public APIs and a read-only test wallet provider for the supplied addresses; it cannot sign. It is not represented as a real MetaMask transaction.

## Release and rollback

Worker staging: `ec3d5e67-7b64-4aef-b788-a43baec9130d`.

Frontend preview: `dpl_FUC7NjoC8DSnXUBxXAnufamxEcvF`, immutable URL https://mythical-dao-preview-26fblav25-palheiro1s-projects.vercel.app .

Previous Stage B frontend remains available as `dpl_28WwZfyQNj2UwM6LXP17dfnXNBBK`, https://mythical-dao-preview-kg6gunr7o-palheiro1s-projects.vercel.app . Worker before this task: `f1259842-669b-4ab8-af57-1e1b0d8ed1b6`. The new `0007_public_proposal_snapshot.sql` is additive and can remain present during rollback. No treasury operation, contract deployment or Telegram service change was made.

Disk preflight passed for the original 1.5 GB estimate. Available space was initially 327.46 GB; later system-wide availability was 324.31 GB, a larger change than these artifacts explain. A further 1 GB preflight passed with the 40 GB reserve intact. Task logs are ~3 MB, each build output ~5.5 MB, and this capture folder ~12 MB before final review captures. Concurrent system activity was present; no attribution or cleanup of unrelated data was attempted.

Technical references: [Infura method credit costs](https://docs.infura.io/get-started/pricing/credit-cost/), [Cloudflare cron propagation](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [The Graph query API](https://thegraph.com/docs/en/subgraphs/querying/graphql-api/), [Viem multicall](https://viem.sh/docs/contract/multicall).

Final available disk space: **324.32 GB**; reserve preserved. No unrelated files were deleted.
