import { beforeEach, expect, it, vi } from "vitest";
import {
  encodeFunctionData,
  keccak256,
  type Address,
  type PublicClient,
} from "viem";
import { config } from "../worker/config";
import { tokenAbi, ragequitAbi } from "../shared/abis";
import { attestRagequitIntent } from "../src/ragequit-attestation";
import {
  assertRagequitConfiguration,
  assertRagequitCode,
  validRagequitRecipient,
} from "../shared/ragequit-security";
import trust from "../shared/generated/ragequit-trust.json";

vi.mock("../shared/generated/ragequit-trust.json", async () => {
  const { default: original } = await vi.importActual<{
    default: typeof import("../shared/generated/ragequit-trust.json");
  }>("../shared/generated/ragequit-trust.json");
  const { keccak256 } = await import("viem");
  return {
    default: {
      ...original,
      moduleAddress: "0x1111111111111111111111111111111111111111",
      runtimeHash: keccak256("0x6000"),
    },
  };
});
const cfg = config({} as Env);
cfg.contracts.ragequitModule = {
  address: String(trust.moduleAddress) as Address,
  startBlock: "1",
};
const member = "0x2222222222222222222222222222222222222222";
const approve = {
  to: cfg.contracts.mana!.address,
  data: encodeFunctionData({
    abi: tokenAbi,
    functionName: "approve",
    args: [String(trust.moduleAddress) as Address, 1n],
  }),
};
const redeem = (recipient: Address) => ({
  to: String(trust.moduleAddress) as Address,
  data: encodeFunctionData({
    abi: ragequitAbi,
    functionName: "redeem",
    args: [1n, recipient, [0n, 0n, 0n], 2000000000n],
  }),
});
const code = vi.fn(async () => "0x6000");
const chain = vi.fn(async () => 137);
const block = vi.fn(async () => ({
  number: 1000n,
  hash: "0x" + "a".repeat(64),
  timestamp: BigInt(Math.floor(Date.now() / 1000)),
}));
const client = {
  getChainId: chain,
  getBlock: block,
  getCode: code,
} as unknown as PublicClient;
beforeEach(() => {
  vi.clearAllMocks();
  code.mockResolvedValue("0x6000");
  chain.mockResolvedValue(137);
  block.mockImplementation(async () => ({
    number: 1000n,
    hash: "0x" + "a".repeat(64),
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
  }));
});

it("verifies approval and redemption independently at a confirmed block, repeating before each operation", async () => {
  await attestRagequitIntent(cfg, approve, client);
  await attestRagequitIntent(cfg, redeem(member), client);
  expect(code).toHaveBeenCalledTimes(2);
  expect(code).toHaveBeenCalledWith({
    address: trust.moduleAddress,
    blockNumber: 936n,
  });
  code.mockResolvedValue("0x6001");
  await expect(attestRagequitIntent(cfg, approve, client)).rejects.toThrow(
    "independent check",
  );
});
it.each(["0x", "0x6001"])(
  "blocks a missing or altered runtime even if the backend would allow it (%s)",
  async (value) => {
    code.mockResolvedValue(value);
    await expect(attestRagequitIntent(cfg, approve, client)).rejects.toThrow(
      "independent check",
    );
  },
);
it("fails closed on RPC errors, wrong chains, stale blocks and reorgs", async () => {
  code.mockRejectedValueOnce(Error("unavailable"));
  await expect(attestRagequitIntent(cfg, approve, client)).rejects.toThrow();
  chain.mockResolvedValueOnce(1);
  await expect(attestRagequitIntent(cfg, approve, client)).rejects.toThrow();
  block.mockResolvedValueOnce({ number: 1000n, hash: "a", timestamp: 1n });
  await expect(attestRagequitIntent(cfg, approve, client)).rejects.toThrow();
  block
    .mockResolvedValueOnce({
      number: 1000n,
      hash: "a",
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    })
    .mockResolvedValueOnce({ number: 936n, hash: "a", timestamp: 1n })
    .mockResolvedValueOnce({ number: 936n, hash: "b", timestamp: 1n });
  await expect(attestRagequitIntent(cfg, approve, client)).rejects.toThrow();
});
it("does not trust a module/asset replacement or a backend-supplied expected hash", async () => {
  const altered = structuredClone(cfg);
  altered.contracts.ragequitModule!.address = member;
  await expect(attestRagequitIntent(altered, approve, client)).rejects.toThrow(
    "configuration differs",
  );
  altered.contracts = structuredClone(cfg.contracts);
  altered.contracts.usdcNative!.address = cfg.contracts.usdcBridged!.address;
  expect(() => assertRagequitConfiguration(altered)).toThrow();
  expect(() =>
    assertRagequitConfiguration(cfg, { ...trust, moduleAddress: null }),
  ).toThrow("awaiting");
  expect(() => assertRagequitCode("0x6001")).toThrow();
  expect(trust.runtimeHash).toBe(keccak256("0x6000"));
});
it("blocks token recipients in both UI and signing paths without excluding ordinary contract wallets", async () => {
  for (const role of [
    "mana",
    "gem",
    "weth",
    "usdcNative",
    "treasury",
    "ragequitModule",
  ] as const) {
    const address = cfg.contracts[role]!.address;
    expect(validRagequitRecipient(address, cfg)).toBe(false);
    await expect(
      attestRagequitIntent(cfg, redeem(address), client),
    ).rejects.toThrow("recipient");
  }
  expect(validRagequitRecipient(member, cfg)).toBe(true);
  await expect(
    attestRagequitIntent(cfg, redeem(member), client),
  ).resolves.toBeUndefined();
});
it("keeps governance and delegation available without module attestation or an RPC client", async () => {
  await expect(
    attestRagequitIntent(
      cfg,
      { to: cfg.contracts.governor!.address, data: "0x1234" },
      undefined,
    ),
  ).resolves.toBeUndefined();
  await expect(
    attestRagequitIntent(
      cfg,
      {
        to: cfg.contracts.mana!.address,
        data: encodeFunctionData({
          abi: tokenAbi,
          functionName: "delegate",
          args: [member],
        }),
      },
      undefined,
    ),
  ).resolves.toBeUndefined();
  expect(code).not.toHaveBeenCalled();
});
