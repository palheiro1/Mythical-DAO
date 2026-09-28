import type {
  Hex,
  TransactionReceipt,
  WaitForTransactionReceiptParameters,
} from "viem";

type ReceiptClient = {
  waitForTransactionReceipt: (
    parameters: WaitForTransactionReceiptParameters,
  ) => Promise<TransactionReceipt>;
};
type Progress = { hash: Hex; phase: "replaced" | "included" };

/** A repriced transaction preserves the operation; a different transaction does not. */
export async function waitForOperation(
  client: ReceiptClient,
  hash: Hex,
  confirmations: number,
  onProgress: (progress: Progress) => void,
): Promise<TransactionReceipt> {
  let replacementError: string | undefined;
  const onReplaced: WaitForTransactionReceiptParameters["onReplaced"] = (
    replacement,
  ) => {
    if (replacement.reason === "cancelled")
      replacementError = "The transaction was canceled in your wallet.";
    else if (replacement.reason === "replaced")
      replacementError =
        "The transaction was replaced by a different operation. The reviewed operation is not confirmed.";
    onProgress({ hash: replacement.transaction.hash, phase: "replaced" });
  };
  const check = (receipt: TransactionReceipt) => {
    if (replacementError) throw new Error(replacementError);
    if (receipt.status !== "success")
      throw new Error(
        "The transaction reverted. No contract changes were applied.",
      );
  };
  const included = await client.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 180_000,
    onReplaced,
  });
  check(included);
  onProgress({ hash: included.transactionHash, phase: "included" });
  const confirmed = await client.waitForTransactionReceipt({
    hash: included.transactionHash,
    confirmations: Math.max(1, confirmations),
    timeout: 600_000,
    onReplaced,
  });
  check(confirmed);
  return confirmed;
}
