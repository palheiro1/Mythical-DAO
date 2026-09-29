// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBurnableMANA is IERC20 {
    function burnFrom(address account, uint256 amount) external;
}

/// @notice Noncustodial, immutable exit module. Basket order is GEM, WETH, native USDC.
/// @dev Treasury allowances are revocable by governance. No exit window or reserved funds.
contract MythicalRagequitModule is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable treasury;
    IBurnableMANA public immutable mana;
    IERC20 public immutable gem;
    IERC20 public immutable weth;
    IERC20 public immutable usdc;

    error InvalidConfiguration();
    error InvalidAmount();
    error InvalidRecipient();
    error Expired();
    error ZeroPayment();
    error BelowMinimum(uint256 index);
    error IncompatibleBalanceChange();

    event RagequitExecuted(
        address indexed member,
        address indexed recipient,
        uint256 manaBurned,
        uint256 gemPaid,
        uint256 wethPaid,
        uint256 usdcPaid
    );

    constructor(address treasury_, address mana_, address gem_, address weth_, address usdc_) {
        address[5] memory addresses = [treasury_, mana_, gem_, weth_, usdc_];
        for (uint256 i; i < 5; ++i) {
            if (addresses[i].code.length == 0) revert InvalidConfiguration();
            for (uint256 j; j < i; ++j) {
                if (addresses[i] == addresses[j]) revert InvalidConfiguration();
            }
        }
        treasury = treasury_;
        mana = IBurnableMANA(mana_);
        gem = IERC20(gem_);
        weth = IERC20(weth_);
        usdc = IERC20(usdc_);
    }

    function basket() public view returns (address[3] memory) {
        return [address(gem), address(weth), address(usdc)];
    }

    function previewRedeem(uint256 amount) public view returns (uint256[3] memory amounts) {
        uint256 supply = mana.totalSupply();
        if (amount == 0 || amount > supply) revert InvalidAmount();
        address[3] memory assets = basket();
        for (uint256 i; i < 3; ++i) {
            amounts[i] = Math.mulDiv(IERC20(assets[i]).balanceOf(treasury), amount, supply);
        }
    }

    function redeem(uint256 amount, address recipient, uint256[3] calldata minimums, uint256 deadline)
        external
        nonReentrant
        returns (uint256[3] memory amounts)
    {
        if (recipient == address(0) || recipient == treasury || recipient == address(this)) revert InvalidRecipient();
        if (block.timestamp > deadline) revert Expired();
        uint256 supply = mana.totalSupply();
        uint256 memberBalance = mana.balanceOf(msg.sender);
        if (amount == 0 || amount > supply || amount > memberBalance) revert InvalidAmount();
        address[3] memory assets = basket();
        uint256[3] memory treasuryBefore;
        uint256[3] memory recipientBefore;
        bool positive;
        for (uint256 i; i < 3; ++i) {
            treasuryBefore[i] = IERC20(assets[i]).balanceOf(treasury);
            recipientBefore[i] = IERC20(assets[i]).balanceOf(recipient);
            amounts[i] = Math.mulDiv(treasuryBefore[i], amount, supply);
            if (amounts[i] < minimums[i]) revert BelowMinimum(i);
            if (amounts[i] > 0) positive = true;
        }
        if (!positive) revert ZeroPayment();
        // Only the caller's MANA can be burned. Delegation grants no spending right.
        mana.burnFrom(msg.sender, amount);
        for (uint256 i; i < 3; ++i) {
            if (amounts[i] > 0) IERC20(assets[i]).safeTransferFrom(treasury, recipient, amounts[i]);
        }
        // Check the complete transaction, including hooks in other basket assets.
        if (mana.totalSupply() != supply - amount || mana.balanceOf(msg.sender) != memberBalance - amount) {
            revert IncompatibleBalanceChange();
        }
        for (uint256 i; i < 3; ++i) {
            if (
                IERC20(assets[i]).balanceOf(treasury) != treasuryBefore[i] - amounts[i]
                    || IERC20(assets[i]).balanceOf(recipient) != recipientBefore[i] + amounts[i]
            ) {
                revert IncompatibleBalanceChange();
            }
        }
        emit RagequitExecuted(msg.sender, recipient, amount, amounts[0], amounts[1], amounts[2]);
    }
}
