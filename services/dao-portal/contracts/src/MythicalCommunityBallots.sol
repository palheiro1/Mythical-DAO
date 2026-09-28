// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Advisory, immutable multi-option ballots. This contract has no treasury authority.
contract MythicalCommunityBallots {
    IVotes public immutable token;
    address public immutable timelock;
    uint48 public votingDelay = 41_143;
    uint32 public votingPeriod = 288_000;
    uint256 public proposalThreshold = 250 ether;
    uint8 public quorumPercent = 10;
    uint256 public ballotCount;

    struct Ballot {
        address author;
        uint48 snapshot;
        uint48 deadline;
        uint8 optionCount;
        uint8 quorumPercent;
        bool canceled;
        uint256 totalVotes;
    }

    mapping(uint256 => Ballot) public ballots;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    // Option 0 is abstention, options 1..20 correspond to the published strings.
    mapping(uint256 => mapping(uint8 => uint256)) public optionVotes;

    error Unauthorized();
    error InvalidRules();
    error InvalidContent();
    error InvalidBallot();
    error BelowThreshold();
    error NotPending();
    error NotActive();
    error AlreadyVoted();
    error InvalidOption();

    event BallotCreated(
        uint256 indexed ballotId,
        address indexed author,
        string description,
        string[] options,
        uint48 snapshot,
        uint48 deadline,
        uint256 threshold,
        uint8 quorumPercent
    );
    event BallotVoteCast(uint256 indexed ballotId, address indexed voter, uint8 option, uint256 weight);
    event BallotCanceled(uint256 indexed ballotId);
    event RulesUpdated(uint48 delay, uint32 period, uint256 threshold, uint8 quorumPercent);

    constructor(IVotes token_, address timelock_) {
        if (address(token_) == address(0) || timelock_ == address(0)) revert InvalidRules();
        token = token_;
        timelock = timelock_;
    }

    function setRules(uint48 delay_, uint32 period_, uint256 threshold_, uint8 quorum_) external {
        if (msg.sender != timelock) revert Unauthorized();
        if (delay_ == 0 || period_ == 0 || quorum_ == 0 || quorum_ > 100) revert InvalidRules();
        votingDelay = delay_;
        votingPeriod = period_;
        proposalThreshold = threshold_;
        quorumPercent = quorum_;
        emit RulesUpdated(delay_, period_, threshold_, quorum_);
    }

    function createBallot(string calldata description, string[] calldata options) external returns (uint256 id) {
        if (
            bytes(description).length == 0 || bytes(description).length > 32_768 || options.length < 2
                || options.length > 20
        ) {
            revert InvalidContent();
        }
        for (uint256 i; i < options.length; ++i) {
            if (bytes(options[i]).length == 0 || bytes(options[i]).length > 160) revert InvalidContent();
            for (uint256 j; j < i; ++j) {
                if (keccak256(bytes(options[i])) == keccak256(bytes(options[j]))) revert InvalidContent();
            }
        }
        if (token.getPastVotes(msg.sender, block.number - 1) < proposalThreshold) revert BelowThreshold();
        id = ++ballotCount;
        uint48 snapshot = uint48(block.number) + votingDelay;
        uint48 deadline = snapshot + votingPeriod;
        ballots[id] = Ballot(msg.sender, snapshot, deadline, uint8(options.length), quorumPercent, false, 0);
        emit BallotCreated(id, msg.sender, description, options, snapshot, deadline, proposalThreshold, quorumPercent);
    }

    // 0 Pending, 1 Active, 2 Canceled, 3 Ended. Snapshot block itself is still Pending, like Governor.
    function state(uint256 id) public view returns (uint8) {
        Ballot storage b = _ballot(id);
        if (b.canceled) return 2;
        if (block.number <= b.snapshot) return 0;
        if (block.number <= b.deadline) return 1;
        return 3;
    }

    function cancel(uint256 id) external {
        Ballot storage b = _ballot(id);
        if (msg.sender != b.author) revert Unauthorized();
        if (state(id) != 0) revert NotPending();
        b.canceled = true;
        emit BallotCanceled(id);
    }

    function castVote(uint256 id, uint8 option) external returns (uint256 weight) {
        if (state(id) != 1) revert NotActive();
        Ballot storage b = ballots[id];
        if (option > b.optionCount) revert InvalidOption();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();
        weight = token.getPastVotes(msg.sender, b.snapshot);
        hasVoted[id][msg.sender] = true;
        optionVotes[id][option] += weight;
        b.totalVotes += weight;
        emit BallotVoteCast(id, msg.sender, option, weight);
    }

    /// @return winner Zero means no winner (including tie, quorum failure, pending, active or canceled).
    function result(uint256 id) external view returns (uint8 winner, bool quorumReached, bool tied) {
        Ballot storage b = _ballot(id);
        if (state(id) != 3) return (0, false, false);
        uint256 required = Math.mulDiv(token.getPastTotalSupply(b.snapshot), b.quorumPercent, 100, Math.Rounding.Ceil);
        quorumReached = b.totalVotes >= required;
        uint256 highest;
        for (uint8 i = 1; i <= b.optionCount; ++i) {
            uint256 weight = optionVotes[id][i];
            if (weight > highest) {
                highest = weight;
                winner = i;
                tied = false;
            } else if (weight == highest && highest > 0) {
                tied = true;
            }
        }
        if (!quorumReached || tied || highest == 0) winner = 0;
    }

    function _ballot(uint256 id) private view returns (Ballot storage b) {
        b = ballots[id];
        if (b.author == address(0)) revert InvalidBallot();
    }
}
