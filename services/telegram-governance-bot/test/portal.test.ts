import { describe, it, expect } from "vitest";
import { portalIdentity } from "../src/portal";
import { renderGovernanceMessage } from "../src/messages";
import type { ProposalRecord } from "../src/types";
describe("independent portal adapter", () => {
  it("keys proposals by network, contract and identifier", () => {
    expect(portalIdentity({ chainId: 137, contract: "0xABC", id: "123" })).toBe(
      "137:0xabc:123",
    );
    expect(
      portalIdentity({ chainId: 137, contract: "0xDEF", id: "123" }),
    ).not.toBe("137:0xabc:123");
  });
  it("labels community results as advisory and links to the portal", () => {
    const p: ProposalRecord = {
      source: "governor",
      proposalId: "137:0x1:1",
      title: "Choose a habitat",
      url: "https://dao.mythicalbeings.io/#proposal/0x1/1",
      state: "succeeded",
      createdAt: null,
      startsAt: null,
      endsAt: null,
      startBlock: 1,
      endBlock: 2,
      choices: ["Forest", "Ocean"],
      scores: null,
      metadata: { kind: "community", result: "Winner: Forest" },
      notificationsEnabled: true,
      firstSeenAt: 0,
      updatedAt: 0,
    };
    const text = renderGovernanceMessage(p, "succeeded");
    expect(text).toContain("Community ballot");
    expect(text).toContain("advisory");
    expect(text).toContain("Winner: Forest");
    expect(text).not.toContain("tally.xyz");
    expect(text).not.toContain("Proposal passed");
  });
});
