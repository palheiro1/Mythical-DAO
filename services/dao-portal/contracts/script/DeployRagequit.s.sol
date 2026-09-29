// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MythicalRagequitModule} from "../src/MythicalRagequitModule.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface RagequitScriptVm {
    function envAddress(string calldata) external returns (address);
    function startBroadcast(address) external;
    function stopBroadcast() external;
}
/// @notice Deploys ONLY the exit module. Never moves funds or changes governance rules.

contract DeployRagequit {
    RagequitScriptVm constant vm = RagequitScriptVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event ModuleDeployed(address module, uint256 blockNumber);

    function run() external returns (MythicalRagequitModule module) {
        require(block.chainid == 137, "Polygon only");
        address mana = 0x2caCCa1266653bB090D3Fb511456EBCA33150562;
        address gem = 0x5F790ffA0695967A2d711872EcB4c7553e24794D;
        address weth = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
        address usdc = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359;
        require(
            IERC20Metadata(mana).decimals() == 18 && IERC20Metadata(gem).decimals() == 18
                && IERC20Metadata(weth).decimals() == 18 && IERC20Metadata(usdc).decimals() == 6,
            "Unexpected token decimals"
        );
        vm.startBroadcast(vm.envAddress("DEPLOYER_ADDRESS"));
        module = new MythicalRagequitModule(0x7B9e327748462F1038c9D081c98d189b22C60A27, mana, gem, weth, usdc);
        vm.stopBroadcast();
        emit ModuleDeployed(address(module), block.number);
    }
}
