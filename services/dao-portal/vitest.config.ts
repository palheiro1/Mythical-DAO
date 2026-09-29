import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.mjs"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
