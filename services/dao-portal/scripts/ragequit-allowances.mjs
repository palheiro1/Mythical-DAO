import { maxUint256, parseUnits } from "viem";

export function operationalAmount(mode, input) {
  if (!["inspect", "authorized", "revoked", "operational"].includes(mode))
    throw Error("Expected inspect, authorized, revoked or operational");
  if (mode !== "operational") {
    if (input !== undefined)
      throw Error("MANA amount applies only to operational mode");
    return null;
  }
  if (!/^\d+(\.\d{1,18})?$/.test(input ?? ""))
    throw Error(
      "Operational verification requires a positive MANA amount (at most 18 decimals)",
    );
  const amount = parseUnits(input, 18);
  if (amount <= 0n || amount > maxUint256) throw Error("Invalid MANA amount");
  return amount;
}

export function checkAllowances(mode, allowances, payouts) {
  if (allowances.length !== 3) throw Error("Expected three allowances");
  if (mode === "authorized" && allowances.some((a) => a !== maxUint256))
    throw Error(
      "Initial authorization must equal uint256.max for all three assets",
    );
  if (mode === "revoked" && allowances.some((a) => a !== 0n))
    throw Error("Revocation must equal zero for all three assets");
  if (mode === "operational") {
    if (payouts?.length !== 3 || payouts.every((a) => a === 0n))
      throw Error("The selected MANA amount produces no payout");
    if (payouts.some((amount, i) => amount > allowances[i]))
      throw Error("The selected exit exceeds a treasury allowance");
  }
}
