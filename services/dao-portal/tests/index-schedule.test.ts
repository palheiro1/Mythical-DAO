import { expect, it } from "vitest";
import { scheduleSources } from "../worker/index-schedule";
import { indexSources } from "../shared/sync";
import { config } from "../worker/config";

it("rotates every source on a one-source cron while giving governance more turns", () => {
  const sources = indexSources(config({ ENVIRONMENT: "local" } as Env));
  const attempts = new Map<string, number>();
  const counts = new Map<string, number>();
  for (let minute = 0; minute < 30; minute++) {
    const selected = scheduleSources(sources, attempts, 1);
    expect(selected).toHaveLength(1);
    const key = selected[0].key;
    attempts.set(key, 1_800_000_000_000 + minute * 60_000);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  expect([...counts.keys()].sort()).toEqual(sources.map((s) => s.key).sort());
  const governance = sources
    .filter((s) => s.governance)
    .map((s) => counts.get(s.key)!);
  const assets = sources
    .filter((s) => !s.governance)
    .map((s) => counts.get(s.key)!);
  expect(Math.min(...governance)).toBeGreaterThan(Math.max(...assets));
});

it("an interrupted attempt takes its turn without advancing a cursor or monopolizing future runs", () => {
  const sources = indexSources(config({ ENVIRONMENT: "local" } as Env));
  const attempts = new Map<string, number>();
  const first = scheduleSources(sources, attempts, 1)[0];
  attempts.set(first.key, Date.now());
  const second = scheduleSources(sources, attempts, 1)[0];
  expect(second.key).not.toBe(first.key);
  expect(sources.every((s) => !Object.hasOwn(s, "indexedBlock"))).toBe(true);
});
