import { Bytes } from "@graphprotocol/graph-ts";
import { ProposalCreated, VoteCast, ProposalExecuted, ProposalCanceled } from "../generated/Governor/Governor";
import { Proposal } from "../generated/schema";
import { GOVERNOR, ZERO, ONE, alreadyIndexed, record, stats, proposalKey } from "./common";

export function handleProposalCreated(event: ProposalCreated): void {
  assert(event.address.equals(GOVERNOR), "Unexpected Governor");
  if (alreadyIndexed(event)) return;
  let key = proposalKey(event.params.proposalId);
  assert(Proposal.load(key) === null, "Duplicate proposal id");
  let proposal = new Proposal(key);
  proposal.proposalId = event.params.proposalId;
  proposal.governor = event.address;
  proposal.proposer = event.params.proposer;
  proposal.description = event.params.description;
  let targets = new Array<Bytes>();
  for (let i = 0; i < event.params.targets.length; i++) targets.push(event.params.targets[i]);
  proposal.targets = targets;
  proposal.values = event.params.values;
  proposal.signatures = event.params.signatures;
  proposal.calldatas = event.params.calldatas;
  proposal.voteStart = event.params.voteStart;
  proposal.voteEnd = event.params.voteEnd;
  proposal.createdBlock = event.block.number;
  proposal.createdBlockHash = event.block.hash;
  proposal.createdTransaction = event.transaction.hash;
  proposal.againstVotes = ZERO;
  proposal.forVotes = ZERO;
  proposal.abstainVotes = ZERO;
  proposal.executed = false;
  proposal.canceled = false;
  proposal.save();
  let row = record(event, "ProposalCreated");
  row.proposal = key;
  row.save();
  let totals = stats(event.block.number);
  totals.proposals = totals.proposals.plus(ONE);
  totals.save();
}

export function handleVoteCast(event: VoteCast): void {
  assert(event.address.equals(GOVERNOR), "Unexpected Governor");
  if (alreadyIndexed(event)) return;
  let key = proposalKey(event.params.proposalId);
  let loaded = Proposal.load(key);
  assert(loaded !== null, "Vote without indexed proposal");
  let proposal = loaded as Proposal;
  let support = event.params.support;
  assert(support >= 0 && support <= 2, "Unexpected support value");
  if (support == 0) proposal.againstVotes = proposal.againstVotes.plus(event.params.weight);
  if (support == 1) proposal.forVotes = proposal.forVotes.plus(event.params.weight);
  if (support == 2) proposal.abstainVotes = proposal.abstainVotes.plus(event.params.weight);
  proposal.save();
  let row = record(event, "VoteCast");
  row.proposal = key;
  row.voter = event.params.voter;
  row.support = support;
  row.weight = event.params.weight;
  row.reason = event.params.reason;
  row.save();
  let totals = stats(event.block.number);
  totals.votes = totals.votes.plus(ONE);
  totals.save();
}

export function handleProposalExecuted(event: ProposalExecuted): void {
  assert(event.address.equals(GOVERNOR), "Unexpected Governor");
  if (alreadyIndexed(event)) return;
  let key = proposalKey(event.params.proposalId);
  let loaded = Proposal.load(key);
  assert(loaded !== null, "Execution without indexed proposal");
  let proposal = loaded as Proposal;
  proposal.executed = true;
  proposal.save();
  let row = record(event, "ProposalExecuted");
  row.proposal = key;
  row.save();
  stats(event.block.number).save();
}

export function handleProposalCanceled(event: ProposalCanceled): void {
  assert(event.address.equals(GOVERNOR), "Unexpected Governor");
  if (alreadyIndexed(event)) return;
  let key = proposalKey(event.params.proposalId);
  let loaded = Proposal.load(key);
  assert(loaded !== null, "Cancellation without indexed proposal");
  let proposal = loaded as Proposal;
  proposal.canceled = true;
  proposal.save();
  let row = record(event, "ProposalCanceled");
  row.proposal = key;
  row.save();
  stats(event.block.number).save();
}
