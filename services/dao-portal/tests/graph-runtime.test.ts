import { expect, it } from "vitest";
import { build } from "esbuild";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as RuntimeResponse,
} from "miniflare";
import { GATEWAY_URL } from "../shared/graph-pilot.mjs";

it("queries through native workerd fetch and rejects redirects without forwarding the credential", async () => {
  const bundle = await build({
    stdin: {
      contents: `import {graphQuery,GATEWAY_URL} from "./shared/graph-pilot.mjs";
        export default {async fetch(){
          try {return Response.json(await graphQuery(GATEWAY_URL,"{}",{},fetch,{apiKey:"test-only-query-credential"}));}
          catch(error){return Response.json({error:error.message},{status:502});}
        }}`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  let redirect = false;
  const destinations: string[] = [];
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "graph-runtime",
          modules: true,
          script: bundle.outputFiles[0].text,
          compatibilityDate: "2026-09-28",
          outboundService: (request) => {
            destinations.push(request.url);
            expect(request.headers.get("Authorization")).toBe(
              "Bearer test-only-query-credential",
            );
            expect(request.headers.get("Origin")).toBe(
              "https://dao-preview.mythicalbeings.io",
            );
            return redirect
              ? new RuntimeResponse(null, {
                  status: 302,
                  headers: { Location: "https://unapproved.invalid/" },
                })
              : RuntimeResponse.json({ data: { ok: true } });
          },
        },
      ],
    }),
  );
  try {
    const success = await mf.dispatchFetch("https://test/");
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({ ok: true });
    redirect = true;
    const rejected = await mf.dispatchFetch("https://test/");
    expect(rejected.status).toBe(502);
    expect(await rejected.json()).toEqual({ error: "GRAPH_REDIRECT_REJECTED" });
    expect(destinations).toEqual([GATEWAY_URL, GATEWAY_URL]);
  } finally {
    await mf.dispose();
  }
});
