import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateMeta,
  validateSources,
  graphQuery,
  pagedEvents,
  comparableEvent,
  queryConnection,
  GATEWAY_URL,
  GOVERNOR,
  MANA,
} from "../scripts/validation.mjs";
const cid = "Qm" + "a".repeat(44);
test("nullable Graph VoteCast reasons match only the empty on-chain reason", () => {
  assert.deepEqual(
    comparableEvent({ name: "VoteCast", reason: null }),
    comparableEvent({ name: "VoteCast", reason: "" }),
  );
  assert.notDeepEqual(
    comparableEvent({ name: "VoteCast", reason: null }),
    comparableEvent({ name: "VoteCast", reason: "Exact reason" }),
  );
  assert.notDeepEqual(
    comparableEvent({ name: "Other", reason: null }),
    comparableEvent({ name: "Other", reason: "" }),
  );
});
test("rejects wrong deployment, errors and an incorrect historical anchor", () => {
  const meta = {
    deployment: cid,
    hasIndexingErrors: false,
    block: { number: 50000000, hash: "0xabc" },
  };
  validateMeta(meta, cid, 50000000, "0xabc");
  assert.throws(() => validateMeta(meta, "Qm" + "b".repeat(44)), /DEPLOYMENT/);
  assert.throws(
    () => validateMeta({ ...meta, hasIndexingErrors: true }, cid),
    /INDEXING_ERRORS/,
  );
  assert.throws(() => validateMeta(meta, cid, 50000001, "0xabc"), /ANCHOR/);
  assert.throws(() => validateMeta(meta, cid, 50000000, "0xdef"), /HASH/);
  // Studio's number-based metadata may have no hash: never accept it as proof.
  assert.throws(
    () =>
      validateMeta(
        { ...meta, block: { number: 50000000, hash: null } },
        cid,
        50000000,
        "0xabc",
      ),
    /HASH/,
  );
  assert.throws(
    () => validateMeta({ ...meta, block: { number: 100 } }, cid),
    /NOT_READY/,
  );
});
test("accepts only the exact Polygon source identities and start blocks", () => {
  const stats = {
    chainId: 137,
    governor: GOVERNOR,
    mana: MANA,
    governorStartBlock: "48674443",
    manaStartBlock: "45785116",
  };
  validateSources(stats);
  for (const change of [
    { chainId: 1 },
    { mana: GOVERNOR },
    { governorStartBlock: "0" },
  ])
    assert.throws(() => validateSources({ ...stats, ...change }));
});
test("GraphQL errors and HTTP failures never become empty successful data", async () => {
  await assert.rejects(
    graphQuery("https://example.com", "{}", {}, async () =>
      Response.json({ errors: [{ message: "private details" }] }),
    ),
    /GRAPH_QUERY_FAILED/,
  );
  await assert.rejects(
    graphQuery(
      "https://example.com",
      "{}",
      {},
      async () => new Response("", { status: 429 }),
    ),
    /GRAPH_HTTP_FAILED/,
  );
  await assert.rejects(graphQuery("http://example.com", "{}"), /HTTPS/);
});
test("pagination preserves all rows and rejects stalled order or truncation", async () => {
  let calls = 0;
  const rows = await pagedEvents(async ({ after }) => {
    calls++;
    return {
      eventRecords:
        after === "0x"
          ? Array.from({ length: 500 }, (_, i) => ({
              id: "0x" + i.toString(16).padStart(8, "0"),
            }))
          : [{ id: "0xffffffff" }],
    };
  }, {});
  assert.equal(rows.length, 501);
  assert.equal(calls, 2);
  await assert.rejects(
    pagedEvents(async () => ({ eventRecords: [{ id: "0x" }] }), {}),
    /ORDER/,
  );
  await assert.rejects(
    pagedEvents(
      async ({ after }) => ({
        eventRecords: Array.from({ length: 500 }, (_, i) => ({
          id: after + "a" + i.toString().padStart(3, "0"),
        })),
      }),
      {},
    ),
    /LIMIT/,
  );
});
test("approval owner/spender remain distinct; provider-only metadata is discarded", () => {
  const row = { owner: GOVERNOR, spender: MANA, value: "5" };
  assert.deepEqual(
    comparableEvent({ ...row, providerDetail: "ignored" }),
    comparableEvent(row),
  );
  assert.notDeepEqual(
    comparableEvent(row),
    comparableEvent({ ...row, owner: MANA, spender: GOVERNOR }),
  );
});
test("Gateway credentials require explicit opt-in and never enter the query URL", async () => {
  const env = {
    GRAPH_PILOT_URL: "https://api.studio.thegraph.com/query/project",
    GRAPH_API_KEY: "test-only-query-credential",
  };
  assert.deepEqual(queryConnection(env), {
    url: env.GRAPH_PILOT_URL,
    kind: "studio-development",
  });
  assert.throws(() => queryConnection({}, true), /GRAPH_API_KEY_REQUIRED/);
  const connection = queryConnection(env, true);
  assert.equal(connection.url, GATEWAY_URL);
  const data = await graphQuery(
    connection.url,
    "{}",
    {},
    async (url, options) => {
      assert.equal(url, GATEWAY_URL);
      assert.equal(
        options.headers.Authorization,
        `Bearer ${env.GRAPH_API_KEY}`,
      );
      assert.equal(options.redirect, "error");
      return Response.json({ data: { ok: true } });
    },
    connection,
  );
  assert.deepEqual(data, { ok: true });
  for (const url of [
    "https://other.example/",
    GATEWAY_URL + "?redirect=elsewhere",
    GATEWAY_URL + "/extra",
  ]) {
    await assert.rejects(
      graphQuery(
        url,
        "{}",
        {},
        () => {
          throw new Error("must not fetch");
        },
        connection,
      ),
      /CREDENTIAL_DESTINATION/,
    );
  }
});
test("transport errors, malformed data and oversize streams fail without leaking details", async () => {
  await assert.rejects(
    graphQuery(GATEWAY_URL, "{}", {}, async () => {
      throw new Error("private URL/credential");
    }),
    /^Error: GRAPH_REQUEST_FAILED$/,
  );
  await assert.rejects(
    graphQuery(
      GATEWAY_URL,
      "{}",
      {},
      async () => new Response("private invalid JSON"),
    ),
    /^Error: GRAPH_RESPONSE_INVALID$/,
  );
  await assert.rejects(
    graphQuery(GATEWAY_URL, "{}", {}, async () => Response.json(null)),
    /GRAPH_QUERY_FAILED/,
  );
  let canceled = false;
  const body = new ReadableStream({
    pull(c) {
      c.enqueue(new Uint8Array(1_000_001));
    },
    cancel() {
      canceled = true;
    },
  });
  await assert.rejects(
    graphQuery(GATEWAY_URL, "{}", {}, async () => new Response(body)),
    /GRAPH_RESPONSE_TOO_LARGE/,
  );
  assert.equal(canceled, true);
});
