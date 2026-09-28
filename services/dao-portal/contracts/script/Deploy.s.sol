// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MythicalGovernorV2} from "../src/MythicalGovernorV2.sol";
import {GovernanceTimelock} from "../src/GovernanceTimelock.sol";
import {MythicalTreasuryVault, IBurnableMANA} from "../src/MythicalTreasuryVault.sol";
import {MythicalCommunityBallots} from "../src/MythicalCommunityBallots.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface ScriptVm {
    function envAddress(string calldata) external returns (address);
    function envOr(string calldata, address) external returns (address);
    function startBroadcast(address) external;
    function stopBroadcast() external;
    function serializeAddress(string calldata, string calldata, address) external returns (string memory);
    function serializeUint(string calldata, string calldata, uint256) external returns (string memory);
    function writeJson(string calldata, string calldata) external;
    function toString(uint256) external returns (string memory);
}

contract Deploy {
    ScriptVm constant vm = ScriptVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() public {
        require(block.chainid == 137 || block.chainid == 80002 || block.chainid == 31337, "unsupported chain");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address mana = vm.envOr("MANA_ADDRESS", address(0x2caCCa1266653bB090D3Fb511456EBCA33150562));
        address weth = vm.envOr("WETH_ADDRESS", address(0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619));
        address usdc = vm.envOr("USDC_ADDRESS", address(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174));
        require(IERC20Metadata(mana).decimals() == 18, "MANA must use 18 decimals");
        IVotes(mana).getPastTotalSupply(block.number - 1);
        vm.startBroadcast(deployer);
        GovernanceTimelock timelock = new GovernanceTimelock(deployer);
        MythicalGovernorV2 governor = new MythicalGovernorV2(IVotes(mana), timelock);
        MythicalTreasuryVault vault =
            new MythicalTreasuryVault(IBurnableMANA(mana), IERC20(weth), IERC20(usdc), address(timelock));
        MythicalCommunityBallots ballots = new MythicalCommunityBallots(IVotes(mana), address(timelock));
        timelock.initializeGovernor(address(governor));
        vm.stopBroadcast();
        require(!timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer), "admin not renounced");
        vm.serializeAddress("deployment", "mana", mana);
        vm.serializeAddress("deployment", "weth", weth);
        vm.serializeAddress("deployment", "usdc", usdc);
        vm.serializeAddress("deployment", "governor", address(governor));
        vm.serializeAddress("deployment", "timelock", address(timelock));
        vm.serializeAddress("deployment", "vault", address(vault));
        vm.serializeAddress("deployment", "ballots", address(ballots));
        vm.serializeUint("deployment", "chainId", block.chainid);
        string memory result = vm.serializeUint("deployment", "scanFromBlock", block.number);
        vm.writeJson(result, string.concat("deployments/addresses-", vm.toString(block.chainid), ".json"));
    }
}
