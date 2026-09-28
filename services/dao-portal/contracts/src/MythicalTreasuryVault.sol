// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IBurnableMANA is IERC20 {
    function burnFrom(address account, uint256 value) external;
}

/// @notice No owner, pause, upgrade or arbitrary-call escape hatch. The immutable timelock alone authorizes spending.
contract MythicalTreasuryVault is ReentrancyGuard, ERC721Holder, ERC1155Holder {
    using SafeERC20 for IERC20;

    IBurnableMANA public immutable mana;
    IERC20 public immutable weth;
    IERC20 public immutable usdc;
    address public immutable timelock;

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error Expired();
    error Slippage(uint256 asset);
    error NoPayout();
    error NativeTransferFailed();
    error IncompatibleToken();

    event NativeDeposit(address indexed sender, uint256 amount);
    event Redeemed(
        address indexed member,
        address indexed recipient,
        uint256 manaBurned,
        uint256 polPaid,
        uint256 wethPaid,
        uint256 usdcPaid
    );
    event Payment(address indexed asset, address indexed recipient, uint256 amount);

    constructor(IBurnableMANA mana_, IERC20 weth_, IERC20 usdc_, address timelock_) {
        if (
            address(mana_) == address(0) || address(weth_) == address(0) || address(usdc_) == address(0)
                || timelock_ == address(0) || address(mana_) == address(weth_) || address(mana_) == address(usdc_)
                || address(weth_) == address(usdc_)
        ) revert InvalidAddress();
        mana = mana_;
        weth = weth_;
        usdc = usdc_;
        timelock = timelock_;
    }

    receive() external payable {
        emit NativeDeposit(msg.sender, msg.value);
    }

    modifier onlyGovernance() {
        if (msg.sender != timelock) revert Unauthorized();
        _;
    }

    /// @return amounts POL, WETH, USDC.e, in that order. Includes all unpaid commitments in current balances.
    function previewRedeem(uint256 amount) public view returns (uint256[3] memory amounts) {
        uint256 supply = mana.totalSupply();
        if (amount == 0 || amount > supply) revert InvalidAmount();
        amounts[0] = Math.mulDiv(address(this).balance, amount, supply);
        amounts[1] = Math.mulDiv(weth.balanceOf(address(this)), amount, supply);
        amounts[2] = Math.mulDiv(usdc.balanceOf(address(this)), amount, supply);
    }

    function redeem(uint256 amount, address payable recipient, uint256[3] calldata minimums, uint256 deadline)
        external
        nonReentrant
        returns (uint256[3] memory amounts)
    {
        if (block.timestamp > deadline) revert Expired();
        _recipient(recipient);
        amounts = previewRedeem(amount);
        if (amounts[0] == 0 && amounts[1] == 0 && amounts[2] == 0) revert NoPayout();
        for (uint256 i; i < 3; ++i) {
            if (amounts[i] < minimums[i]) revert Slippage(i);
        }
        uint256 supplyBefore = mana.totalSupply();
        uint256 balanceBefore = mana.balanceOf(msg.sender);
        mana.burnFrom(msg.sender, amount);
        if (mana.totalSupply() != supplyBefore - amount || mana.balanceOf(msg.sender) != balanceBefore - amount) {
            revert IncompatibleToken();
        }
        _sendNative(recipient, amounts[0]);
        _sendToken(weth, recipient, amounts[1]);
        _sendToken(usdc, recipient, amounts[2]);
        emit Redeemed(msg.sender, recipient, amount, amounts[0], amounts[1], amounts[2]);
    }

    function payNative(address payable recipient, uint256 amount) external onlyGovernance nonReentrant {
        _recipient(recipient);
        if (amount == 0) revert InvalidAmount();
        _sendNative(recipient, amount);
        emit Payment(address(0), recipient, amount);
    }

    /// @notice Also permits governance to recover assets outside the fixed exit basket, including MANA.
    function payToken(IERC20 asset, address recipient, uint256 amount) external onlyGovernance nonReentrant {
        _recipient(recipient);
        if (amount == 0) revert InvalidAmount();
        _sendToken(asset, recipient, amount);
        emit Payment(address(asset), recipient, amount);
    }

    function transferNFT(IERC721 asset, address recipient, uint256 id) external onlyGovernance nonReentrant {
        _recipient(recipient);
        asset.safeTransferFrom(address(this), recipient, id);
    }

    function transferERC1155(IERC1155 asset, address recipient, uint256 id, uint256 amount)
        external
        onlyGovernance
        nonReentrant
    {
        _recipient(recipient);
        asset.safeTransferFrom(address(this), recipient, id, amount, "");
    }

    function _recipient(address recipient) private view {
        if (recipient == address(0) || recipient == address(this)) revert InvalidAddress();
    }

    function _sendNative(address payable recipient, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }

    function _sendToken(IERC20 asset, address recipient, uint256 amount) private {
        if (amount == 0) return;
        uint256 beforeRecipient = asset.balanceOf(recipient);
        uint256 beforeVault = asset.balanceOf(address(this));
        asset.safeTransfer(recipient, amount);
        if (
            asset.balanceOf(recipient) != beforeRecipient + amount
                || asset.balanceOf(address(this)) != beforeVault - amount
        ) {
            revert IncompatibleToken();
        }
    }
}
