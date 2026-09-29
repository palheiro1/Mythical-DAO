import { knownAsset } from "./assets";
import { m } from "../src/i18n";
import { decodeFunctionData, formatUnits } from "viem";
import {
  tokenAbi,
  vaultAbi,
  governorAbi,
  ballotsAbi,
  timelockAbi,
} from "./abis";
import type { Action, PortalConfig } from "./domain";
export function actionSummary(action: Action, config: PortalConfig): string {
  if (action.data === "0x" && BigInt(action.value) > 0n)
    return `Pay ${formatUnits(BigInt(action.value), 18)} POL to ${action.target}`;
  try {
    const call = decodeFunctionData({ abi: tokenAbi, data: action.data });
    if (call.functionName === "transfer" || call.functionName === "approve") {
      const asset = knownAsset(action.target, config);
      const value = asset
        ? formatUnits(call.args[1], asset.decimals)
        : String(call.args[1]);
      const symbol = asset?.symbol ?? `base units of ${action.target}`;
      return call.functionName === "transfer"
        ? `Pay ${value} ${symbol} to ${call.args[0]}`
        : `Authorize ${call.args[1] === 2n ** 256n - 1n ? "unlimited" : value} ${symbol} spending by ${call.args[0]}. This grants an allowance; it is not a payment.`;
    }
  } catch {
    /* Decode historical or governance calls below. */
  }
  try {
    if (
      action.target.toLowerCase() ===
      config.contracts.vault?.address.toLowerCase()
    ) {
      const decoded = decodeFunctionData({ abi: vaultAbi, data: action.data });
      if (decoded.functionName === "payNative")
        return (
          m("Pay ") +
          formatUnits(decoded.args[1], 18) +
          m(" POL to ") +
          decoded.args[0]
        );
      if (decoded.functionName === "payToken") {
        const [asset, to, value] = decoded.args;
        if (
          asset.toLowerCase() === config.contracts.usdc?.address.toLowerCase()
        )
          return m("Pay ") + formatUnits(value, 6) + " USDC.e to " + to;
        if (
          asset.toLowerCase() === config.contracts.weth?.address.toLowerCase()
        )
          return m("Pay ") + formatUnits(value, 18) + " WETH to " + to;
        return (
          m("Pay ") +
          value +
          m(" base units of token ") +
          asset +
          m(" to ") +
          to
        );
      }
    }
    for (const [role, abi] of [
      ["governor", governorAbi],
      ["ballots", ballotsAbi],
      ["timelock", timelockAbi],
    ] as const) {
      if (
        action.target.toLowerCase() ===
        config.contracts[role]?.address.toLowerCase()
      ) {
        const call = decodeFunctionData({ abi, data: action.data });
        const value = String(call.args?.[0] ?? "");
        if (call.functionName === "setVotingDelay")
          return m("Set voting delay to {value} blocks.", { value });
        if (call.functionName === "setVotingPeriod")
          return m("Set voting period to {value} blocks.", { value });
        if (call.functionName === "setProposalThreshold")
          return m("Set the proposal threshold to {value} MANA.", {
            value: formatUnits(BigInt(value), 18),
          });
        if (call.functionName === "updateQuorumNumerator")
          return m("Set quorum to {value}% of historical supply.", { value });
        if (call.functionName === "updateDelay")
          return m("Set the timelock delay to {value} seconds.", { value });
        if (call.functionName === "setRules")
          return m(
            "Update community ballot rules. Review the exact parameters in the technical details.",
          );
        return m(
          "Contract call: {name}. Review its exact parameters before signing.",
          { name: call.functionName },
        );
      }
    }
  } catch {
    /* Unrecognized calls retain their complete target and calldata in the review. */
  }
  return m(
    "Unrecognized contract call. Its effects have not been interpreted.",
  );
}
