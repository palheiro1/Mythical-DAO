import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { test, assert, clearStore, beforeEach, newMockEvent } from "matchstick-as/assembly/index";
import { Transfer, Approval, DelegateChanged, DelegateVotesChanged } from "../generated/MANA/MANA";
import { ProposalCreated, VoteCast, ProposalExecuted, ProposalCanceled } from "../generated/Governor/Governor";
import { Proposal } from "../generated/schema";
import { handleTransfer, handleApproval, handleDelegateChanged, handleDelegateVotesChanged } from "../src/mana";
import { handleProposalCreated, handleVoteCast, handleProposalExecuted, handleProposalCanceled } from "../src/governor";
import { GOVERNOR, MANA, ZERO_ADDRESS, proposalKey, eventId } from "../src/common";

const A = Address.fromString("0x0000000000000000000000000000000000000001");
const B = Address.fromString("0x0000000000000000000000000000000000000002");
function param(name: string, value: ethereum.Value): ethereum.EventParam { return new ethereum.EventParam(name, value); }
function uint(value: i32): ethereum.Value { return ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(value)); }
function base(index: i32, address: Address): ethereum.Event {
  let e = newMockEvent(); e.address = address; e.logIndex = BigInt.fromI32(index);
  e.transaction.hash = Bytes.fromHexString("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  e.block.number = BigInt.fromI32(50000000); return e;
}
function transfer(index: i32, from: Address, to: Address, amount: i32): Transfer {
  let e = changetype<Transfer>(base(index, MANA));
  e.parameters = [param("from", ethereum.Value.fromAddress(from)), param("to", ethereum.Value.fromAddress(to)), param("value", uint(amount))]; return e;
}
function created(): ProposalCreated {
  let e = changetype<ProposalCreated>(base(20, GOVERNOR));
  e.parameters = [param("proposalId", uint(42)), param("proposer", ethereum.Value.fromAddress(A)),
    param("targets", ethereum.Value.fromAddressArray([MANA, B])), param("values", ethereum.Value.fromUnsignedBigIntArray([BigInt.zero(), BigInt.fromI32(9)])),
    param("signatures", ethereum.Value.fromStringArray(["", "transfer(address,uint256)"])),
    param("calldatas", ethereum.Value.fromBytesArray([Bytes.fromHexString("0x0000abcd"), Bytes.fromHexString("0x123400")])),
    param("voteStart", uint(50000001)), param("voteEnd", uint(50000099)), param("description", ethereum.Value.fromString("# Exact\nProposal 🇵🇹"))]; return e;
}
function vote(index: i32, support: i32): VoteCast {
  let e = changetype<VoteCast>(base(index, GOVERNOR));
  e.parameters = [param("voter", ethereum.Value.fromAddress(A)), param("proposalId", uint(42)), param("support", uint(support)), param("weight", uint(7)), param("reason", ethereum.Value.fromString("Because"))]; return e;
}
beforeEach(() => { clearStore(); });
test("mint, transfer, full self-transfer, zero transfer and burn conserve balances and holders", () => {
  handleTransfer(transfer(1, ZERO_ADDRESS, A, 100));
  handleTransfer(transfer(2, A, B, 40));
  handleTransfer(transfer(3, A, A, 60));
  handleTransfer(transfer(4, A, B, 0));
  handleTransfer(transfer(5, B, ZERO_ADDRESS, 40));
  assert.fieldEquals("ManaAccount", A.toHexString(), "balance", "60");
  assert.fieldEquals("ManaAccount", B.toHexString(), "balance", "0");
  assert.fieldEquals("PilotStats", "137", "totalSupply", "60");
  assert.fieldEquals("PilotStats", "137", "holders", "1");
  assert.entityCount("EventRecord", 5);
});
test("duplicate event does not double count and log index separates same transaction", () => {
  let e = transfer(1, ZERO_ADDRESS, A, 100); handleTransfer(e); handleTransfer(e);
  handleTransfer(transfer(2, A, B, 30));
  assert.fieldEquals("PilotStats", "137", "totalSupply", "100");
  assert.fieldEquals("PilotStats", "137", "transfers", "2");
  assert.entityCount("EventRecord", 2);
});
test("approval records owner and spender without changing balances", () => {
  let e = changetype<Approval>(base(1, MANA));
  e.parameters = [param("owner", ethereum.Value.fromAddress(A)), param("spender", ethereum.Value.fromAddress(B)), param("value", uint(9))];
  handleApproval(e);
  assert.fieldEquals("EventRecord", eventId(e).toHexString(), "owner", A.toHexString());
  assert.fieldEquals("EventRecord", eventId(e).toHexString(), "spender", B.toHexString());
  assert.entityCount("ManaAccount", 0);
});
test("delegation changes representative and voting power without moving tokens", () => {
  handleTransfer(transfer(1, ZERO_ADDRESS, A, 100));
  let e = changetype<DelegateChanged>(base(2, MANA));
  e.parameters = [param("delegator", ethereum.Value.fromAddress(A)), param("fromDelegate", ethereum.Value.fromAddress(ZERO_ADDRESS)), param("toDelegate", ethereum.Value.fromAddress(B))];
  handleDelegateChanged(e);
  let v = changetype<DelegateVotesChanged>(base(3, MANA));
  v.parameters = [param("delegate", ethereum.Value.fromAddress(B)), param("previousVotes", uint(0)), param("newVotes", uint(100))];
  handleDelegateVotesChanged(v);
  assert.fieldEquals("ManaAccount", A.toHexString(), "balance", "100");
  assert.fieldEquals("ManaAccount", A.toHexString(), "delegate", B.toHexString());
  assert.fieldEquals("ManaAccount", B.toHexString(), "balance", "0");
  assert.fieldEquals("ManaAccount", B.toHexString(), "votingPower", "100");
});
test("proposal preserves exact action bytes, text and all vote buckets", () => {
  let e = created(); handleProposalCreated(e); handleProposalCreated(e);
  let p = Proposal.load(proposalKey(BigInt.fromI32(42)))!;
  assert.stringEquals(p.description, "# Exact\nProposal 🇵🇹");
  assert.bytesEquals(p.calldatas[0], Bytes.fromHexString("0x0000abcd"));
  assert.bytesEquals(p.calldatas[1], Bytes.fromHexString("0x123400"));
  assert.stringEquals(p.signatures[1], "transfer(address,uint256)");
  handleVoteCast(vote(21, 0)); handleVoteCast(vote(22, 1)); handleVoteCast(vote(23, 2)); handleVoteCast(vote(23, 2));
  assert.fieldEquals("Proposal", p.id, "againstVotes", "7");
  assert.fieldEquals("Proposal", p.id, "forVotes", "7");
  assert.fieldEquals("Proposal", p.id, "abstainVotes", "7");
  assert.fieldEquals("PilotStats", "137", "votes", "3");
  assert.fieldEquals("PilotStats", "137", "proposals", "1");
});
test("execution and cancellation are retained as separate events", () => {
  handleProposalCreated(created());
  let e = changetype<ProposalExecuted>(base(24, GOVERNOR)); e.parameters = [param("proposalId", uint(42))]; handleProposalExecuted(e);
  assert.fieldEquals("Proposal", proposalKey(BigInt.fromI32(42)), "executed", "true");
  clearStore(); handleProposalCreated(created());
  let c = changetype<ProposalCanceled>(base(25, GOVERNOR)); c.parameters = [param("proposalId", uint(42))]; handleProposalCanceled(c);
  assert.fieldEquals("Proposal", proposalKey(BigInt.fromI32(42)), "canceled", "true");
  assert.fieldEquals("Proposal", proposalKey(BigInt.fromI32(42)), "executed", "false");
});
test("missing mint history fails rather than fabricating a negative balance", () => { handleTransfer(transfer(1, A, B, 1)); }, true);
test("unknown proposal fails rather than hiding a missing event", () => { handleVoteCast(vote(1, 1)); }, true);
test("unrelated contract events are rejected", () => { let e = transfer(1, ZERO_ADDRESS, A, 1); e.address = B; handleTransfer(e); }, true);
test("invalid support is rejected", () => { handleProposalCreated(created()); handleVoteCast(vote(21, 3)); }, true);
