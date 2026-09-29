import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { readFileSync, readdirSync } from "node:fs";
export async function database() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "test",
          modules: true,
          script: 'export default {fetch(){return new Response("ok")}}',
          compatibilityDate: "2026-09-28",
          d1Databases: { DAO_DB: "test-governance" },
        },
      ],
    }),
  );
  const db = await mf.getD1Database("DAO_DB");
  await db.batch(
    readdirSync("migrations")
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .flatMap((name) =>
        unstable_splitSqlQuery(readFileSync(`migrations/${name}`, "utf8")),
      )
      .map((s) => db.prepare(s)),
  );
  return { mf, db, bindings: await mf.getBindings<Env>() };
}
