import type { Address } from "viem";
import type { Proposal, ChainEvent } from "../shared/domain";
export type ListResponse<T> =
  | {
      unavailable: true;
      items: [];
      asOfBlock?: never;
      nextBefore?: never;
      limitedTo?: never;
    }
  | {
      unavailable?: false;
      items: T[];
      asOfBlock?: string;
      nextBefore?: string | null;
      limitedTo?: number;
    };
export type ProposalList = ListResponse<Proposal>;
export type EventList = ListResponse<ChainEvent>;
export interface TreasuryAccount {
  role: string;
  address: Address;
  assets: {
    symbol: string;
    address?: Address | null;
    balance: string;
    decimals: number;
  }[];
}
export type TreasuryResponse =
  | { unavailable: true; accounts: []; asOfBlock?: never }
  | { unavailable?: false; accounts: TreasuryAccount[]; asOfBlock: string };
export interface Member {
  balance: string;
  votes: string;
  delegate: Address;
  supply: string;
  allowance: string;
}
export interface SnapshotRecord {
  id: string;
  source_url: string;
  verification: string;
  created_at: number;
  imported_at: string;
  payload: {
    title?: string;
    body?: string;
    choices?: string[];
    created?: number;
    type?: string;
  };
}
