import { expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { proposalTotals } from "../worker/proposal-totals";
import { paymentProposal } from "./browser/fixtures";
it("aggregates all voter totals, keeps choices/proposals separate and includes only available quorums", async () => {
  const multicall = vi
    .fn()
    .mockResolvedValue([1, [0n, 34n, 2n], 40n, 0, [0n, 0n, 0n]]);
  const pair = [{ multicall }, { multicall }] as unknown as [
    PublicClient,
    PublicClient,
  ];
  const result = await proposalTotals(
    [paymentProposal, { ...paymentProposal, id: "2", snapshot: "2000" }],
    pair,
    1000n,
  );
  expect(result[0]).toMatchObject({
    state: "Active",
    votes: ["0", "34", "2"],
    quorum: "40",
  });
  expect(result[1]).toMatchObject({ state: "Pending", votes: ["0", "0", "0"] });
  expect(multicall).toHaveBeenCalledTimes(2);
  expect(multicall.mock.calls[0][0]).toMatchObject({
    blockNumber: 1000n,
    allowFailure: false,
  });
  expect(multicall.mock.calls[0][0].contracts).toHaveLength(5);
});
it("never combines disagreeing providers into a plausible result", async () => {
  const pair = [
    { multicall: async () => [1, [0n, 2n, 0n], 4n] },
    { multicall: async () => [1, [0n, 34n, 0n], 4n] },
  ] as unknown as [PublicClient, PublicClient];
  await expect(proposalTotals([paymentProposal], pair, 1000n)).rejects.toThrow(
    "RPC_DIVERGENCE",
  );
});
