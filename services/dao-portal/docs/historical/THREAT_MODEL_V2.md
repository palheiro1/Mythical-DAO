# Threat model and contract specification

The immutable contracts are an initial implementation, **not independently audited**. No production deployment or real asset migration has been performed.

## Trust and permissions

- MANA remains the existing Polygon token, with 18 decimals. V2 uses its historical votes and total supply. The fork compatibility test exercised the deployed ABI; the original verified source and all economically relevant behavior still require independent review.
- Governor threshold: 250 × 10^18 at the previous block. Initial delay: 41,143 blocks. Initial period: 288,000 blocks.
- Quorum is **ceil(historical total supply × numerator / 100)**. Governor quorum counts for + abstain. Exact 2/3 passes, zero for votes never passes. For votes / 2 >= against avoids overflow.
- Timelock minimum: 259,200 seconds. One-time initializeGovernor grants Governor proposer/canceller, opens executor to address zero and revokes the initializing administrator. Subsequent grants cannot introduce an EOA administrator/proposer/canceller. Governor timelock replacement is disabled.
- The deployment procedure must verify **all** role history; a hostile bootstrap administrator could grant another administrator before initialization. Do not fund before reconciliation and revocation of all unexpected roles. The reproducible deployment script makes no such grants.
- Vault immutable timelock can pay native/ERC20 assets and transfer excluded NFTs. No general-purpose arbitrary execution, upgrade, privileged withdrawal or pause.
- Community contract has no treasury permissions. Rules freeze per ballot. 0 is abstention; 1..20 are the alternatives. Snapshot itself is Pending; voting is active from snapshot + 1 through deadline inclusive.

## Exit economics

For each of POL, WETH, USDC.e: floor(balance × burned MANA / supply before burn). Include MANA held by the vault in supply. No reservation for outstanding proposals. Independent minimums and an absolute deadline protect the quote. Recipient must be nonzero and not the vault.

BurnFrom is called against the member; supply and member balance deltas must equal the requested burn. SafeERC20 plus exact vault/recipient deltas reject fee and incompatible transfers. All payouts and burn share one reverting transaction under a reentrancy guard. A zero basket payout reverts. A paused external token can prevent the entire basket from redeeming; MANA remains intact.

Tokens held by a representative do not include the delegator's token ownership. Historical checkpoints preserve voting weights after burning, transferring, or redelegating.

## Data and transaction threats

| Threat | Mitigation / limit |
|---|---|
| RPC outage or disagreement | Independent HTTPS hosts, chain ID/head/hash checks, agreement on reads and exact call simulation; signing fails closed. Separate operators must actually be independent, which hostname checking alone cannot prove. |
| Index lag / stale RPC / fork | 64 confirmations in nonlocal environments; age/lag checks and anchor validation; atomic event+cursor batches; lease fencing; rewind to common checkpoints, or complete source replay. |
| SQL precision loss | uint256 values are decimal strings in event JSON and HTTP. No SQL REAL vote accounting. Snapshot archive is explicitly unverified off-chain evidence. |
| Altered executable proposal | Keccak ABI identifier recomputed from all targets, values, calldata and exact UTF-8 description. Raw events preserve signatures and complete identity. |
| Future state differs | Re-read and simulate exact wallet call before review and again before signing. Proposed actions are simulated sequentially via eth_simulateV1. A current-state revert is displayed and requires acknowledgement before publication; governance-only calls may require the approved execution context. RPC failure/divergence cannot be acknowledged away. Execute itself must simulate successfully. |
| Approval overreach | Portal requests the exact selected MANA amount and shows spender. No unlimited allowance UI. |
| XSS / misleading text | React text rendering, HTTPS discussion links, CSP, plaintext proposal content. No stored HTML injection. Raw/unknown calls remain explicit. |
| Wallet rejected/replaced/reverted | Separate pending, included, confirmed states. Wallet rejection is recoverable, replacement hash tracked, reverted receipt never reported successful. |
| Telegram unavailable | Separate Worker/database; deterministic identities and event deduplication. Portal has no dependency on Telegram. Telegram's residual delivery ambiguity after remote acceptance is documented in the bot README. |

## Independent review scope

Review all four contracts, compiler/OZ versions, initialization, role grants before sealing, exact burn behavior on the existing MANA, token transfer corner cases, snapshot and supermajority boundaries, front-running/slippage, cross-call reentrancy, batch simulation semantics, and the old Governor's actual authorization path. Tests and this author review are not substitutes for the independent review required by the plan.
