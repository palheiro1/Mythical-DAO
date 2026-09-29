import { expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { decodeFunctionData, parseAbi, maxUint256 } from "viem";
import {
  assertRagequitManifest,
  assertModuleAddress,
  assertIndependentProviders,
  assertModuleRuntime,
  fixedAddresses,
} from "../scripts/ragequit-policy.mjs";
const manifest = JSON.parse(readFileSync("deployments/polygon.json", "utf8"));
it("pins the approved identities and rejects native/bridged USDC substitution and module/token confusion", () => {
  expect(() => assertRagequitManifest(manifest)).not.toThrow();
  const wrong = structuredClone(manifest);
  wrong.contracts.usdcNative.address = wrong.contracts.usdcBridged.address;
  expect(() => assertRagequitManifest(wrong)).toThrow("usdcNative");
  for (const address of Object.values(fixedAddresses))
    expect(() => assertModuleAddress(address, manifest)).toThrow();
  for (const chainId of [1, 80002])
    expect(() => assertRagequitManifest({ ...manifest, chainId })).toThrow();
});
it("rejects two different URLs of one RPC host and unencrypted URLs", () => {
  expect(() =>
    assertIndependentProviders([
      "https://provider.example/key1",
      "https://provider.example/key2",
    ]),
  ).toThrow();
  expect(() =>
    assertIndependentProviders(["http://one.example", "https://two.example"]),
  ).toThrow();
  expect(() =>
    assertIndependentProviders(["https://one.example", "https://two.example"]),
  ).not.toThrow();
});
it("rejects runtime tampering in a non-getter immutable copy that masked-code verification would miss", () => {
  const addresses = ["treasury", "mana", "gem", "weth", "usdcNative"].map(
    (k) => fixedAddresses[k],
  );
  const template = "0x" + "00".repeat(320) + "abcd";
  const immutableReferences = Object.fromEntries(
    addresses.map((a, i) => [
      String(i),
      [
        { start: i * 64, length: 32 },
        { start: i * 64 + 32, length: 32 },
      ],
    ]),
  );
  const artifact = {
    deployedBytecode: { object: template, immutableReferences },
  };
  const code =
    "0x" +
    addresses.map((a) => a.slice(2).padStart(64, "0").repeat(2)).join("") +
    "abcd";
  expect(() => assertModuleRuntime(code, artifact, addresses)).not.toThrow();
  const altered =
    code.slice(0, 66) +
    addresses[1].slice(2).padStart(64, "0") +
    code.slice(130);
  expect(() => assertModuleRuntime(altered, artifact, addresses)).toThrow(
    "immutable copies",
  );
  expect(() =>
    assertModuleRuntime(code.slice(0, -4) + "ffff", artifact, addresses),
  ).toThrow("runtime differs");
  expect(() => assertModuleRuntime(code + "00", artifact, addresses)).toThrow(
    "length",
  );
});
it.each(["authorize", "revoke"])(
  "generates exactly three %s approvals and matching Governor calldata without submitting",
  (mode) => {
    const dir = mkdtempSync(join(tmpdir(), "ragequit-review-"));
    try {
      const output = join(dir, "proposal.json"),
        module = "0x0000000000000000000000000000000000000123";
      execFileSync(process.execPath, [
        "scripts/ragequit-proposal.mjs",
        module,
        output,
        mode,
      ]);
      const p = JSON.parse(readFileSync(output, "utf8"));
      expect(p.status).toBe("unsigned-review-only");
      expect(p.actions.map((a) => a.target.toLowerCase())).toEqual(
        ["gem", "weth", "usdcNative"].map((k) => fixedAddresses[k]),
      );
      const abi = parseAbi(["function approve(address,uint256) returns(bool)"]);
      for (const a of p.actions) {
        const decoded = decodeFunctionData({ abi, data: a.data });
        expect(decoded.args).toEqual([
          module,
          mode === "authorize" ? maxUint256 : 0n,
        ]);
        expect(a.value).toBe("0");
      }
      const governorAbi = parseAbi([
        "function propose(address[],uint256[],bytes[],string) returns(uint256)",
        "function execute(address[],uint256[],bytes[],bytes32) payable returns(uint256)",
      ]);
      const proposed = decodeFunctionData({
        abi: governorAbi,
        data: p.propose.data,
      });
      const executed = decodeFunctionData({
        abi: governorAbi,
        data: p.execute.data,
      });
      expect(proposed.args[2]).toEqual(p.actions.map((a) => a.data));
      expect(executed.args.slice(0, 3)).toEqual(proposed.args.slice(0, 3));
      expect(executed.args[3]).toBe(p.descriptionHash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
