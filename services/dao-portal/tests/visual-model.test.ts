import { describe, it, expect } from "vitest";
import { encodeFunctionData } from "viem";
import { percentToBps, assertCurrentExit } from "../src/exit-model";
import { newDraft, description, validateDraft } from "../src/drafts";
import { draftIssues } from "../src/draft-validation";
import { paymentFor } from "../src/action-view";
import { vaultAbi } from "../shared/abis";
import type { PortalConfig } from "../shared/domain";
describe("exit review validity", () => {
  it("converts percentages exactly within the existing 0–500 bps limit", () => {
    for (const [input, expected] of [
      ["0", 0],
      ["0.5", 50],
      ["0.01", 1],
      ["1.23", 123],
      ["5.00", 500],
    ] as const)
      expect(percentToBps(input)).toBe(expected);
    for (const input of ["", "-1", "5.01", "0.001", "NaN", "0,5", "1e2"])
      expect(percentToBps(input)).toBeNull();
  });
  it("rejects changed details and expired previews, including the boundary", () => {
    expect(() =>
      assertCurrentExit("same", "same", 120000, 119999),
    ).not.toThrow();
    expect(() =>
      assertCurrentExit("same", "changed", 120000, 119999),
    ).toThrow();
    expect(() => assertCurrentExit("same", "same", 120000, 120000)).toThrow();
  });
});
describe("compatible staged drafts", () => {
  it("keeps the original schema, section keys and exact published text", () => {
    const draft = newDraft();
    draft.title = "Exact → title";
    draft.sections.Problem = " Do not trim\nthis.";
    draft.sections["Conflicts of interest"] = "None";
    draft.discussion = "https://example.org";
    const imported = validateDraft(JSON.parse(JSON.stringify(draft)));
    expect(imported).toEqual(draft);
    expect(description(imported)).toBe(description(draft));
    expect(description(imported)).toContain("## Problem\n Do not trim\nthis.");
    expect(Object.keys(imported.sections)).toContain("Conflicts of interest");
  });
  it("points validation at the right field and step without editing the draft", () => {
    const draft = newDraft(),
      original = JSON.stringify(draft),
      issues = draftIssues(draft);
    expect(issues.find((i) => i.field === "draft-title")?.step).toBe(0);
    expect(issues.find((i) => i.field === "draft-budget")?.step).toBe(1);
    expect(issues.find((i) => i.field === "action-template")?.step).toBe(2);
    expect(JSON.stringify(draft)).toBe(original);
  });
});
describe("identified treasury payments", () => {
  const vault = "0x1111111111111111111111111111111111111111",
    recipient = "0x2222222222222222222222222222222222222222";
  const config = {
    contracts: {
      vault: { address: vault },
      weth: { address: "0x3333333333333333333333333333333333333333" },
      usdc: { address: "0x4444444444444444444444444444444444444444" },
    },
  } as unknown as PortalConfig;
  it("does not label parameter or unknown calls as payments", () =>
    expect(
      paymentFor({ target: vault, value: "0", data: "0x12345678" }, config),
    ).toBeNull());
  it("reads exact amounts and recipients from recognized actions", () => {
    expect(
      paymentFor(
        {
          target: vault,
          value: "0",
          data: encodeFunctionData({
            abi: vaultAbi,
            functionName: "payNative",
            args: [recipient, 1234567890000000000n],
          }),
        },
        config,
      ),
    ).toEqual({
      recipient,
      symbol: "POL",
      quantity: "1.23456789",
      raw: "1234567890000000000",
      decimals: 18,
    });
  });
});
