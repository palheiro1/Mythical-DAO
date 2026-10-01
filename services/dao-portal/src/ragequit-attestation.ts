import {
  decodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { PortalConfig } from "../shared/domain";
import { tokenAbi, ragequitAbi } from "../shared/abis";
import {
  assertRagequitCode,
  assertRagequitConfiguration,
  validRagequitRecipient,
} from "../shared/ragequit-security";

/** All member MANA approvals and module calls require independent RPC attestation. */
export async function attestRagequitIntent(
  cfg: PortalConfig,
  intent: { to: Address; data: Hex },
  client: PublicClient | undefined,
) {
  const isModule =
    intent.to.toLowerCase() ===
    cfg.contracts.ragequitModule?.address.toLowerCase();
  const isMana =
    intent.to.toLowerCase() === cfg.contracts.mana?.address.toLowerCase();
  if (
    !isModule &&
    (!isMana || intent.data.slice(0, 10).toLowerCase() !== "0x095ea7b3")
  )
    return;
  assertRagequitConfiguration(cfg);
  if (isMana) {
    const call = decodeFunctionData({ abi: tokenAbi, data: intent.data });
    if (
      call.functionName !== "approve" ||
      call.args[0].toLowerCase() !==
        cfg.contracts.ragequitModule!.address.toLowerCase()
    )
      throw Error(
        "Only the reviewed ragequit module can receive MANA authorization.",
      );
  } else {
    const call = decodeFunctionData({ abi: ragequitAbi, data: intent.data });
    if (
      call.functionName !== "redeem" ||
      !validRagequitRecipient(call.args[1], cfg)
    )
      throw Error(
        "Choose a payout recipient other than the treasury, module or token contracts.",
      );
  }
  if (!client)
    throw Error(
      "An independent connection is required to verify the ragequit module.",
    );
  // The public client has its own RPC transport, separate from the backend. No cached attestation.
  try {
    if ((await client.getChainId()) !== cfg.chainId) throw Error("chain");
    const head = await client.getBlock({ blockTag: "latest" });
    const age = Math.floor(Date.now() / 1000) - Number(head.timestamp);
    if (age > 180 || age < -30 || head.number === null || head.number < 64n)
      throw Error("stale");
    const blockNumber = head.number - BigInt(Math.max(64, cfg.confirmations));
    const before = await client.getBlock({ blockNumber });
    const code = await client.getCode({
      address: cfg.contracts.ragequitModule!.address,
      blockNumber,
    });
    const after = await client.getBlock({ blockNumber });
    if (!before.hash || before.hash !== after.hash) throw Error("reorg");
    assertRagequitCode(code);
  } catch {
    throw Error(
      "The independent check could not verify the reviewed ragequit module. No MANA authorization or exit was sent. Try again after the connection or deployment is verified.",
    );
  }
}
