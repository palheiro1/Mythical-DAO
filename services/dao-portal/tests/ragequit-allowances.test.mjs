import { expect, it } from "vitest";
import { maxUint256 } from "viem";
import {
  checkAllowances,
  operationalAmount,
} from "../scripts/ragequit-allowances.mjs";
it("separates initial maximum approval, operational sufficiency and revocation", () => {
  expect(() =>
    checkAllowances("authorized", [maxUint256, maxUint256, maxUint256]),
  ).not.toThrow();
  expect(() =>
    checkAllowances("authorized", [maxUint256, maxUint256 - 1n, maxUint256]),
  ).toThrow();
  expect(() =>
    checkAllowances(
      "operational",
      [maxUint256, maxUint256 - 1n, 0n],
      [10n, 1n, 0n],
    ),
  ).not.toThrow();
  expect(() =>
    checkAllowances("operational", [10n, 1n, 0n], [10n, 1n, 1n]),
  ).toThrow("exceeds");
  expect(() =>
    checkAllowances("operational", [0n, 0n, 0n], [0n, 0n, 0n]),
  ).toThrow("no payout");
  expect(() => checkAllowances("revoked", [0n, 0n, 0n])).not.toThrow();
  expect(() => checkAllowances("revoked", [0n, 1n, 0n])).toThrow();
});
it("requires an explicit exact MANA amount for operational verification", () => {
  expect(operationalAmount("operational", "1.000000000000000001")).toBe(
    1000000000000000001n,
  );
  for (const amount of [undefined, "0", "-1", "1e6", "1.0000000000000000001"])
    expect(() => operationalAmount("operational", amount)).toThrow();
  expect(() => operationalAmount("authorized", "1")).toThrow();
});
