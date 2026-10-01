import { describe, it, expect } from "vitest";
import { parseEther } from "viem";
import {
  proposalHash,
  redeemAmounts,
  stringify,
  validateActions,
  verifyProposal,
  safeExternalUrl,
  type Proposal,
} from "../shared/domain";
import { newDraft, validateDraft, description, fields } from "../src/drafts";
import { config } from "../worker/config";
import trust from "../shared/generated/ragequit-trust.json";
const address = "0x0000000000000000000000000000000000000001" as const;
describe("integer economic model", () => {
  it("keeps 256-bit values exact in API JSON", () => {
    expect(JSON.parse(stringify({ votes: 2n ** 200n })).votes).toBe(
      (2n ** 200n).toString(),
    );
  });
  it("uses total supply, rounds down and conserves successive exits", () => {
    const balances = [101n, 1001n, 10001n];
    let supply = 100n,
      remaining = balances.slice();
    for (const burn of [13n, 27n, 60n]) {
      const paid = redeemAmounts(remaining, burn, supply);
      remaining = remaining.map((x, i) => x - paid[i]);
      supply -= burn;
      expect(remaining.every((x) => x >= 0n)).toBe(true);
    }
    expect(remaining).toEqual([0n, 0n, 0n]);
    expect(redeemAmounts(balances, 1n, 100n)).toEqual([1n, 10n, 100n]);
  });
  it("rejects zero, oversupply and invalid supply", () => {
    for (const [burn, supply] of [
      [0n, 100n],
      [101n, 100n],
      [1n, 0n],
    ])
      expect(() => redeemAmounts([1n], burn, supply)).toThrow();
  });
});
describe("proposal integrity", () => {
  const actions = [{ target: address, value: "0", data: "0x" as const }];
  const p: Proposal = {
    chainId: 137,
    contract: address,
    proposer: address,
    signatures: [],
    options: [],
    snapshot: "10",
    deadline: "20",
    blockNumber: "1",
    transactionHash: "0x01",
    state: "Pending",
    kind: "executable",
    targets: [address],
    values: ["0"],
    calldatas: ["0x"],
    description: "Exact Unicode → text\n",
    id: proposalHash(actions, "Exact Unicode → text\n"),
  };
  it("matches complete actions and exact description", () => {
    expect(() => verifyProposal(p)).not.toThrow();
    expect(() =>
      verifyProposal({ ...p, description: p.description.trim() }),
    ).toThrow();
    expect(() =>
      verifyProposal({ ...p, values: [parseEther("1").toString()] }),
    ).toThrow();
  });
  it("rejects malformed and oversized action batches", () => {
    for (const x of [
      [],
      [{}],
      [{ target: address, value: "-1", data: "0x" }],
      [{ target: address, value: "0", data: "0xa" }],
      Array(21).fill(actions[0]),
    ])
      expect(() => validateActions(x)).toThrow();
  });
  it("does not treat discussion URLs as HTML or executable links", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("https://example.org/discuss")).toBe(
      "https://example.org/discuss",
    );
  });
});
describe("portable drafts", () => {
  it("round trips template sections and exact action strings", () => {
    const draft = newDraft();
    draft.title = "Community";
    draft.sections.Problem = "A problem";
    expect(validateDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(description(draft)).toContain("## Cancellation");
    expect(fields).toHaveLength(10);
  });
  it("rejects invalid versions, types and noninteger action values", () => {
    expect(() => validateDraft({ version: 2 })).toThrow();
    expect(() => validateDraft({ ...newDraft(), options: [1] })).toThrow();
  });
});
describe("release gates", () => {
  it("activates the existing Governor independently of the missing exit module", () => {
    const beforeDeployment = config({
      ENVIRONMENT: "local",
      DEPLOYMENT_MANIFEST: "",
    } as Env);
    delete beforeDeployment.contracts.ragequitModule;
    const cfg = config({
      ENVIRONMENT: "local",
      DEPLOYMENT_MANIFEST: JSON.stringify(beforeDeployment),
    } as Env);
    expect(cfg.enabled).toBe(true);
    expect(cfg.contracts.governor?.address).toBe(
      cfg.contracts.treasury?.address,
    );
    expect(cfg.capabilities?.ragequit).toBe(false);
    expect(cfg.contracts.usdcNative?.address).not.toBe(
      cfg.contracts.usdcBridged?.address,
    );
    expect(cfg.chainId).toBe(137);
  });
  it("publishes only the module address pinned in this release", () => {
    const cfg = config({
      ENVIRONMENT: "staging",
      DEPLOYMENT_MANIFEST: "",
    } as Env);
    expect(cfg.contracts.ragequitModule?.address).toBe(
      trust.moduleAddress.toLowerCase(),
    );
    expect(cfg.capabilities?.ragequit).toBe(true);
    expect(cfg.capabilities?.governance).toBe("existing-governor");
  });
  it("rejects lowering finality in production", () =>
    expect(() =>
      config({
        ENVIRONMENT: "production",
        DEPLOYMENT_MANIFEST: JSON.stringify({
          chainId: 137,
          confirmations: 0,
          contracts: {},
        }),
      } as Env),
    ).toThrow());
});
