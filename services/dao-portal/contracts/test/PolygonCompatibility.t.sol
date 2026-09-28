// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Vm} from "./Mocks.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IBurnableMANA} from "../src/MythicalTreasuryVault.sol";

contract PolygonCompatibilityTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function testPolygonCompatibilityWhenRPCProvided() public {
        string memory rpc = vm.envOr("POLYGON_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        address mana = 0x2caCCa1266653bB090D3Fb511456EBCA33150562;
        require(IERC20Metadata(mana).decimals() == 18);
        require(IVotes(mana).getPastTotalSupply(block.number - 1) > 0);
        // This exercises the real deployed burnFrom ABI with a nonzero caller.
        vm.prank(address(0xBEEF));
        IBurnableMANA(mana).burnFrom(address(0xBEEF), 0);
    }
}
