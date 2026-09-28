import { decodeFunctionData, formatUnits } from "viem";
import { vaultAbi, governorAbi, ballotsAbi, timelockAbi } from "./abis";
import type { Action, PortalConfig } from "./domain";
export function actionSummary(action: Action, config: PortalConfig): string {
  try {
    if (action.target.toLowerCase() === config.contracts.vault?.address) {
      const decoded = decodeFunctionData({ abi: vaultAbi, data: action.data });
      if (decoded.functionName === "payNative")
        return (
          "Pay " +
          formatUnits(decoded.args[1], 18) +
          " POL to " +
          decoded.args[0]
        );
      if (decoded.functionName === "payToken") {
        const [asset, to, value] = decoded.args;
        if (asset.toLowerCase() === config.contracts.usdc?.address)
          return "Pay " + formatUnits(value, 6) + " USDC.e to " + to;
        if (asset.toLowerCase() === config.contracts.weth?.address)
          return "Pay " + formatUnits(value, 18) + " WETH to " + to;
        return "Pay " + value + " base units of token " + asset + " to " + to;
      }
    }
    for (const [role, abi] of [
      ["governor", governorAbi],
      ["ballots", ballotsAbi],
      ["timelock", timelockAbi],
    ] as const) {
      if (action.target.toLowerCase() === config.contracts[role]?.address) {
        const call = decodeFunctionData({ abi, data: action.data });
        return (
          call.functionName + "(" + call.args?.map(String).join(", ") + ")"
        );
      }
    }
  } catch {
    /* Unrecognized calls retain their complete target and calldata in the review. */
  }
  return "Contract call — verify the target and exact calldata.";
}
