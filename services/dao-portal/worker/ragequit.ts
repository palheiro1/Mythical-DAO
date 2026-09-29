import type { PublicClient } from "viem";
import { basketAssets } from "../shared/assets";
import { ragequitAbi, tokenAbi } from "../shared/abis";
import { redeemAmounts, type PortalConfig } from "../shared/domain";
import { agreed } from "./rpc";

export async function redeemPreview(
  cfg: PortalConfig,
  pair: [PublicClient, PublicClient],
  amount: bigint,
  blockNumber: bigint,
) {
  const module = cfg.contracts.ragequitModule?.address ?? null;
  const treasury = cfg.contracts.treasury!.address;
  const mana = cfg.contracts.mana!.address;
  const assets = basketAssets(cfg);
  const { supply, balances, allowances, identity, quoted } = await agreed(
    pair,
    async (c) => {
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
      const identity = module
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
      const quoted = module
        ? await c.readContract({
            address: module,
            abi: ragequitAbi,
            functionName: "previewRedeem",
            args: [amount],
            blockNumber,
          })
        : null;
      return { supply, balances, allowances, identity, quoted };
    },
  );
  const amounts = redeemAmounts(balances, amount, supply);
  const reasons: string[] = [];
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
    available: reasons.length === 0,
    reasons,
    checkedAt: new Date().toISOString(),
  };
}
