// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Vm, MockMANA, MockAsset, RejectNative, ReenterNative} from "./Mocks.sol";
import {MythicalGovernorV2} from "../src/MythicalGovernorV2.sol";
import {GovernanceTimelock} from "../src/GovernanceTimelock.sol";
import {MythicalTreasuryVault, IBurnableMANA} from "../src/MythicalTreasuryVault.sol";
import {MythicalCommunityBallots} from "../src/MythicalCommunityBallots.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

contract GovernanceTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockMANA mana;
    MockAsset weth;
    MockAsset usdc;
    GovernanceTimelock timelock;
    MythicalGovernorV2 governor;
    MythicalTreasuryVault vault;
    MythicalCommunityBallots ballots;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA);

    function setUp() public {
        vm.roll(10);
        vm.warp(1000);
        mana = new MockMANA();
        weth = new MockAsset();
        usdc = new MockAsset();
        timelock = new GovernanceTimelock(address(this));
        governor = new MythicalGovernorV2(IVotes(address(mana)), timelock);
        vault = new MythicalTreasuryVault(IBurnableMANA(address(mana)), weth, usdc, address(timelock));
        ballots = new MythicalCommunityBallots(IVotes(address(mana)), address(timelock));
        timelock.initializeGovernor(address(governor));
        mana.mint(alice, 600 ether);
        mana.mint(bob, 300 ether);
        mana.mint(carol, 100 ether);
        vm.prank(alice);
        mana.delegate(alice);
        vm.prank(bob);
        mana.delegate(bob);
        vm.prank(carol);
        mana.delegate(carol);
        weth.mint(address(vault), 100 ether);
        usdc.mint(address(vault), 1000e6);
        vm.deal(address(vault), 100 ether);
        vm.roll(11);
    }

    function _approve(address who, uint256 amount) internal {
        vm.prank(who);
        mana.approve(address(vault), amount);
    }

    function _redeem(address who, uint256 amount) internal returns (uint256[3] memory) {
        _approve(who, amount);
        vm.prank(who);
        return vault.redeem(amount, payable(who), [uint256(0), 0, 0], block.timestamp);
    }

    function _actions(uint256 amount)
        internal
        view
        returns (address[] memory t, uint256[] memory v, bytes[] memory d)
    {
        t = new address[](1);
        v = new uint256[](1);
        d = new bytes[](1);
        t[0] = address(vault);
        d[0] = abi.encodeCall(vault.payNative, (payable(carol), amount));
    }

    function _propose(uint256 amount) internal returns (uint256 id) {
        (address[] memory t, uint256[] memory v, bytes[] memory d) = _actions(amount);
        vm.prank(alice);
        id = governor.propose(t, v, d, "Fund the community");
    }

    function _pass(uint256 id) internal {
        vm.roll(governor.proposalSnapshot(id) + 1);
        vm.prank(alice);
        governor.castVote(id, 1);
        vm.prank(bob);
        governor.castVote(id, 0);
        vm.roll(governor.proposalDeadline(id) + 1);
        require(uint8(governor.state(id)) == 4, "exact 2/3 must pass");
    }

    function _queue(uint256 amount) internal {
        (address[] memory t, uint256[] memory v, bytes[] memory d) = _actions(amount);
        vm.prank(carol);
        governor.queue(t, v, d, keccak256("Fund the community"));
    }

    function _execute(uint256 amount) internal {
        (address[] memory t, uint256[] memory v, bytes[] memory d) = _actions(amount);
        vm.prank(carol);
        governor.execute(t, v, d, keccak256("Fund the community"));
    }

    function _ballot() internal returns (uint256 id) {
        string[] memory options = new string[](2);
        options[0] = "Forest";
        options[1] = "Ocean";
        vm.prank(alice);
        id = ballots.createBallot("Next collection", options);
    }

    function testFullLifecycleWithExitDuringTimelock() public {
        uint256 id = _propose(20 ether);
        _pass(id);
        _queue(20 ether);
        _redeem(bob, 300 ether);
        vm.expectRevert();
        _execute(20 ether);
        vm.warp(block.timestamp + 72 hours);
        _execute(20 ether);
        require(carol.balance == 20 ether && address(vault).balance == 50 ether);
        require(uint8(governor.state(id)) == 7);
        vm.expectRevert();
        _execute(20 ether);
    }

    function testExitCanMakeApprovedPaymentFailAtomically() public {
        uint256 id = _propose(90 ether);
        _pass(id);
        _queue(90 ether);
        _redeem(bob, 300 ether);
        vm.warp(block.timestamp + 72 hours);
        vm.expectRevert();
        _execute(90 ether);
        require(carol.balance == 0 && address(vault).balance == 70 ether);
        require(uint8(governor.state(id)) == 5);
    }

    function testNoAdminSpendOrRoleGrant() public {
        vm.expectRevert();
        vault.payNative(payable(alice), 1);
        bytes32 role = timelock.PROPOSER_ROLE();
        vm.expectRevert();
        timelock.grantRole(role, alice);
        require(!timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(this)));
    }

    function testTimelockFloorAndReplacement() public {
        vm.prank(address(timelock));
        vm.expectRevert(GovernanceTimelock.DelayBelowFloor.selector);
        timelock.updateDelay(72 hours - 1);
        vm.prank(address(timelock));
        timelock.updateDelay(72 hours);
        vm.expectRevert(MythicalGovernorV2.ImmutableTimelock.selector);
        governor.updateTimelock(timelock);
        vm.expectRevert();
        timelock.schedule(address(vault), 0, "", bytes32(0), bytes32(0), 72 hours);
    }

    function testGovernanceCannotIntroduceAnOperationalSpendingKey() public {
        bytes32 role = timelock.PROPOSER_ROLE();
        vm.prank(address(timelock));
        vm.expectRevert();
        timelock.grantRole(role, alice);
        role = timelock.DEFAULT_ADMIN_ROLE();
        vm.prank(address(timelock));
        vm.expectRevert();
        timelock.grantRole(role, alice);
        vm.expectRevert();
        timelock.initializeGovernor(address(governor));
    }

    function testBelowThresholdAndExactThreshold() public {
        (address[] memory t, uint256[] memory v, bytes[] memory d) = _actions(1);
        vm.prank(carol);
        vm.expectRevert();
        governor.propose(t, v, d, "below");
        mana.mint(carol, 150 ether - 1);
        vm.roll(block.number + 1);
        vm.prank(carol);
        vm.expectRevert();
        governor.propose(t, v, d, "one wei below");
        mana.mint(carol, 1);
        vm.roll(block.number + 1);
        vm.prank(carol);
        governor.propose(t, v, d, "exact");
    }

    function testTimingDuplicateAndSnapshotAfterBurn() public {
        uint256 id = _propose(1);
        uint256 snapshot = governor.proposalSnapshot(id);
        vm.roll(snapshot);
        vm.prank(alice);
        vm.expectRevert();
        governor.castVote(id, 1);
        vm.roll(snapshot + 1);
        vm.prank(alice);
        governor.castVote(id, 1);
        _redeem(alice, 100 ether);
        vm.prank(alice);
        vm.expectRevert();
        governor.castVote(id, 0);
        (, uint256 weight,) = governor.proposalVotes(id);
        require(weight == 600 ether);
        require(mana.getVotes(alice) == 500 ether && mana.getPastVotes(alice, snapshot) == 600 ether);
        vm.roll(governor.proposalDeadline(id));
        vm.prank(bob);
        governor.castVote(id, 0);
        vm.roll(block.number + 1);
        vm.prank(carol);
        vm.expectRevert();
        governor.castVote(id, 2);
    }

    function testLessThanTwoThirdsFails() public {
        uint256 id = _propose(1);
        vm.roll(governor.proposalSnapshot(id) + 1);
        vm.prank(alice);
        governor.castVote(id, 1);
        vm.prank(bob);
        governor.castVote(id, 0);
        vm.prank(carol);
        governor.castVote(id, 0);
        vm.roll(governor.proposalDeadline(id) + 1);
        require(uint8(governor.state(id)) == 3);
    }

    function testAbstentionOnlyCannotPass() public {
        uint256 id = _propose(1);
        vm.roll(governor.proposalSnapshot(id) + 1);
        vm.prank(alice);
        governor.castVote(id, 2);
        vm.roll(governor.proposalDeadline(id) + 1);
        require(uint8(governor.state(id)) == 3);
    }

    function testQuorumExactAndDelegationAfterSnapshot() public {
        uint256 id = _propose(1);
        uint256 snapshot = governor.proposalSnapshot(id);
        vm.roll(snapshot + 1);
        vm.prank(alice);
        mana.delegate(carol);
        vm.prank(carol);
        governor.castVote(id, 1);
        (, uint256 weight,) = governor.proposalVotes(id);
        require(weight == 100 ether);
        vm.roll(governor.proposalDeadline(id) + 1);
        require(uint8(governor.state(id)) == 4);
    }

    function testPartialTotalAndSuccessiveRedeems() public {
        uint256[3] memory paid = _redeem(alice, 100 ether);
        require(paid[0] == 10 ether && paid[2] == 100e6);
        require(mana.allowance(alice, address(vault)) == 0);
        _redeem(alice, 500 ether);
        _redeem(bob, 300 ether);
        _redeem(carol, 100 ether);
        require(mana.totalSupply() == 0 && address(vault).balance == 0 && weth.balanceOf(address(vault)) == 0);
        vm.expectRevert();
        vault.previewRedeem(1);
    }

    function testTreasuryMANAIsIncludedInSupply() public {
        vm.prank(alice);
        mana.transfer(address(vault), 100 ether);
        uint256[3] memory p = vault.previewRedeem(100 ether);
        require(p[0] == 10 ether);
    }

    function testAllowanceBalanceSlippageAndDeadline() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.redeem(1, payable(alice), [uint256(0), 0, 0], block.timestamp);
        _approve(alice, 1000 ether);
        vm.prank(alice);
        vm.expectRevert();
        vault.redeem(700 ether, payable(alice), [uint256(0), 0, 0], block.timestamp);
        vm.prank(alice);
        vm.expectRevert();
        vault.redeem(100 ether, payable(alice), [uint256(11 ether), 0, 0], block.timestamp);
        vm.prank(alice);
        vm.expectRevert(MythicalTreasuryVault.Expired.selector);
        vault.redeem(1, payable(alice), [uint256(0), 0, 0], block.timestamp - 1);
        require(mana.totalSupply() == 1000 ether);
    }

    function testEmptyAndDustRejectBeforeBurn() public {
        vm.deal(address(vault), 0);
        vm.prank(address(vault));
        weth.transfer(alice, 100 ether);
        vm.prank(address(vault));
        usdc.transfer(alice, 1000e6);
        _approve(alice, 1);
        vm.prank(alice);
        vm.expectRevert(MythicalTreasuryVault.NoPayout.selector);
        vault.redeem(1, payable(alice), [uint256(0), 0, 0], block.timestamp);
        vm.deal(address(vault), 1);
        vm.prank(alice);
        vm.expectRevert(MythicalTreasuryVault.NoPayout.selector);
        vault.redeem(1, payable(alice), [uint256(0), 0, 0], block.timestamp);
        require(mana.balanceOf(alice) == 600 ether);
    }

    function testRejectNativeRollsBackBurn() public {
        RejectNative target = new RejectNative();
        _approve(alice, 100 ether);
        vm.prank(alice);
        vm.expectRevert(MythicalTreasuryVault.NativeTransferFailed.selector);
        vault.redeem(100 ether, payable(address(target)), [uint256(0), 0, 0], block.timestamp);
        require(mana.balanceOf(alice) == 600 ether && mana.allowance(alice, address(vault)) == 100 ether);
    }

    function testPausedTokenAndFeeRollbackAllAssets() public {
        _approve(alice, 100 ether);
        usdc.setFails(true);
        vm.prank(alice);
        vm.expectRevert();
        vault.redeem(100 ether, payable(alice), [uint256(0), 0, 0], block.timestamp);
        require(alice.balance == 0 && mana.totalSupply() == 1000 ether && weth.balanceOf(alice) == 0);
        usdc.setFails(false);
        usdc.setFee(true);
        vm.prank(alice);
        vm.expectRevert(MythicalTreasuryVault.IncompatibleToken.selector);
        vault.redeem(100 ether, payable(alice), [uint256(0), 0, 0], block.timestamp);
        require(alice.balance == 0 && mana.totalSupply() == 1000 ether);
    }

    function testReentrancyAndRecipient() public {
        ReenterNative target = new ReenterNative(vault);
        _approve(alice, 100 ether);
        vm.prank(alice);
        vault.redeem(100 ether, payable(address(target)), [uint256(0), 0, 0], block.timestamp);
        require(target.blocked() && address(target).balance == 10 ether && mana.balanceOf(alice) == 500 ether);
    }

    function testFuzzConservation(uint96 rawA, uint96 rawB) public {
        uint256 a = uint256(rawA) % (600 ether) + 1;
        uint256 b = uint256(rawB) % (300 ether) + 1;
        if (a < 10) a = 10;
        if (b < 10) b = 10;
        uint256[3] memory pa = _redeem(alice, a);
        uint256[3] memory pb = _redeem(bob, b);
        require(pa[0] + pb[0] + address(vault).balance == 100 ether);
        require(pa[1] + pb[1] + weth.balanceOf(address(vault)) == 100 ether);
        require(pa[2] + pb[2] + usdc.balanceOf(address(vault)) == 1000e6);
        require(mana.totalSupply() == 1000 ether - a - b);
    }

    function testBallotWinnerAndDuplicate() public {
        uint256 id = _ballot();
        vm.roll(block.number + 41_144);
        vm.prank(alice);
        ballots.castVote(id, 1);
        vm.prank(bob);
        ballots.castVote(id, 2);
        vm.prank(carol);
        ballots.castVote(id, 0);
        vm.prank(alice);
        vm.expectRevert(MythicalCommunityBallots.AlreadyVoted.selector);
        ballots.castVote(id, 2);
        vm.roll(block.number + 288_000);
        (uint8 winner, bool quorum, bool tie) = ballots.result(id);
        require(winner == 1 && quorum && !tie);
    }

    function testBallotTieNoQuorumAndAbstain() public {
        vm.prank(alice);
        mana.transfer(carol, 300 ether);
        vm.roll(block.number + 1);
        uint256 id = _ballot();
        vm.roll(block.number + 41_144);
        vm.prank(alice);
        ballots.castVote(id, 1);
        vm.prank(bob);
        ballots.castVote(id, 2);
        vm.roll(block.number + 288_000);
        (uint8 winner, bool quorum, bool tie) = ballots.result(id);
        require(winner == 0 && quorum && tie);
        uint256 empty = _ballot();
        vm.roll(block.number + 329_144);
        (winner, quorum,) = ballots.result(empty);
        require(winner == 0 && !quorum);
        uint256 abstain = _ballot();
        vm.roll(block.number + 41_144);
        vm.prank(alice);
        ballots.castVote(abstain, 0);
        vm.roll(block.number + 288_000);
        (winner, quorum,) = ballots.result(abstain);
        require(winner == 0 && quorum);
    }

    function testBallotFrozenRulesAndCancelBoundary() public {
        uint256 id = _ballot();
        vm.prank(address(timelock));
        ballots.setRules(1, 10, 0, 50);
        (, uint48 snap, uint48 end,, uint8 q,,) = ballots.ballots(id);
        require(snap == 41154 && end == 329154 && q == 10);
        vm.prank(bob);
        vm.expectRevert();
        ballots.cancel(id);
        vm.roll(snap);
        vm.prank(alice);
        ballots.cancel(id);
        require(ballots.state(id) == 2);
        uint256 next = _ballot();
        vm.roll(block.number + 2);
        vm.prank(alice);
        vm.expectRevert();
        ballots.cancel(next);
        vm.prank(alice);
        vm.expectRevert();
        ballots.castVote(next, 3);
    }

    function testBallotValidationAndUnauthorizedRules() public {
        string[] memory options = new string[](1);
        options[0] = "one";
        vm.prank(alice);
        vm.expectRevert();
        ballots.createBallot("bad", options);
        options = new string[](21);
        vm.prank(alice);
        vm.expectRevert();
        ballots.createBallot("bad", options);
        options = new string[](2);
        options[0] = "same";
        options[1] = "same";
        vm.prank(alice);
        vm.expectRevert();
        ballots.createBallot("bad", options);
        vm.expectRevert();
        ballots.setRules(1, 1, 0, 10);
        vm.expectRevert();
        ballots.state(999);
    }
}
