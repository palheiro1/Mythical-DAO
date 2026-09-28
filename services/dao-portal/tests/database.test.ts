import { beforeAll, afterAll, it, expect } from "vitest";
import { database } from "./db-fixture";
let mf: Awaited<ReturnType<typeof database>>["mf"];
beforeAll(async () => {
  ({ mf } = await database());
});
afterAll(async () => {
  await mf?.dispose();
});
it("deduplicates full chain/contract/transaction/log identity", async () => {
  const db = await mf.getD1Database("DAO_DB");
  const insert = () =>
    db
      .prepare("INSERT OR IGNORE INTO events VALUES(137,?,10,?,?,0,?,?)")
      .bind(
        "0x1",
        "0xblock",
        "0xtx",
        "ProposalCreated",
        '{"proposalId":"123456789012345678901234567890"}',
      )
      .run();
  await insert();
  await insert();
  expect(
    (
      await db
        .prepare("SELECT COUNT(*) AS count FROM events")
        .first<{ count: number }>()
    )?.count,
  ).toBe(1);
  expect(
    (
      await db
        .prepare("SELECT args_json FROM events")
        .first<{ args_json: string }>()
    )?.args_json,
  ).toContain("123456789012345678901234567890");
});
it("rolls back an entire batch if its lease expired", async () => {
  const db = await mf.getD1Database("DAO_DB");
  await expect(
    db.batch([
      db.prepare("INSERT INTO cursors VALUES(137,'0xstale',100,'hash',1)"),
      db.prepare("INSERT INTO lease_guard VALUES('expired-owner')"),
    ]),
  ).rejects.toThrow();
  expect(
    await db.prepare("SELECT * FROM cursors WHERE contract='0xstale'").first(),
  ).toBeNull();
});
it("allows the lease owner to persist events and cursor atomically", async () => {
  const db = await mf.getD1Database("DAO_DB");
  await db
    .prepare("INSERT INTO index_lock VALUES(1,'owner',unixepoch()+120)")
    .run();
  await db.batch([
    db.prepare("INSERT INTO lease_guard VALUES('owner')"),
    db.prepare("INSERT INTO cursors VALUES(137,'0xactive',100,'hash',1)"),
  ]);
  expect(
    (
      await db
        .prepare("SELECT block_number FROM cursors WHERE contract='0xactive'")
        .first<{ block_number: number }>()
    )?.block_number,
  ).toBe(100);
  expect(
    (
      await db
        .prepare("SELECT COUNT(*) AS count FROM lease_guard")
        .first<{ count: number }>()
    )?.count,
  ).toBe(0);
});
