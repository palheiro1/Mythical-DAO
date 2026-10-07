import { expect, it } from "vitest";
import { paymentProposal } from "./browser/fixtures";
import {
  presentSnapshot,
  PROPOSAL_FRESH_MS,
  type ProposalSnapshot,
} from "../worker/proposal-snapshot";
const snapshot = {
  checkedAt: 1000,
  block: "100",
  items: [
    {
      ...paymentProposal,
      id: "1",
      state: "Active",
      votes: ["0", "2000000000000000000", "0"],
    },
  ],
  rows: [],
} as ProposalSnapshot;
it("preserves every verified vote and marks a failed refresh as stale without inventing zero", () => {
  const live = presentSnapshot(snapshot, 1001)[0];
  expect(live.votes).toEqual(snapshot.items[0].votes);
  expect(live.results.fresh).toBe(true);
  const stale = presentSnapshot(snapshot, 1001 + PROPOSAL_FRESH_MS)[0];
  expect(stale.votes).toEqual(live.votes);
  expect(stale.results.fresh).toBe(false);
  expect(stale.state).toBe("Unknown");
  expect(snapshot.items[0].state).toBe("Active");
  expect(presentSnapshot(snapshot, 999)[0].results.fresh).toBe(false);
});
