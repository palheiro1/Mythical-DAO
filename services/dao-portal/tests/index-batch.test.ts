import { expect, it } from "vitest";
import {
  initialBatch,
  failedBatch,
  successfulBatch,
  rangeFailure,
} from "../worker/index-batch";
import { RpcFault } from "../worker/rpc";
it("preserves slow successful ranges and grows after three complete successful ranges within the cap", () => {
  let state = initialBatch(null, 5000);
  state = successfulBatch(state, 5000, 22000, 5000);
  expect(state.span).toBe(5000);
  state = failedBatch(state, 5000, "INDEX_LOG_TIMEOUT", 5000);
  expect(state.span).toBe(2500);
  state = successfulBatch(state, 2500, 22000, 5000);
  state = successfulBatch(state, 2500, 22000, 5000);
  expect(state.span).toBe(2500);
  state = successfulBatch(state, 2500, 22000, 5000);
  expect(state.span).toBe(5000);
  expect(
    successfulBatch({ ...state, span: 4900, successes: 2 }, 4900, 1, 5000).span,
  ).toBe(5000);
  expect(successfulBatch({ ...state, successes: 2 }, 1, 1, 5000).span).toBe(
    5000,
  );
  expect(initialBatch(state, 1000).span).toBe(1000);
  expect(failedBatch(state, 1).span).toBe(1);
  expect(failedBatch(state, 1000, "INDEX_LOG_TIMEOUT", 5000).span).toBe(1000);
  expect(failedBatch(state, 1000, "INDEX_LOG_RANGE_LIMIT", 5000).span).toBe(
    500,
  );
});
it("only resizes log timeouts or capacity failures, never rate limits, quota, reorg or disagreement", () => {
  for (const code of ["RPC_SECONDARY_TIMEOUT", "INFURA_REQUEST_TIMEOUT"])
    expect(rangeFailure(new RpcFault(code))).toBe("INDEX_LOG_TIMEOUT");
  for (const code of [
    "RPC_RESPONSE_TOO_LARGE",
    "INDEX_BATCH_TOO_DENSE_REDUCE_RANGE",
    "INFURA_LOG_RANGE_LIMIT",
  ])
    expect(rangeFailure(new RpcFault(code))).toBe("INDEX_LOG_RANGE_LIMIT");
  expect(rangeFailure({ cause: { status: 504 } })).toBe("INDEX_LOG_TIMEOUT");
  expect(rangeFailure({ status: 413 })).toBe("INDEX_LOG_RANGE_LIMIT");
  expect(
    rangeFailure({
      cause: { message: "query returned more than 10000 results" },
    }),
  ).toBe("INDEX_LOG_RANGE_LIMIT");
  for (const code of [
    "RPC_DIVERGENCE",
    "REORG_DURING_BATCH",
    "INFURA_DAILY_BUDGET_EXHAUSTED",
    "INFURA_PROVIDER_RATE_LIMIT",
    "INDEX_LEASE_EXPIRED",
  ])
    expect(rangeFailure(new RpcFault(code))).toBeUndefined();
  expect(
    rangeFailure({ message: "timeout", cause: { status: 429 } }),
  ).toBeUndefined();
  expect(rangeFailure(new Error("archive state missing"))).toBeUndefined();
});
