import { decodeFunctionData, formatUnits } from "viem";
import { vaultAbi } from "../shared/abis";
import type { Action, PortalConfig, Proposal } from "../shared/domain";
export interface Payment {
  recipient: string;
  symbol: string;
  quantity: string;
  token?: string;
}
export function paymentFor(
  action: Action,
  config: PortalConfig,
): Payment | null {
  if (
    action.target.toLowerCase() !==
    config.contracts.vault?.address.toLowerCase()
  )
    return null;
  try {
    const decoded = decodeFunctionData({ abi: vaultAbi, data: action.data });
    if (decoded.functionName === "payNative")
      return {
        recipient: decoded.args[0],
        symbol: "POL",
        quantity: formatUnits(decoded.args[1], 18),
      };
    if (decoded.functionName === "payToken") {
      const [token, recipient, value] = decoded.args;
      const known =
        token.toLowerCase() === config.contracts.weth?.address.toLowerCase()
          ? "WETH"
          : token.toLowerCase() === config.contracts.usdc?.address.toLowerCase()
            ? "USDC.e"
            : null;
      return {
        recipient,
        symbol: known ?? "token base units",
        quantity: known
          ? formatUnits(value, known === "USDC.e" ? 6 : 18)
          : String(value),
        token,
      };
    }
  } catch {
    /* The UI never infers a payment from unrecognized calldata. */
  }
  return null;
}
export const proposalActions = (p: Proposal): Action[] =>
  p.targets.map((target, i) => ({
    target,
    value: p.values[i],
    data: p.calldatas[i],
  }));
