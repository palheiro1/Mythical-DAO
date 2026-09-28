import {
  createPublicClient,
  http,
  parseAbi,
  parseAbiItem,
  type PublicClient,
} from "viem";
import { polygon } from "viem/chains";
import {
  enqueueNotification,
  getCursor,
  getProposal,
  listTrackableGovernorProposals,
  setCursor,
  upsertProposal,
} from "./db";
import { renderGovernanceMessage } from "./messages";
import type {
  GovernanceEventType,
  NotificationEvent,
  ProposalRecord,
  ServiceConfig,
} from "./types";
import { estimateBlockTime, extractGovernorTitle } from "./utils";

const governorAbi = parseAbi([
  "function state(uint256 proposalId) view returns (uint8)",
  "function proposalVotes(uint256 proposalId) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
]);

const proposalCreatedEvent = parseAbiItem(
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
);
const proposalCanceledEvent = parseAbiItem("event ProposalCanceled(uint256 proposalId)");
const proposalExecutedEvent = parseAbiItem("event ProposalExecuted(uint256 proposalId)");

const GOVERNOR_STATES = [
  "pending",
  "active",
  "cancelled",
  "defeated",
  "succeeded",
  "queued",
  "expired",
  "executed",
] as const;

type GovernorState = (typeof GOVERNOR_STATES)[number];
type PolygonClient = PublicClient<ReturnType<typeof http>, typeof polygon>;

interface HeadContext {
  safeHead: bigint;
  safeHeadTimestamp: number;
}

function createPolygonClient(env: Env): PolygonClient {
  return createPublicClient({
    chain: polygon,
    transport: http(env.POLYGON_RPC_URL, { retryCount: 2, timeout: 10_000 }),
  });
}

function stateName(value: number): GovernorState {
  const state = GOVERNOR_STATES[value];
  if (state === undefined) throw new Error(`Governor returned unknown state ${String(value)}`);
  return state;
}

export function governorEventForTransition(
  previous: string | null,
  current: GovernorState,
): GovernanceEventType | null {
  if (previous === current) return null;
  if (current === "pending") return previous === null ? "created" : null;
  if (current === "active") return "active";
  if (current === "succeeded" || current === "queued") return "succeeded";
  if (current === "defeated") return "defeated";
  if (current === "cancelled") return "cancelled";
  if (current === "expired") return "expired";
  return "executed";
}

export function safeHeadFromLatest(latestBlock: bigint, confirmations: bigint): bigint {
  if (latestBlock <= confirmations) {
    throw new Error("Polygon head is lower than the configured confirmation margin");
  }
  return latestBlock - confirmations;
}

async function readGovernorState(
  client: PolygonClient,
  config: ServiceConfig,
  proposalId: bigint,
): Promise<{ state: GovernorState; againstVotes: bigint; forVotes: bigint; abstainVotes: bigint }> {
  const [rawState, votes] = await Promise.all([
    client.readContract({
      address: config.governorAddress,
      abi: governorAbi,
      functionName: "state",
      args: [proposalId],
    }),
    client.readContract({
      address: config.governorAddress,
      abi: governorAbi,
      functionName: "proposalVotes",
      args: [proposalId],
    }),
  ]);
  return {
    state: stateName(rawState),
    againstVotes: votes[0],
    forVotes: votes[1],
    abstainVotes: votes[2],
  };
}

async function enqueue(
  env: Env,
  proposal: ProposalRecord,
  eventType: GovernanceEventType,
  now: number,
): Promise<void> {
  const event: NotificationEvent = {
    eventKey: `polygon:${env.POLYGON_CHAIN_ID}:${env.GOVERNOR_ADDRESS.toLowerCase()}:${proposal.proposalId}:${eventType}`,
    source: "governor",
    proposalId: proposal.proposalId,
    eventType,
    occurredAt: now,
    messageHtml: renderGovernanceMessage(proposal, eventType),
  };
  await enqueueNotification(env.DB, event, env.TELEGRAM_CHANNEL_ID, now);
}

function withEstimatedTimes(
  proposal: ProposalRecord,
  head: HeadContext,
  config: ServiceConfig,
): ProposalRecord {
  return {
    ...proposal,
    startsAt: estimateBlockTime(
      proposal.startBlock,
      head.safeHead,
      head.safeHeadTimestamp,
      config.polygonBlockTimeSeconds,
    ),
    endsAt: estimateBlockTime(
      proposal.endBlock,
      head.safeHead,
      head.safeHeadTimestamp,
      config.polygonBlockTimeSeconds,
    ),
  };
}

async function refreshProposal(
  env: Env,
  client: PolygonClient,
  config: ServiceConfig,
  proposal: ProposalRecord,
  head: HeadContext,
  now: number,
  allowNotifications: boolean,
): Promise<ProposalRecord> {
  const state = await readGovernorState(client, config, BigInt(proposal.proposalId));
  const current = withEstimatedTimes(
    {
      ...proposal,
      state: state.state,
      metadata: {
        ...proposal.metadata,
        againstVotes: state.againstVotes.toString(),
        forVotes: state.forVotes.toString(),
        abstainVotes: state.abstainVotes.toString(),
      },
      updatedAt: now,
    },
    head,
    config,
  );
  await upsertProposal(env.DB, current);

  if (allowNotifications && current.notificationsEnabled) {
    const eventType = governorEventForTransition(proposal.state, state.state);
    if (eventType !== null) {
      await enqueue(env, current, eventType, now);
    }
    if (state.state === "active" && current.endBlock !== null) {
      const remainingBlocks = BigInt(current.endBlock) - head.safeHead;
      const remainingSeconds = Number(remainingBlocks) * config.polygonBlockTimeSeconds;
      if (remainingBlocks > 0n && remainingSeconds <= 86_400) {
        await enqueue(env, current, "reminder_24h", now);
      }
    }
  }
  return current;
}

async function processCreatedLog(
  env: Env,
  client: PolygonClient,
  config: ServiceConfig,
  log: Awaited<ReturnType<PolygonClient["getLogs"]>>[number] & {
    args: {
      proposalId?: bigint;
      voteStart?: bigint;
      voteEnd?: bigint;
      description?: string;
    };
  },
  head: HeadContext,
  now: number,
  allowNotifications: boolean,
): Promise<void> {
  const { proposalId, voteStart, voteEnd, description } = log.args;
  if (proposalId === undefined || voteStart === undefined || voteEnd === undefined || description === undefined) {
    throw new Error("Governor emitted a malformed ProposalCreated event");
  }
  const proposalKey = proposalId.toString();
  const previous = await getProposal(env.DB, "governor", proposalKey);
  const base: ProposalRecord = {
    source: "governor",
    proposalId: proposalKey,
    title: extractGovernorTitle(description),
    url: `${config.tallyProposalBaseUrl}${proposalKey}`,
    state: previous?.state ?? "pending",
    createdAt: estimateBlockTime(
      log.blockNumber === null ? null : Number(log.blockNumber),
      head.safeHead,
      head.safeHeadTimestamp,
      config.polygonBlockTimeSeconds,
    ),
    startsAt: null,
    endsAt: null,
    startBlock: Number(voteStart),
    endBlock: Number(voteEnd),
    choices: null,
    scores: null,
    metadata: {
      ...previous?.metadata,
      ...(log.transactionHash
        ? {
            transactionHash: log.transactionHash,
            transactionUrl: `${config.polygonScanTxBaseUrl}${log.transactionHash}`,
          }
        : {}),
    },
    notificationsEnabled: true,
    firstSeenAt: previous?.firstSeenAt ?? now,
    updatedAt: now,
  };
  const stored = withEstimatedTimes(base, head, config);
  await upsertProposal(env.DB, stored);
  const refreshed = await refreshProposal(
    env,
    client,
    config,
    stored,
    head,
    now,
    false,
  );

  if (allowNotifications && previous === null) {
    const eventType = governorEventForTransition(null, refreshed.state as GovernorState);
    if (eventType !== null) {
      await enqueue(env, refreshed, eventType, now);
    }
  }
}

async function scanCreatedRange(
  env: Env,
  client: PolygonClient,
  config: ServiceConfig,
  fromBlock: bigint,
  toBlock: bigint,
  head: HeadContext,
  now: number,
  allowNotifications: boolean,
): Promise<void> {
  if (fromBlock > toBlock) return;
  const logs = await client.getLogs({
    address: config.governorAddress,
    event: proposalCreatedEvent,
    fromBlock,
    toBlock,
    strict: true,
  });
  for (const log of logs) {
    await processCreatedLog(env, client, config, log, head, now, allowNotifications);
  }
}

async function scanLiveRange(
  env: Env,
  client: PolygonClient,
  config: ServiceConfig,
  fromBlock: bigint,
  toBlock: bigint,
  head: HeadContext,
  now: number,
): Promise<void> {
  if (fromBlock > toBlock) return;
  const [created, cancelled, executed] = await Promise.all([
    client.getLogs({
      address: config.governorAddress,
      event: proposalCreatedEvent,
      fromBlock,
      toBlock,
      strict: true,
    }),
    client.getLogs({
      address: config.governorAddress,
      event: proposalCanceledEvent,
      fromBlock,
      toBlock,
      strict: true,
    }),
    client.getLogs({
      address: config.governorAddress,
      event: proposalExecutedEvent,
      fromBlock,
      toBlock,
      strict: true,
    }),
  ]);

  for (const log of created) {
    await processCreatedLog(env, client, config, log, head, now, true);
  }
  for (const log of [...cancelled, ...executed]) {
    const proposalId = log.args.proposalId;
    const proposal = await getProposal(env.DB, "governor", proposalId.toString());
    if (proposal === null) continue;
    await upsertProposal(env.DB, {
      ...proposal,
      metadata: {
        ...proposal.metadata,
        transactionHash: log.transactionHash,
        transactionUrl: `${config.polygonScanTxBaseUrl}${log.transactionHash}`,
      },
      updatedAt: now,
    });
  }
}

async function scanRangeInChunks(
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint,
  scan: (from: bigint, to: bigint) => Promise<void>,
): Promise<void> {
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const chunkEnd = cursor + chunkSize - 1n > toBlock ? toBlock : cursor + chunkSize - 1n;
    await scan(cursor, chunkEnd);
    cursor = chunkEnd + 1n;
  }
}

async function seedRecentProposals(
  env: Env,
  client: PolygonClient,
  config: ServiceConfig,
  head: HeadContext,
  now: number,
): Promise<void> {
  const fromBlock =
    head.safeHead - config.polygonRecentSeedBlocks > config.governorDeploymentBlock
      ? head.safeHead - config.polygonRecentSeedBlocks
      : config.governorDeploymentBlock;
  await scanRangeInChunks(fromBlock, head.safeHead, config.polygonLogChunkSize, async (from, to) =>
    scanCreatedRange(env, client, config, from, to, head, now, false),
  );
}

async function backfillHistory(
  env: Env,
  client: PolygonClient,
  config: ServiceConfig,
  head: HeadContext,
  now: number,
): Promise<void> {
  const storedCursor = await getCursor(env.DB, "polygon_history");
  if (storedCursor === "complete") return;
  let cursor = storedCursor === null ? config.governorDeploymentBlock : BigInt(storedCursor);

  for (let index = 0; index < config.polygonHistoryChunksPerRun && cursor <= head.safeHead; index += 1) {
    const chunkEnd =
      cursor + config.polygonLogChunkSize - 1n > head.safeHead
        ? head.safeHead
        : cursor + config.polygonLogChunkSize - 1n;
    await scanCreatedRange(env, client, config, cursor, chunkEnd, head, now, false);
    cursor = chunkEnd + 1n;
    await setCursor(env.DB, "polygon_history", cursor.toString(), now);
  }

  if (cursor > head.safeHead) {
    await setCursor(env.DB, "polygon_history", "complete", now);
  }
}

export async function pollGovernor(env: Env, config: ServiceConfig, now: number): Promise<void> {
  const client = createPolygonClient(env);
  const latestBlock = await client.getBlockNumber();
  const safeHead = safeHeadFromLatest(latestBlock, config.polygonConfirmations);
  const safeBlock = await client.getBlock({ blockNumber: safeHead });
  const head: HeadContext = {
    safeHead,
    safeHeadTimestamp: Number(safeBlock.timestamp),
  };
  const liveCursor = await getCursor(env.DB, "polygon_live");
  const firstRun = liveCursor === null;

  if (firstRun) {
    await seedRecentProposals(env, client, config, head, now);
    await setCursor(env.DB, "polygon_live", safeHead.toString(), now);
    if ((await getCursor(env.DB, "polygon_history")) === null) {
      await setCursor(env.DB, "polygon_history", config.governorDeploymentBlock.toString(), now);
    }
  } else {
    const fromBlock = BigInt(liveCursor) + 1n;
    await scanRangeInChunks(fromBlock, safeHead, config.polygonLogChunkSize, async (from, to) =>
      scanLiveRange(env, client, config, from, to, head, now),
    );
    await setCursor(env.DB, "polygon_live", safeHead.toString(), now);
    await backfillHistory(env, client, config, head, now);
  }

  const trackable = (await listTrackableGovernorProposals(env.DB)).filter(proposal => proposal.metadata.portal !== "v2");
  for (const proposal of trackable) {
    await refreshProposal(env, client, config, proposal, head, now, !firstRun);
  }
}
