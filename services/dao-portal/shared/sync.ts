import type { Address } from "viem";
import type { Health, PortalConfig, Role } from "./domain";

export type IndexSource = {
  role: string;
  address: Address;
  startBlock: string;
  key: string;
  approvals: boolean;
  label: string;
  governance: boolean;
};
const names: Record<Role, string> = {
  governor: "Governor / treasury",
  treasury: "Governor / treasury",
  legacyGovernor: "Original Governor",
  mana: "MANA",
  gem: "GEM",
  weth: "WETH",
  usdcNative: "USDC",
  usdcBridged: "USDC.e",
  usdc: "USDC.e",
  ragequitModule: "Ragequit",
  vault: "Historical vault",
  ballots: "Historical ballots",
  timelock: "Historical timelock",
};

// One definition for the indexer and its progress report, including aliases and
// separate Approval backfills. An absent cursor must still count as zero work.
export function indexSources(cfg: PortalConfig): IndexSource[] {
  const unique = new Map<string, IndexSource>();
  for (const [role, entry] of Object.entries(cfg.contracts)) {
    const key = entry.address.toLowerCase();
    const prior = unique.get(key);
    if (!prior || BigInt(entry.startBlock) < BigInt(prior.startBlock)) {
      const governor = key === cfg.contracts.governor?.address.toLowerCase();
      unique.set(key, {
        role,
        ...entry,
        key,
        approvals: false,
        label: governor ? names.governor : names[role as Role],
        governance:
          governor || key === cfg.contracts.mana?.address.toLowerCase(),
      });
    }
  }
  const sources = [...unique.values()];
  if (cfg.contracts.ragequitModule)
    for (const role of ["gem", "weth", "usdcNative"] as const) {
      const entry = cfg.contracts[role];
      if (!entry) continue;
      sources.push({
        role,
        ...entry,
        startBlock: cfg.contracts.ragequitModule.startBlock,
        key: `${entry.address.toLowerCase()}:approval:${cfg.contracts.ragequitModule.address.toLowerCase()}`,
        approvals: true,
        label: `${names[role]} authorizations`,
        governance: false,
      });
    }
  return sources;
}

export type SyncProgress = ReturnType<typeof syncProgress>;
export function syncProgress(
  cfg: PortalConfig,
  cursors: Health["sources"],
  target: string | null,
) {
  const byKey = new Map(cursors.map((c) => [c.contract.toLowerCase(), c]));
  const sources = indexSources(cfg).map((source) => {
    const cursor = byKey.get(source.key);
    const start = BigInt(source.startBlock);
    const total =
      target === null
        ? null
        : BigInt(target) < start
          ? 0n
          : BigInt(target) - start + 1n;
    const indexed = cursor ? BigInt(cursor.block) - start + 1n : 0n;
    const done =
      total === null
        ? null
        : indexed < 0n
          ? 0n
          : indexed > total
            ? total
            : indexed;
    return {
      key: source.key,
      label: source.label,
      governance: source.governance,
      startBlock: source.startBlock,
      indexedBlock: cursor?.block ?? null,
      targetBlock: target,
      updatedAt: cursor?.updatedAt ?? null,
      checkedBlocks: done === null ? null : String(done),
      totalBlocks: total === null ? null : String(total),
      percent: done === null || total === null ? null : percentage(done, total),
    };
  });
  const aggregate = (rows: typeof sources) => {
    if (!rows.length || target === null) return null;
    return percentage(
      rows.reduce((n, s) => n + BigInt(s.checkedBlocks!), 0n),
      rows.reduce((n, s) => n + BigInt(s.totalBlocks!), 0n),
    );
  };
  return {
    percent: aggregate(sources),
    governancePercent: aggregate(sources.filter((s) => s.governance)),
    targetBlock: target,
    updatedAt: sources.reduce<number | null>(
      (latest, s) =>
        s.updatedAt === null ? latest : Math.max(latest ?? 0, s.updatedAt),
      null,
    ),
    sources,
  };
}
function percentage(done: bigint, total: bigint): number {
  // Floor rather than round: incomplete coverage must never display as 100%.
  return total === 0n ? 100 : Number((done * 10_000n) / total) / 100;
}
