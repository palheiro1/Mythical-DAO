> Relatório histórico da V2. A validação atual da arquitetura sem migração está em [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md).

# Validation evidence — 2026-09-28

Executed locally against this implementation. These results are implementation evidence, not an independent contract audit or a production acceptance sign-off.

| Check | Result |
|---|---|
| Solidity / Foundry | 23 tests passed, including the optional compatibility check against deployed Polygon MANA. The conservation property ran 256 fuzz cases. |
| Portal / API / indexer | 28 tests passed across six files: integer economics, proposal identity, drafts, dual-RPC faults, stale timestamps, D1 fencing, duplicate events, interrupted replay, reorg recovery, pagination and transaction replacements. |
| Browser | 14 tests passed across desktop (1440 px) and mobile (390 px). Routes, drafts, disconnected wallets, wrong network, RPC disagreement, declined signatures, reverted receipts, overflow and automated accessibility checks. |
| Telegram | 28 tests passed; TypeScript and ESLint passed. Original service source was preserved. |
| Full local chain rehearsal | 31 successful transactions; full 41,143-block delay and 288,000-block voting period. Propose → vote → queue → ragequit during timelock → execute, with early execution and insufficient payment rejected. See [transaction evidence](../../deployments/local-rehearsal.json). |
| Local recovery | SQL export restored into an isolated D1 database; all rows matched. See [checksum and table counts](local-recovery.json). |
| TypeScript / production assets | Type checking and Vite build passed. |
| Cloudflare packaging | Staging `wrangler deploy --dry-run` passed. No deployment was performed. |

Total: **93 passing automated tests**, plus the 31-transaction local rehearsal, recovery and packaging checks.

Browser tests block Tally, Snapshot and CharmVerse. Wallet error tests use an injected test wallet and intercepted RPC responses, without real signatures or funds. The local recovery fixture contains eight archived Snapshot records and no production indexed events. Reorg/replay tests use actual isolated D1 instances and controlled RPC fixtures. The Polygon compatibility check is read-only and does not exercise a real funded exit.

The rehearsal uses mock basket assets and unlocked Anvil accounts. It mines the complete configured voting period and advances only the local clock through the 72-hour wait. Anvil historical state caching is disabled to avoid repeatedly copying growing state; token voting checkpoints remain intact. This proves local behavior, not a public-network deployment.

The Vite build reports a non-failing bundle-size warning for the wallet-enabled application chunk (about 634 kB before compression). WalletConnect still needs a project ID and live-device acceptance.

A [desktop screenshot](portal-desktop.png) records the local setup-mode UI. The application intentionally shows configuration status instead of fabricated live proposals or treasury balances.

Disk preflight budgeted 2 GB of cumulative additional allocation. Available space was approximately 47.2 GB before substantial work and 45.7 GB after builds, above the 40 GB reserve. The portal environment occupies approximately 709 MiB; the Telegram source copy reuses the existing dependency installation through an ignored local symlink. No user project, cache or operational backup was removed.

Public-network deployment, independent review, full archive backfill, target-account recovery, a real small exit, and migration/revenue reconciliation remain listed in [implementation status](../IMPLEMENTATION_STATUS.md).
