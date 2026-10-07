import { describe, it, expect } from "vitest";
import { blockDate, duration, compactAddresses } from "../src/time-format";
describe("human readable presentation", () => {
  it("estimates only future blocks from a measured clock", () => {
    const anchor = {
      number: 1000n,
      timestamp: 1700000000n,
      secondsPerBlock: 2.5,
    };
    expect(blockDate(1200n, anchor)).toBe(1700000500000);
    expect(blockDate(900n, anchor)).toBeNull();
    expect(blockDate(10n ** 30n, anchor)).toBeNull();
  });
  it("uses human units and keeps unavailable durations explicit", () => {
    expect(duration(20)).toBe("less than a minute");
    expect(duration(60)).toBe("1 minute");
    expect(duration(3600)).toBe("1 hour");
    expect(duration(86400 * 7)).toBe("7 days");
    expect(duration(NaN)).toBe("Time unavailable");
  });
  it("shortens standalone addresses without altering transaction hashes or original text", () => {
    const address = "0x1111111111111111111111111111111111112222";
    const original = `Authorize ${address}`;
    expect(compactAddresses(original)).toBe("Authorize 0x1111…2222");
    expect(original).toContain(address);
    const tx = "0x" + "a".repeat(64);
    expect(compactAddresses(tx)).toBe(tx);
  });
});
