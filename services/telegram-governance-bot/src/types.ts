import type { Address, Hex } from "viem";

export type GovernanceSource = "snapshot" | "governor";

export type GovernanceEventType =
  | "created"
  | "active"
  | "reminder_24h"
  | "succeeded"
  | "defeated"
  | "cancelled"
  | "expired"
  | "executed";

export interface ServiceConfig {
  environment: string;
  snapshotSpace: string;
  snapshotApiUrl: string;
  snapshotWebBaseUrl: string;
  polygonChainId: number;
  governorAddress: Address;
  governorDeploymentBlock: bigint;
  polygonConfirmations: bigint;
  polygonLogChunkSize: bigint;
  polygonHistoryChunksPerRun: number;
  polygonRecentSeedBlocks: bigint;
  polygonBlockTimeSeconds: number;
  tallyProposalBaseUrl: string;
  polygonScanTxBaseUrl: string;
}

export interface ProposalRecord {
  source: GovernanceSource;
  proposalId: string;
  title: string;
  url: string;
  state: string;
  createdAt: number | null;
  startsAt: number | null;
  endsAt: number | null;
  startBlock: number | null;
  endBlock: number | null;
  choices: string[] | null;
  scores: number[] | null;
  metadata: Record<string, string>;
  notificationsEnabled: boolean;
  firstSeenAt: number;
  updatedAt: number;
}

export interface NotificationEvent {
  eventKey: string;
  source: GovernanceSource;
  proposalId: string;
  eventType: GovernanceEventType;
  occurredAt: number;
  messageHtml: string;
}

export interface DeliveryRecord {
  eventKey: string;
  targetChatId: string;
  messageHtml: string;
  attempts: number;
}

export interface SnapshotProposal {
  id: string;
  title: string;
  choices: string[];
  start: number;
  end: number;
  state: "pending" | "active" | "closed";
  created: number;
  scores: number[];
  scoresTotal: number;
}

export interface GovernorLogMetadata {
  transactionHash?: Hex;
}

export interface RunSummary {
  acquired: boolean;
  snapshot: "ok" | "failed" | "skipped";
  governor: "ok" | "failed" | "skipped";
  deliveriesSent: number;
  deliveriesFailed: number;
}
