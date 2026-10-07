import { cpSync, mkdirSync, writeFileSync } from "node:fs";

// Reuse the validated local build. Only static assets are uploaded to Vercel.
// The existing API and indexer retain their Cloudflare D1 binding.
const api = new URL(
  process.env.PORTAL_API_ORIGIN ??
    "https://mythical-dao-portal-staging.mythical-beings.workers.dev",
);
if (
  api.protocol !== "https:" ||
  api.pathname !== "/" ||
  api.search ||
  api.username ||
  api.password
)
  throw new Error("PORTAL_API_ORIGIN must be an HTTPS origin");
mkdirSync(".vercel/output", { recursive: true });
cpSync("dist", ".vercel/output/static", { recursive: true });
writeFileSync(
  ".vercel/output/config.json",
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "/(.*)",
          headers: {
            "X-Robots-Tag": "noindex, nofollow",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "X-Frame-Options": "DENY",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
            "Content-Security-Policy":
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' https: wss:; frame-src https://emerald.widgetbot.io; frame-ancestors 'none'; base-uri 'self'; object-src 'none';",
          },
          continue: true,
        },
        { src: "/api/(.*)", dest: `${api.origin}/api/$1` },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log("Prepared Vercel preview artifacts with the staging API.");
