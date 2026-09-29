import { isAddress, zeroAddress, type Address } from "viem";
import baseManifest from "../deployments/polygon.json";
import type { PortalConfig, Role } from "../shared/domain";
const roles: Role[] = [
  "treasury",
  "ragequitModule",
  "gem",
  "usdcNative",
  "usdcBridged",
  "mana",
  "legacyGovernor",
  "governor",
  "timelock",
  "vault",
  "ballots",
  "weth",
  "usdc",
];
export function config(env: Env): PortalConfig {
  const raw: Record<string, unknown> = env.DEPLOYMENT_MANIFEST
    ? JSON.parse(env.DEPLOYMENT_MANIFEST)
    : baseManifest;
  if (![137, 80002, 31337].includes(Number(raw.chainId)))
    throw new Error("Invalid chain configuration");
  const contracts: PortalConfig["contracts"] = {};
  for (const role of roles) {
    const entry = (
      raw.contracts as
        Record<string, { address: string; startBlock: string }> | undefined
    )?.[role];
    if (!entry) continue;
    if (
      !isAddress(entry.address) ||
      entry.address.toLowerCase() === zeroAddress ||
      !/^\d+$/.test(entry.startBlock) ||
      BigInt(entry.startBlock) > BigInt(Number.MAX_SAFE_INTEGER)
    )
      throw new Error("Invalid contract configuration");
    contracts[role] = {
      address: entry.address.toLowerCase() as Address,
      startBlock: entry.startBlock,
    };
  }
  const enabled = raw.enabled === true;
  if (
    (enabled || !!contracts.ragequitModule) &&
    [
      "governor",
      "treasury",
      "mana",
      "gem",
      "weth",
      "usdcNative",
      "usdcBridged",
    ].some((role) => !contracts[role as Role])
  )
    throw new Error("Incomplete deployment");
  const confirmations = Number(raw.confirmations ?? 64);
  if (
    !Number.isInteger(confirmations) ||
    confirmations < 0 ||
    (env.ENVIRONMENT !== "local" && confirmations < 64)
  )
    throw new Error("Unsafe confirmation count");
  if (raw.schemaVersion !== 2 || raw.architecture !== "existing-governor")
    throw new Error(
      "Use the version 2 existing-governor manifest; historical manifests are not active configurations",
    );
  if (contracts.governor?.address !== contracts.treasury?.address)
    throw new Error("The existing Governor must remain the treasury");
  if (contracts.usdcNative?.address === contracts.usdcBridged?.address)
    throw new Error("Native USDC and historical USDC.e must be distinct");
  if (
    contracts.usdc &&
    contracts.usdc.address !== contracts.usdcBridged?.address
  )
    throw new Error(
      "The historical usdc alias must retain its USDC.e identity",
    );
  if (Number(raw.chainId) === 137 && env.ENVIRONMENT !== "local") {
    for (const role of [
      "governor",
      "treasury",
      "mana",
      "gem",
      "weth",
      "usdcNative",
      "usdcBridged",
    ] as const) {
      if (
        contracts[role]?.address !==
        baseManifest.contracts[role].address.toLowerCase()
      )
        throw new Error(
          "Polygon contract identity differs from the approved architecture: " +
            role,
        );
    }
  }
  const snapshotUrl = String(raw.snapshotUrl);
  if (
    !snapshotUrl.startsWith("https://snapshot.box/") &&
    !snapshotUrl.startsWith("https://snapshot.org/")
  )
    throw new Error("Invalid Snapshot URL");
  return {
    schemaVersion: 2,
    architecture: "existing-governor",
    snapshotUrl,
    capabilities: {
      governance: "existing-governor",
      snapshot: "external",
      timelock: false,
      ragequit: !!contracts.ragequitModule,
    },
    chainId: Number(raw.chainId),
    environment: env.ENVIRONMENT,
    contracts,
    confirmations,
    enabled,
    portalUrl: env.PORTAL_ORIGIN || String(raw.portalUrl),
  };
}
