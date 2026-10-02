import { describe, expect, it } from "vitest";
import { maxUint256, parseUnits } from "viem";
import { displayAsset, formatTokenAmount } from "../src/token-format";
import { amount, allowanceAmount } from "../src/components";
import type { PortalConfig } from "../shared/domain";

const show = (v: string, symbol: string, decimals = 18) =>
  formatTokenAmount(parseUnits(v, decimals), { symbol, decimals });
describe("display precision without changing transaction quantities", () => {
  it("groups and rounds GEM/MANA only for display", () => {
    expect(show("657100.44", "GEM")).toEqual({
      text: "≈657,100",
      exact: "657100.44",
      approximate: true,
    });
    expect(show("1999.5", "MANA").text).toBe("≈2,000");
    expect(show("0.99", "MANA").text).toBe("<1");
    expect(show("0", "GEM").text).toBe("0");
  });
  it("uses exactly two decimals for both distinct USDC assets", () => {
    expect(show("1234.5", "USDC", 6).text).toBe("1,234.50");
    expect(show("1.235", "USDC.e", 6).text).toBe("≈1.24");
    expect(show("0.009999", "USDC", 6).text).toBe("<0.01");
    expect(show("0", "USDC", 6).text).toBe("0.00");
  });
  it("retains useful WETH precision, including boundary and dust amounts", () => {
    for (const [v, expected] of [
      ["0.578750820430965951", "≈0.5788"],
      ["0.01", "0.01"],
      ["0.0099999", "≈0.01"],
      ["0.0001", "0.0001"],
      ["0.00008", "0.00008"],
      ["0.00000001", "0.00000001"],
      ["0.000000001", "<0.00000001"],
    ])
      expect(show(v, "WETH").text).toBe(expected);
  });
  it("never coerces large amounts into floating point", () => {
    const result = formatTokenAmount(maxUint256, {
      symbol: "MANA",
      decimals: 18,
    });
    expect(result.text).toBe(
      "≈115,792,089,237,316,195,423,570,985,008,687,907,853,269,984,665,640,564,039,458",
    );
    expect(result.exact).toBe(amount(maxUint256));
  });
  it("keeps native fees meaningful and unknown tokens exact", () => {
    expect(
      formatTokenAmount(1n, { symbol: "POL", decimals: 18 }, true).text,
    ).toBe("<0.00000001");
    expect(show("1.123456789012345678", "token").text).toBe(
      "1.123456789012345678",
    );
    expect(
      formatTokenAmount(undefined, { symbol: "GEM", decimals: 18 }).text,
    ).toBe("—");
    expect(show("-1.5", "MANA").text).toBe("≈−2");
  });
  it("leaves Max and the unlimited allowance sentinel exact", () => {
    expect(amount(1234567890123456789n)).toBe("1.234567890123456789");
    expect(parseUnits(amount(1234567890123456789n), 18)).toBe(
      1234567890123456789n,
    );
    expect(allowanceAmount(String(maxUint256))).toBe("Unlimited (revocable)");
  });
  it("selects the policy by configured address, including native versus bridged USDC", () => {
    const config = {
      contracts: {
        gem: { address: "0x1234" },
        mana: { address: "0x3456" },
        usdcNative: { address: "0xabcd" },
        usdcBridged: { address: "0xef12" },
      },
    } as unknown as PortalConfig;
    expect(displayAsset(config, "0xABCD")).toMatchObject({
      symbol: "USDC",
      decimals: 6,
    });
    expect(displayAsset(config, "0xef12").symbol).toBe("USDC.e");
    expect(displayAsset(config, "0xunknown", 9)).toEqual({
      symbol: "token",
      decimals: 9,
    });
    expect(displayAsset(config, null).symbol).toBe("POL");
  });
});
