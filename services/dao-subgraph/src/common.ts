import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { EventRecord, ManaAccount, PilotStats } from "../generated/schema";

export const GOVERNOR = Address.fromString("0x7b9e327748462f1038c9d081c98d189b22c60a27");
export const MANA = Address.fromString("0x2cacca1266653bb090d3fb511456ebca33150562");
export const ZERO_ADDRESS = Address.zero();
export const ZERO = BigInt.zero();
export const ONE = BigInt.fromI32(1);

export function eventId(event: ethereum.Event): Bytes {
  assert(event.logIndex.ge(ZERO) && event.logIndex.le(BigInt.fromI32(2147483647)), "Invalid log index");
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

export function alreadyIndexed(event: ethereum.Event): boolean {
  return EventRecord.load(eventId(event)) !== null;
}

export function record(event: ethereum.Event, name: string): EventRecord {
  let row = new EventRecord(eventId(event));
  row.eventKey = "137:" + event.address.toHexString() + ":" + event.transaction.hash.toHexString() + ":" + event.logIndex.toString();
  row.contract = event.address;
  row.name = name;
  row.blockNumber = event.block.number;
  row.blockHash = event.block.hash;
  row.transactionHash = event.transaction.hash;
  row.transactionIndex = event.transaction.index;
  row.logIndex = event.logIndex;
  row.timestamp = event.block.timestamp;
  return row;
}

export function stats(block: BigInt): PilotStats {
  let row = PilotStats.load("137");
  if (row === null) {
    row = new PilotStats("137");
    row.chainId = 137;
    row.governor = GOVERNOR;
    row.mana = MANA;
    row.governorStartBlock = BigInt.fromI32(48674443);
    row.manaStartBlock = BigInt.fromI32(45785116);
    row.totalSupply = ZERO;
    row.holders = ZERO;
    row.proposals = ZERO;
    row.votes = ZERO;
    row.transfers = ZERO;
    row.delegationChanges = ZERO;
    row.lastEventBlock = ZERO;
  }
  if (block.gt(row.lastEventBlock)) row.lastEventBlock = block;
  return row;
}

export function account(address: Address, block: BigInt): ManaAccount {
  let row = ManaAccount.load(address);
  if (row === null) {
    row = new ManaAccount(address);
    row.balance = ZERO;
    row.votingPower = ZERO;
    row.delegate = ZERO_ADDRESS;
  }
  row.updatedBlock = block;
  return row;
}

export function proposalKey(id: BigInt): string {
  return GOVERNOR.toHexString() + ":" + id.toString();
}
