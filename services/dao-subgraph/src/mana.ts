import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Transfer, Approval, DelegateChanged, DelegateVotesChanged } from "../generated/MANA/MANA";
import { PilotStats } from "../generated/schema";
import { MANA, ZERO_ADDRESS, ZERO, ONE, alreadyIndexed, record, stats, account } from "./common";

function changeBalance(address: Address, delta: BigInt, block: BigInt, totals: PilotStats): void {
  if (address.equals(ZERO_ADDRESS)) return;
  let row = account(address, block);
  let before = row.balance;
  row.balance = before.plus(delta);
  assert(row.balance.ge(ZERO), "Negative balance: incomplete MANA history");
  if (before.equals(ZERO) && row.balance.gt(ZERO)) totals.holders = totals.holders.plus(ONE);
  if (before.gt(ZERO) && row.balance.equals(ZERO)) totals.holders = totals.holders.minus(ONE);
  row.save();
}

export function handleTransfer(event: Transfer): void {
  assert(event.address.equals(MANA), "Unexpected MANA");
  if (alreadyIndexed(event)) return;
  let totals = stats(event.block.number);
  // Store between updates so a self-transfer preserves its balance and holder count.
  changeBalance(event.params.from, ZERO.minus(event.params.value), event.block.number, totals);
  changeBalance(event.params.to, event.params.value, event.block.number, totals);
  if (event.params.from.equals(ZERO_ADDRESS)) totals.totalSupply = totals.totalSupply.plus(event.params.value);
  if (event.params.to.equals(ZERO_ADDRESS)) totals.totalSupply = totals.totalSupply.minus(event.params.value);
  assert(totals.totalSupply.ge(ZERO) && totals.holders.ge(ZERO), "Invalid MANA totals");
  totals.transfers = totals.transfers.plus(ONE);
  totals.save();
  let row = record(event, "Transfer");
  row.from = event.params.from;
  row.to = event.params.to;
  row.value = event.params.value;
  row.save();
}

export function handleApproval(event: Approval): void {
  assert(event.address.equals(MANA), "Unexpected MANA");
  if (alreadyIndexed(event)) return;
  let row = record(event, "Approval");
  row.owner = event.params.owner;
  row.spender = event.params.spender;
  row.value = event.params.value;
  row.save();
  stats(event.block.number).save();
}

export function handleDelegateChanged(event: DelegateChanged): void {
  assert(event.address.equals(MANA), "Unexpected MANA");
  if (alreadyIndexed(event)) return;
  let member = account(event.params.delegator, event.block.number);
  member.delegate = event.params.toDelegate;
  member.save();
  let row = record(event, "DelegateChanged");
  row.account = event.params.delegator;
  row.fromDelegate = event.params.fromDelegate;
  row.toDelegate = event.params.toDelegate;
  row.save();
  let totals = stats(event.block.number);
  totals.delegationChanges = totals.delegationChanges.plus(ONE);
  totals.save();
}

export function handleDelegateVotesChanged(event: DelegateVotesChanged): void {
  assert(event.address.equals(MANA), "Unexpected MANA");
  if (alreadyIndexed(event)) return;
  let representative = account(event.params.delegate, event.block.number);
  representative.votingPower = event.params.newVotes;
  representative.save();
  let row = record(event, "DelegateVotesChanged");
  row.account = event.params.delegate;
  row.previousVotes = event.params.previousVotes;
  row.newVotes = event.params.newVotes;
  row.save();
  stats(event.block.number).save();
}
