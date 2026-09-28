// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {MythicalTreasuryVault} from "../src/MythicalTreasuryVault.sol";

interface Vm {
    function skip(bool) external;
    function roll(uint256) external;
    function warp(uint256) external;
    function deal(address, uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function envOr(string calldata, string calldata) external returns (string memory);
    function createSelectFork(string calldata) external returns (uint256);
}

contract MockMANA is ERC20, ERC20Burnable, ERC20Votes {
    constructor() ERC20("MANA", "MANA") EIP712("MANA", "1") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }
}

contract MockAsset is ERC20 {
    bool public fails;
    bool public fee;

    constructor() ERC20("Asset", "ASSET") {}

    function mint(address to, uint256 value) external {
        _mint(to, value);
    }

    function setFails(bool value) external {
        fails = value;
    }

    function setFee(bool value) external {
        fee = value;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        require(!fails, "paused");
        if (fee && value > 0) {
            _burn(msg.sender, 1);
            return super.transfer(to, value - 1);
        }
        return super.transfer(to, value);
    }
}

contract RejectNative {
    receive() external payable {
        revert("reject");
    }
}

contract ReenterNative {
    MythicalTreasuryVault public vault;
    bool public blocked;

    constructor(MythicalTreasuryVault v) {
        vault = v;
    }

    receive() external payable {
        uint256[3] memory mins;
        try vault.redeem(1, payable(address(this)), mins, block.timestamp) {
            revert("reentered");
        } catch {
            blocked = true;
        }
    }
}
