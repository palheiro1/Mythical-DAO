// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MythicalRagequitModule} from "../src/MythicalRagequitModule.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

interface ForkVm {
    function envOr(string calldata, string calldata) external returns (string memory);
    function createSelectFork(string calldata) external returns (uint256);
    function skip(bool) external;
    function envOr(string calldata, uint256) external returns (uint256);
    function createSelectFork(string calldata, uint256) external returns (uint256);
    function prank(address) external;
    function roll(uint256) external;
    function warp(uint256) external;
    function expectRevert() external;
}

interface ExistingGovernor {
    function propose(address[] memory, uint256[] memory, bytes[] memory, string memory) external returns (uint256);
    function castVote(uint256, uint8) external returns (uint256);
    function execute(address[] memory, uint256[] memory, bytes[] memory, bytes32) external payable returns (uint256);
    function proposalSnapshot(uint256) external view returns (uint256);
    function proposalDeadline(uint256) external view returns (uint256);
    function state(uint256) external view returns (uint8);
    function cancel(address[] memory, uint256[] memory, bytes[] memory, bytes32) external returns (uint256);
}

interface FiatToken is IERC20 {
    function pauser() external view returns (address);
    function pause() external;
    function unpause() external;
}

interface PoolFactory {
    function getPool(address, address, uint24) external view returns (address);
}

contract ExistingGovernorForkTest {
    ForkVm constant vm = ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant TREASURY = 0x7B9e327748462F1038c9D081c98d189b22C60A27;
    address constant MANA = 0x2caCCa1266653bB090D3Fb511456EBCA33150562;
    address constant GEM = 0x5F790ffA0695967A2d711872EcB4c7553e24794D;
    address constant WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
    address constant USDC = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359;
    address constant BRIDGED = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    address member = address(0xA11CE);

    event log_named_uint(string key, uint256 value);
    event log_named_address(string key, address value);
    event ForkEvidence(
        uint256 forkBlock, uint256 proposalId, address module, uint256 gemPaid, uint256 wethPaid, uint256 usdcPaid
    );

    function testRealGovernorAuthorizationCycleAndRealTokenExits() public {
        string memory rpc = vm.envOr("POLYGON_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        uint256 pinned = vm.envOr("POLYGON_FORK_BLOCK", uint256(0));
        if (pinned == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, pinned);
        uint256 forkBlock = block.number;
        require(
            IERC20Metadata(GEM).decimals() == 18 && IERC20Metadata(WETH).decimals() == 18
                && IERC20Metadata(USDC).decimals() == 6
        );
        MythicalRagequitModule module = new MythicalRagequitModule(TREASURY, MANA, GEM, WETH, USDC);
        address[3] memory basket = module.basket();
        require(basket[0] == GEM && basket[1] == WETH && basket[2] == USDC && basket[2] != BRIDGED);
        // Fork-only fixture: move existing treasury MANA to a test member and self-delegate.
        // The authorization itself MUST run through a real proposal, vote and execution below.
        vm.prank(TREASURY);
        require(IERC20(MANA).transfer(member, 50000 ether));
        vm.prank(member);
        IVotes(MANA).delegate(member);
        vm.roll(block.number + 1);
        checkCancellation(module, basket);
        uint256 id = authorize(module, basket, type(uint256).max);
        uint256 bridgeBefore = IERC20(BRIDGED).balanceOf(TREASURY);
        uint256[3] memory quote = module.previewRedeem(1 ether);
        require(quote[0] > 0 && quote[1] > 0);
        vm.prank(member);
        IERC20(MANA).approve(address(module), 1 ether);
        vm.prank(member);
        uint256[3] memory paid = module.redeem(1 ether, member, quote, block.timestamp + 900);
        require(IERC20(BRIDGED).balanceOf(TREASURY) == bridgeBefore);
        require(paid[0] == quote[0] && paid[1] == quote[1] && paid[2] == quote[2]);
        // A real native-USDC receipt after authorization is included automatically.
        address pool = PoolFactory(0x1F98431c8aD98523631AE4a59f267346ea31F984).getPool(USDC, WETH, 500);
        require(pool != address(0) && IERC20(USDC).balanceOf(pool) > 1e6);
        vm.prank(pool);
        IERC20(USDC).transfer(TREASURY, 1e6);
        quote = module.previewRedeem(1 ether);
        require(quote[2] > 0);
        vm.prank(member);
        IERC20(MANA).approve(address(module), 1 ether);
        vm.prank(member);
        module.redeem(1 ether, member, quote, block.timestamp + 900);
        checkPausedRollback(module);
        vm.prank(FiatToken(USDC).pauser());
        FiatToken(USDC).unpause();
        authorize(module, basket, 0);
        vm.prank(member);
        vm.expectRevert();
        module.redeem(1 ether, member, [uint256(0), 0, 0], block.timestamp + 900);
        emit log_named_uint("forkBlock", forkBlock);
        emit log_named_uint("authorizationProposalId", id);
        emit log_named_address("module", address(module));
        emit log_named_uint("firstExitGem", paid[0]);
        emit log_named_uint("firstExitWeth", paid[1]);
        emit log_named_uint("firstExitNativeUsdc", paid[2]);
        emit ForkEvidence(forkBlock, id, address(module), paid[0], paid[1], paid[2]);
    }

    function authorize(MythicalRagequitModule module, address[3] memory basket, uint256 limit)
        internal
        returns (uint256 id)
    {
        address[] memory targets = new address[](3);
        uint256[] memory values = new uint256[](3);
        bytes[] memory calls = new bytes[](3);
        for (uint256 i; i < 3; ++i) {
            targets[i] = basket[i];
            calls[i] = abi.encodeCall(IERC20.approve, (address(module), limit));
        }
        string memory description = limit == 0
            ? "Revoke the exit module - fork rehearsal"
            : "Authorize immutable noncustodial GEM WETH native USDC exits - fork rehearsal";
        ExistingGovernor governor = ExistingGovernor(TREASURY);
        vm.prank(member);
        id = governor.propose(targets, values, calls, description);
        vm.roll(governor.proposalSnapshot(id) + 1);
        require(governor.state(id) == 1);
        vm.prank(member);
        governor.castVote(id, 1);
        vm.roll(governor.proposalDeadline(id) + 1);
        require(governor.state(id) == 4, "real Governor did not approve");
        governor.execute(targets, values, calls, keccak256(bytes(description)));
        require(governor.state(id) == 7);
        for (uint256 i; i < 3; ++i) {
            require(IERC20(basket[i]).allowance(TREASURY, address(module)) == limit);
        }
    }

    function checkPausedRollback(MythicalRagequitModule module) internal {
        // Pause the real USDC implementation in this isolated fork and prove atomic rollback.
        vm.prank(FiatToken(USDC).pauser());
        FiatToken(USDC).pause();
        uint256 manaBefore = IERC20(MANA).balanceOf(member);
        uint256 supplyBefore = IERC20(MANA).totalSupply();
        uint256 gemBefore = IERC20(GEM).balanceOf(member);
        uint256 wethBefore = IERC20(WETH).balanceOf(member);
        vm.prank(member);
        IERC20(MANA).approve(address(module), 1 ether);
        vm.prank(member);
        vm.expectRevert();
        module.redeem(1 ether, member, [uint256(0), 0, 0], block.timestamp + 900);
        require(IERC20(MANA).balanceOf(member) == manaBefore && IERC20(MANA).totalSupply() == supplyBefore);
        require(IERC20(GEM).balanceOf(member) == gemBefore && IERC20(WETH).balanceOf(member) == wethBefore);
    }

    function checkCancellation(MythicalRagequitModule module, address[3] memory basket) internal {
        ExistingGovernor governor = ExistingGovernor(TREASURY);
        address[] memory targets = new address[](1);
        targets[0] = basket[0];
        uint256[] memory values = new uint256[](1);
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(IERC20.approve, (address(module), 0));
        string memory text = "Cancel pending proposal - fork rehearsal";
        vm.prank(member);
        uint256 id = governor.propose(targets, values, calls, text);
        vm.prank(address(0xB0B));
        vm.expectRevert();
        governor.cancel(targets, values, calls, keccak256(bytes(text)));
        vm.prank(member);
        governor.cancel(targets, values, calls, keccak256(bytes(text)));
        require(governor.state(id) == 2);
    }
}
