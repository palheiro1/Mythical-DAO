import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { network } from "./network";

beforeAll(() => {
  network.enable();
});
beforeEach(async () => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));
afterEach(() => {
  network.resetHandlers();
});
afterEach(async () => {
  await reset();
});
afterAll(() => {
  network.disable();
});
