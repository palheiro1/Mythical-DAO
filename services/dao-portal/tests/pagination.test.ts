import { it, expect } from "vitest";
import { eventCursor, parseCursor } from "../shared/pagination";
it("preserves events sharing a block with a composite cursor", () => {
  const row = {
    block_number: 10,
    log_index: 7,
    contract: "0x0000000000000000000000000000000000000001",
  };
  expect(parseCursor(eventCursor(row), "before")).toEqual({
    block: 10,
    log: 7,
    contract: row.contract,
  });
  expect(() => parseCursor("NaN", "before")).toThrow();
  expect(() => parseCursor("10000000000000000000000", "after")).toThrow();
});
