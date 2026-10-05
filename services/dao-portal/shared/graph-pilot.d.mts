import type { Address, Hex } from "viem";
export const GOVERNOR: Address;
export const MANA: Address;
export const SUBGRAPH_ID: string;
export const GATEWAY_URL: string;
export const PILOT_DEPLOYMENT: string;
export const PILOT_LIMITS: { accounts: number; proposals: number; lag: number };
export const pilotMetaQuery: string;
export const pilotSnapshotQuery: string;
export type PilotMeta = {
  deployment: string;
  hasIndexingErrors: boolean;
  block: { number: number; hash: Hex };
};
export type PilotAccount = {
  id: Address;
  balance: string;
  votingPower: string;
  delegate: Address;
};
export type PilotProposal = {
  id: string;
  proposalId: string;
  governor: Address;
  proposer: Address;
  description: string;
  targets: Address[];
  values: string[];
  signatures: string[];
  calldatas: Hex[];
  voteStart: string;
  voteEnd: string;
  againstVotes: string;
  forVotes: string;
  abstainVotes: string;
  executed: boolean;
  canceled: boolean;
};
export type PilotSnapshot = {
  _meta: PilotMeta;
  pilotStats: {
    chainId: number;
    governor: Address;
    mana: Address;
    governorStartBlock: string;
    manaStartBlock: string;
    totalSupply: string;
    holders: string;
    proposals: string;
    votes: string;
    transfers: string;
    delegationChanges: string;
  };
  manaAccounts: PilotAccount[];
  proposals: PilotProposal[];
};
export type ProposalObservation = {
  proposalId: string;
  voteStart: string;
  voteEnd: string;
  votes: string[];
  executed: boolean;
  canceled: boolean;
};
export function requireValue(
  condition: unknown,
  reason: string,
): asserts condition;
export function graphQuery<T = unknown>(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
  fetcher?: typeof fetch,
  options?: { apiKey?: string },
): Promise<T>;
export function validateMeta(
  meta: unknown,
  deployment: string,
  anchor?: number,
  hash?: string,
): void;
export function pilotAnchor(latest: unknown, confirmed: number): number;
export function validatePilotSnapshot(
  data: unknown,
  anchor: number,
  hash: string,
): PilotSnapshot;
export function verifyPilotEntities(
  snapshot: PilotSnapshot,
  readAccount: (id: Address) => Promise<Omit<PilotAccount, "id">>,
  readProposal: (proposal: PilotProposal) => Promise<ProposalObservation>,
): Promise<{ accounts: number; proposals: number; fullHistoryVerified: false }>;
