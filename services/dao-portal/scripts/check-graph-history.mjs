// Read-only live acceptance using an ephemeral local D1; never changes remote flags/cursors.
// Run with Node --env-file=.dev.vars --env-file=../dao-subgraph/.env.
import { build } from "esbuild";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const filename = resolve(`.task-graph-live-${randomUUID()}.mjs`);
const source = `
import {compareGraph} from './worker/graph-comparison.ts';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';
import {readFileSync,readdirSync} from 'node:fs';
export async function check() {
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'graph-acceptance',modules:true,
    script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-28',d1Databases:{DAO_DB:'acceptance'}}]}));
  try {
    const db=await mf.getD1Database('DAO_DB');
    await db.batch(readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort()
      .flatMap(x=>unstable_splitSqlQuery(readFileSync('migrations/'+x,'utf8'))).map(s=>db.prepare(s)));
    return await compareGraph({...process.env,DAO_DB:db,ENVIRONMENT:'local',DEPLOYMENT_MANIFEST:'',
      GRAPH_READ_MODE:'verified',GRAPH_REORG_VERIFIED:'true'});
  } finally {await mf.dispose();}
}`;
try {
  const result = await build({
    stdin: { contents: source, resolveDir: process.cwd() },
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    write: false,
    logLevel: "silent",
  });
  writeFileSync(filename, result.outputFiles[0].contents, { mode: 0o600 });
  const report = await (await import(pathToFileURL(filename).href)).check();
  const output = {
    checkedAt: new Date().toISOString(),
    purpose: "Manual read-only acceptance; no remote state or flags changed",
    ...report,
  };
  mkdirSync("docs/evidence", { recursive: true });
  const destination =
    process.env.GRAPH_HISTORY_REPORT_PATH ??
    "docs/evidence/graph-history-acceptance.json";
  writeFileSync(destination, JSON.stringify(output, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: report.status,
      anchor: report.anchor,
      events: report.history?.events.length,
      delegateCandidates: report.history?.delegateCandidates.length,
      fullHistoryVerified: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "failed",
      reason: /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "GRAPH_LIVE_ACCEPTANCE_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  try {
    unlinkSync(filename);
  } catch {}
}
