import { expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { voterStatus } from "../worker/voter-status";
const address = "0x09bff4758b652309704079f8a3cf271a2cf6220e" as const;
function client(snapshot = 90n) {
  return {
    multicall: vi.fn(async () => [true, snapshot, 17009n * 10n ** 18n]),
    readContract: vi.fn(async () => 1000n * 10n ** 18n),
  };
}
it("uses Governor historical voting power, never the current token balance", async () => {
  const a = client(),
    b = client();
  const result = await voterStatus(
    [a, b] as unknown as [PublicClient, PublicClient],
    address,
    address,
    1n,
    address,
    100n,
  );
  expect(result.votingPower).toBe("1000000000000000000000");
  expect(result.currentBalance).toBe("17009000000000000000000");
  expect(result.hasVoted).toBe(true);
  expect(a.readContract).toHaveBeenCalledWith(
    expect.objectContaining({
      functionName: "getVotes",
      args: [address, 90n],
      blockNumber: 100n,
    }),
  );
});
it("does not treat a future snapshot as zero voting power", async () => {
  const a = client(110n);
  const result = await voterStatus(
    [a, a] as unknown as [PublicClient, PublicClient],
    address,
    address,
    1n,
    address,
    100n,
  );
  expect(result.votingPower).toBeNull();
  expect(a.readContract).not.toHaveBeenCalled();
});
it("refuses disagreement about the historical weight", async () => {
  const a = client(),
    b = client();
  b.readContract.mockResolvedValueOnce(2n);
  await expect(
    voterStatus(
      [a, b] as unknown as [PublicClient, PublicClient],
      address,
      address,
      1n,
      address,
      100n,
    ),
  ).rejects.toThrow();
});
