import { describe, expect, it, vi } from "vitest";
import type {
  Hex,
  TransactionReceipt,
  WaitForTransactionReceiptParameters,
} from "viem";
import { waitForOperation } from "../src/transaction-receipt";
const original = ("0x" + "a".repeat(64)) as Hex;
const replacement = ("0x" + "b".repeat(64)) as Hex;
const receipt = (hash = original, status = "success") =>
  ({ transactionHash: hash, status }) as TransactionReceipt;
describe("transaction confirmation integrity", () => {
  it("tracks a fee replacement through the full confirmation window", async () => {
    const wait = vi.fn(
      async (parameters: WaitForTransactionReceiptParameters) => {
        if (parameters.hash === original) {
          parameters.onReplaced?.({
            reason: "repriced",
            transaction: { hash: replacement },
          } as Parameters<
            NonNullable<WaitForTransactionReceiptParameters["onReplaced"]>
          >[0]);
        }
        return receipt(replacement);
      },
    );
    const progress = vi.fn();
    expect(
      (
        await waitForOperation(
          { waitForTransactionReceipt: wait },
          original,
          64,
          progress,
        )
      ).transactionHash,
    ).toBe(replacement);
    expect(wait.mock.calls[1][0]).toMatchObject({
      hash: replacement,
      confirmations: 64,
    });
    expect(progress).toHaveBeenCalledWith({
      hash: replacement,
      phase: "included",
    });
  });
  for (const reason of ["cancelled", "replaced"] as const) {
    it(
      "never confirms a successful " +
        reason +
        " transaction as the original operation",
      async () => {
        const wait = vi.fn(
          async (parameters: WaitForTransactionReceiptParameters) => {
            parameters.onReplaced?.({
              reason,
              transaction: { hash: replacement },
            } as Parameters<
              NonNullable<WaitForTransactionReceiptParameters["onReplaced"]>
            >[0]);
            return receipt(replacement);
          },
        );
        await expect(
          waitForOperation(
            { waitForTransactionReceipt: wait },
            original,
            64,
            vi.fn(),
          ),
        ).rejects.toThrow(
          reason === "cancelled" ? "canceled" : "different operation",
        );
        expect(wait).toHaveBeenCalledTimes(1);
      },
    );
  }
  it("rejects a reverted receipt after an initially successful inclusion", async () => {
    const wait = vi
      .fn()
      .mockResolvedValueOnce(receipt())
      .mockResolvedValueOnce(receipt(original, "reverted"));
    await expect(
      waitForOperation(
        { waitForTransactionReceipt: wait },
        original,
        64,
        vi.fn(),
      ),
    ).rejects.toThrow("reverted");
  });
});
