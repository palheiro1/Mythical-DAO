import type { PublicClient } from "viem";
import { basketAssets } from "../shared/assets";
import { ragequitAbi, tokenAbi } from "../shared/abis";
import { redeemAmounts, type PortalConfig } from "../shared/domain";
import { agreed, RpcFault } from "./rpc";
import {
  assertRagequitCode,
  assertRagequitConfiguration,
} from "../shared/ragequit-security";

export async function redeemPreview(
  cfg: PortalConfig,
  pair: [PublicClient, PublicClient],
  amount: bigint,
  blockNumber: bigint,
  attestationBlock = blockNumber,
) {
  const module = cfg.contracts.ragequitModule?.address ?? null;
  const treasury = cfg.contracts.treasury!.address;
  const mana = cfg.contracts.mana!.address;
  const assets = basketAssets(cfg);
  const anchors = () =>
    agreed(pair, async (c) => {
      const state = (await c.getBlock({ blockNumber })).hash;
      const code =
        attestationBlock === blockNumber
          ? state
          : (await c.getBlock({ blockNumber: attestationBlock })).hash;
      if (!state || !code) throw new RpcFault("RAGEQUIT_BLOCK_UNAVAILABLE");
      return [state, code];
    });
  const hashes = await anchors();
  const { supply, balances, allowances, identity, quoted, attestationError } =
    await agreed(pair, async (c) => {
      let attestationError: string | null = null;
      if (module) {
        try {
          assertRagequitConfiguration(cfg);
          assertRagequitCode(
            await c.getCode({ address: module, blockNumber: attestationBlock }),
          );
        } catch {
          attestationError =
            "The configured ragequit module could not be verified against this portal release. MANA authorization is unavailable.";
        }
      }
      const [supply, balances, allowances] = await Promise.all([
        c.readContract({
          address: mana,
          abi: tokenAbi,
          functionName: "totalSupply",
          blockNumber,
        }),
        Promise.all(
          assets.map((a) =>
            c.readContract({
              address: a.address!,
              abi: tokenAbi,
              functionName: "balanceOf",
              args: [treasury],
              blockNumber,
            }),
          ),
        ),
        Promise.all(
          assets.map((a) =>
            module
              ? c.readContract({
                  address: a.address!,
                  abi: tokenAbi,
                  functionName: "allowance",
                  args: [treasury, module],
                  blockNumber,
                })
              : 0n,
          ),
        ),
      ]);
      const identity =
        module && !attestationError
          ? await Promise.all([
              c.readContract({
                address: module,
                abi: ragequitAbi,
                functionName: "treasury",
                blockNumber,
              }),
              c.readContract({
                address: module,
                abi: ragequitAbi,
                functionName: "mana",
                blockNumber,
              }),
              c.readContract({
                address: module,
                abi: ragequitAbi,
                functionName: "basket",
                blockNumber,
              }),
            ])
          : null;
      const quoted =
        module && !attestationError
          ? await c.readContract({
              address: module,
              abi: ragequitAbi,
              functionName: "previewRedeem",
              args: [amount],
              blockNumber,
            })
          : null;
      return {
        supply,
        balances,
        allowances,
        identity,
        quoted,
        attestationError,
      };
    });
  if (JSON.stringify(await anchors()) !== JSON.stringify(hashes))
    throw new RpcFault("RAGEQUIT_BLOCK_CHANGED");
  const amounts = redeemAmounts(balances, amount, supply);
  const reasons: string[] = [];
  if (attestationError) reasons.push(attestationError);
  if (!module)
    reasons.push("The ragequit module has not been deployed and configured.");
  if (
    identity &&
    (identity[0].toLowerCase() !== treasury.toLowerCase() ||
      identity[1].toLowerCase() !== mana.toLowerCase() ||
      identity[2].some(
        (a, i) => a.toLowerCase() !== assets[i].address?.toLowerCase(),
      ))
  )
    reasons.push(
      "The module identity does not match this treasury, MANA and basket.",
    );
  if (quoted?.some((a, i) => a !== amounts[i]))
    reasons.push("The module quote does not match the proportional formula.");
  if (amounts.every((a) => a === 0n))
    reasons.push("This amount would receive zero across all three assets.");
  if (module)
    assets.forEach((a, i) => {
      if (amounts[i] > allowances[i])
        reasons.push(
          `${a.symbol}: the exit exceeds the treasury allowance. A DAO authorization is required.`,
        );
    });
  return {
    module,
    treasury,
    mana,
    basket: assets.map((a, i) => ({
      ...a,
      balance: balances[i],
      allowance: allowances[i],
      amount: amounts[i],
    })),
    amounts,
    supply,
    block: String(blockNumber),
    blockHash: hashes[0],
    attestationBlock: String(attestationBlock),
    attestationBlockHash: hashes[1],
    available: reasons.length === 0,
    reasons,
    checkedAt: new Date().toISOString(),
  };
}
