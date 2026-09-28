import { isAddress, type Address } from "viem";
import baseManifest from "../deployments/polygon.json";
import type { PortalConfig, Role } from "../shared/domain";
const roles: Role[] = [
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
    enabled &&
    ["governor", "timelock", "vault", "ballots", "mana", "weth", "usdc"].some(
      (role) => !contracts[role as Role],
    )
  )
    throw new Error("Incomplete deployment");
  const confirmations = Number(raw.confirmations ?? 64);
  if (
    !Number.isInteger(confirmations) ||
    confirmations < 0 ||
    (env.ENVIRONMENT !== "local" && confirmations < 64)
  )
    throw new Error("Unsafe confirmation count");
  if (env.ENVIRONMENT === "production" && enabled) {
    const release = raw.release as Record<string, unknown> | undefined;
    if (
      !release?.independentReview ||
      !release.daoApproval ||
      !release.migration ||
      release.revenuesReconciled !== true ||
      release.permissionsVerified !== true
    )
      throw new Error("Release evidence missing");
  }
  return {
    chainId: Number(raw.chainId),
    environment: env.ENVIRONMENT,
    contracts,
    confirmations,
    enabled,
    portalUrl: String(raw.portalUrl),
  };
}
