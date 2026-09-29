import { expect, it } from "vitest";
import type { PortalConfig } from "../shared/domain";
import { indexSources, syncProgress } from "../shared/sync";
import { config } from "../worker/config";

const cfg = config({ ENVIRONMENT: "staging", DEPLOYMENT_MANIFEST: "" } as Env);
const cursor = (role: "governor" | "mana", block: string) => ({
  contract: cfg.contracts[role]!.address,
  block,
  updatedAt: 12345,
});

it("deduplicates treasury/Governor and USDC.e aliases and includes sources without cursors", () => {
  const report = syncProgress(cfg, [], "94600000");
  expect(report.sources).toHaveLength(6);
  expect(
    report.sources.filter((s) => s.label === "Governor / treasury"),
  ).toHaveLength(1);
  expect(report.sources.filter((s) => s.label === "USDC.e")).toHaveLength(1);
  expect(report.percent).toBe(0);
  expect(
    report.sources.every((s) => s.indexedBlock === null && s.percent === 0),
  ).toBe(true);
});
it("measures coverage from deployment, not the absolute block number, and weights missing sources", () => {
  const report = syncProgress(
    cfg,
    [cursor("governor", "48679442")],
    "94674442",
  );
  const governor = report.sources.find(
    (s) => s.governance && s.label !== "MANA",
  )!;
  expect(governor.checkedBlocks).toBe("5000");
  expect(governor.percent).toBe(0.01);
  expect(report.percent).toBe(0);
});
it("does not round unfinished sync to 100%, and a reorg can lower progress", () => {
  const single: PortalConfig = {
    ...cfg,
    contracts: {
      governor: { address: cfg.contracts.governor!.address, startBlock: "1" },
    },
  };
  expect(
    syncProgress(single, [cursor("governor", "999999")], "1000000").percent,
  ).toBe(99.99);
  expect(
    syncProgress(single, [cursor("governor", "400000")], "1000000").percent,
  ).toBe(40);
  expect(
    syncProgress(single, [cursor("governor", "1000100")], "1000000").percent,
  ).toBe(100);
});
it("keeps saved cursors but reports unknown progress when the current head cannot be verified", () => {
  const report = syncProgress(cfg, [cursor("mana", "45800115")], null);
  expect(report.percent).toBeNull();
  expect(report.governancePercent).toBeNull();
  expect(report.sources.find((s) => s.label === "MANA")!.indexedBlock).toBe(
    "45800115",
  );
});
it("counts independently backfilled module authorizations from module deployment only", () => {
  const moduleCfg: PortalConfig = {
    ...cfg,
    contracts: {
      ...cfg.contracts,
      ragequitModule: {
        address: "0x0000000000000000000000000000000000000008",
        startBlock: "94000000",
      },
    },
  };
  const sources = indexSources(moduleCfg);
  expect(sources).toHaveLength(10);
  expect(sources.filter((s) => s.approvals)).toHaveLength(3);
  expect(
    sources
      .filter((s) => s.approvals)
      .every((s) => s.startBlock === "94000000" && !s.governance),
  ).toBe(true);
});
