import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc", environment: "staging" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL("./migrations", import.meta.url)),
          ),
          TELEGRAM_BOT_TOKEN: "test-token",
          TELEGRAM_CHANNEL_ID: "@test-channel",
          ADMIN_CHAT_ID: "123456",
          POLYGON_RPC_URL: "https://polygon.example.test",
          ADMIN_API_TOKEN: "test-admin-token",
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
  },
});
