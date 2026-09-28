import { describe, expect, it } from "vitest";
import { renderGovernanceMessage } from "../src/messages";
import type { ProposalRecord } from "../src/types";
import { escapeHtml, extractGovernorTitle } from "../src/utils";

function proposal(overrides: Partial<ProposalRecord> = {}): ProposalRecord {
  return {
    source: "snapshot",
    proposalId: "proposal-1",
    title: "Choose the next season",
    url: "https://snapshot.org/proposal-1",
    state: "closed",
    createdAt: 1_700_000_000,
    startsAt: 1_700_000_100,
    endsAt: 1_700_086_400,
    startBlock: null,
    endBlock: null,
    choices: ["Fire", "Water"],
    scores: [100, 100],
    metadata: {},
    notificationsEnabled: true,
    firstSeenAt: 1_700_000_000,
    updatedAt: 1_700_086_400,
    ...overrides,
  };
}

describe("message rendering", () => {
  it("escapes untrusted proposal titles and reports ties", () => {
    const message = renderGovernanceMessage(
      proposal({ title: '<script>alert("x")</script>' }),
      "succeeded",
    );
    expect(message).toContain("&lt;script&gt;");
    expect(message).not.toContain("<script>");
    expect(message).toContain("Tie: Fire / Water");
  });

  it("reports a closed proposal with no votes", () => {
    const message = renderGovernanceMessage(proposal({ scores: [0, 0] }), "succeeded");
    expect(message).toContain("No votes recorded");
  });

  it("extracts and truncates the first Markdown heading", () => {
    expect(extractGovernorTitle("\n## Treasury grant\nLong body")).toBe("Treasury grant");
    expect(extractGovernorTitle("   ")).toBe("Untitled governance proposal");
  });

  it("escapes HTML attribute delimiters", () => {
    expect(escapeHtml(`a&<b>`)).toBe("a&amp;&lt;b&gt;");
  });
});
