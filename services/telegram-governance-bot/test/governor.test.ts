import { describe, expect, it } from "vitest";
import { governorEventForTransition, safeHeadFromLatest } from "../src/governor";

describe("Governor state transitions", () => {
  it.each([
    [null, "pending", "created"],
    [null, "active", "active"],
    ["pending", "active", "active"],
    ["active", "succeeded", "succeeded"],
    ["active", "queued", "succeeded"],
    ["active", "defeated", "defeated"],
    ["active", "cancelled", "cancelled"],
    ["succeeded", "expired", "expired"],
    ["succeeded", "executed", "executed"],
    ["active", "active", null],
  ] as const)("maps %s -> %s to %s", (previous, current, expected) => {
    expect(governorEventForTransition(previous, current)).toBe(expected);
  });

  it("keeps unconfirmed blocks outside the safe head", () => {
    expect(safeHeadFromLatest(10_000n, 64n)).toBe(9_936n);
    expect(() => safeHeadFromLatest(64n, 64n)).toThrow("confirmation margin");
  });
});
