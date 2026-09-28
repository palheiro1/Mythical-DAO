import { getAddress } from "viem";
import type { ServiceConfig } from "./types";

function integer(value: string, name: string, minimum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`Invalid ${name}`);
  }
  return parsed;
}

function bigintInteger(value: string, name: string, minimum: bigint): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`Invalid ${name}`);
  }
  if (parsed < minimum) {
    throw new Error(`Invalid ${name}`);
  }
  return parsed;
}

function httpsUrl(value: string, name: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS`);
  }
  return url.toString();
}

export function readConfig(env: Env): ServiceConfig {
  const chainId = integer(env.POLYGON_CHAIN_ID, "POLYGON_CHAIN_ID", 1);
  if (chainId !== 137) {
    throw new Error("POLYGON_CHAIN_ID must be 137 for the configured Governor");
  }

  return {
    environment: env.ENVIRONMENT,
    snapshotSpace: env.SNAPSHOT_SPACE,
    snapshotApiUrl: httpsUrl(env.SNAPSHOT_API_URL, "SNAPSHOT_API_URL"),
    snapshotWebBaseUrl: httpsUrl(env.SNAPSHOT_WEB_BASE_URL, "SNAPSHOT_WEB_BASE_URL"),
    polygonChainId: chainId,
    governorAddress: getAddress(env.GOVERNOR_ADDRESS),
    governorDeploymentBlock: bigintInteger(
      env.GOVERNOR_DEPLOYMENT_BLOCK,
      "GOVERNOR_DEPLOYMENT_BLOCK",
      1n,
    ),
    polygonConfirmations: bigintInteger(env.POLYGON_CONFIRMATIONS, "POLYGON_CONFIRMATIONS", 1n),
    polygonLogChunkSize: bigintInteger(env.POLYGON_LOG_CHUNK_SIZE, "POLYGON_LOG_CHUNK_SIZE", 1n),
    polygonHistoryChunksPerRun: integer(
      env.POLYGON_HISTORY_CHUNKS_PER_RUN,
      "POLYGON_HISTORY_CHUNKS_PER_RUN",
      1,
    ),
    polygonRecentSeedBlocks: bigintInteger(
      env.POLYGON_RECENT_SEED_BLOCKS,
      "POLYGON_RECENT_SEED_BLOCKS",
      1n,
    ),
    polygonBlockTimeSeconds: integer(
      env.POLYGON_BLOCK_TIME_SECONDS,
      "POLYGON_BLOCK_TIME_SECONDS",
      1,
    ),
    tallyProposalBaseUrl: httpsUrl(env.TALLY_PROPOSAL_BASE_URL, "TALLY_PROPOSAL_BASE_URL"),
    polygonScanTxBaseUrl: httpsUrl(env.POLYGONSCAN_TX_BASE_URL, "POLYGONSCAN_TX_BASE_URL"),
  };
}
