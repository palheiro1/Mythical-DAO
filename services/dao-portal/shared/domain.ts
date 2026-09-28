import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
export const CONFIRMATIONS = 64;
export const MAX_INDEX_AGE_MS = 180_000;
export const stringify = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
export type Role =
  | "mana"
  | "legacyGovernor"
  | "governor"
  | "timelock"
  | "vault"
  | "ballots"
  | "weth"
  | "usdc";
export interface ContractConfig {
  address: Address;
  startBlock: string;
}
export interface PortalConfig {
  chainId: number;
  environment: string;
  contracts: Partial<Record<Role, ContractConfig>>;
  confirmations: number;
  enabled: boolean;
  portalUrl: string;
}
export interface Health {
  status: "ok" | "setup" | "syncing" | "degraded";
  signingAllowed: boolean;
  checkedAt: string;
  head: string | null;
  confirmedHead: string | null;
  sources: { contract: string; block: string; updatedAt: number }[];
  reason?: string;
}
export interface ChainEvent {
  chain_id: number;
  contract: Address;
  block_number: number;
  block_hash: Hex;
  tx_hash: Hex;
  log_index: number;
  event_name: string;
  args: Record<string, unknown>;
}
export interface Proposal {
  chainId: number;
  contract: Address;
  id: string;
  kind: "executable" | "community" | "legacy";
  description: string;
  proposer: Address;
  targets: Address[];
  values: string[];
  calldatas: Hex[];
  signatures: string[];
  options: string[];
  snapshot: string;
  deadline: string;
  blockNumber: string;
  transactionHash: Hex;
  state: string;
  votes?: string[];
  quorum?: string;
  eta?: string;
  winner?: number;
  tied?: boolean;
  quorumReached?: boolean;
}
export interface Action {
  target: Address;
  value: string;
  data: Hex;
}
export function validateActions(value: unknown): Action[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20)
    throw new Error("Use between 1 and 20 actions.");
  return value.map((a: unknown) => {
    if (!a || typeof a !== "object") throw new Error("Invalid action.");
    const v = a as Record<string, unknown>;
    if (
      typeof v.target !== "string" ||
      !isAddress(v.target) ||
      !/^\d+$/.test(String(v.value)) ||
      typeof v.data !== "string" ||
      !/^0x([0-9a-fA-F]{2})*$/.test(v.data)
    )
      throw new Error(
        "Each action needs a valid target, integer value and hex calldata.",
      );
    if (BigInt(String(v.value)) >= 2n ** 256n)
      throw new Error("Action value exceeds uint256.");
    return {
      target: v.target as Address,
      value: String(v.value),
      data: v.data as Hex,
    };
  });
}
export function proposalHash(actions: Action[], description: string): string {
  return BigInt(
    keccak256(
      encodeAbiParameters(
        [
          { type: "address[]" },
          { type: "uint256[]" },
          { type: "bytes[]" },
          { type: "bytes32" },
        ],
        [
          actions.map((a) => a.target),
          actions.map((a) => BigInt(a.value)),
          actions.map((a) => a.data),
          keccak256(stringToHex(description)),
        ],
      ),
    ),
  ).toString();
}
export function verifyProposal(p: Proposal) {
  if (p.kind === "community") return;
  const actions = validateActions(
    p.targets.map((target, i) => ({
      target,
      value: p.values[i],
      data: p.calldatas[i],
    })),
  );
  if (
    actions.length !== p.values.length ||
    actions.length !== p.calldatas.length ||
    proposalHash(actions, p.description) !== p.id
  )
    throw new Error("Proposal content does not match its on-chain identifier.");
}
export function redeemAmounts(
  balances: readonly bigint[],
  burn: bigint,
  supply: bigint,
): bigint[] {
  if (burn <= 0n || supply <= 0n || burn > supply)
    throw new Error("Invalid redemption amount.");
  return balances.map((balance) => (balance * burn) / supply);
}
export function safeExternalUrl(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
export const governorStates = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];
export const ballotStates = ["Pending", "Active", "Canceled", "Ended"];
