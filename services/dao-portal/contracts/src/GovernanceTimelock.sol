// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @notice A governance-controlled timelock whose exit window cannot be shortened below 72 hours.
contract GovernanceTimelock is TimelockController {
    uint256 public constant MINIMUM_DELAY = 72 hours;

    error DelayBelowFloor();
    error FixedGovernanceRoles();

    address public governor;

    /// @notice One-time bootstrap: bind the Governor, open execution, and remove the bootstrap admin.
    function initializeGovernor(address governor_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (governor != address(0) || governor_.code.length == 0 || msg.sender == address(this)) {
            revert FixedGovernanceRoles();
        }
        governor = governor_;
        _grantRole(PROPOSER_ROLE, governor_);
        _grantRole(CANCELLER_ROLE, governor_);
        _grantRole(EXECUTOR_ROLE, address(0));
        _revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (governor != address(0)) {
            if ((role == PROPOSER_ROLE || role == CANCELLER_ROLE) && account != governor) revert FixedGovernanceRoles();
            if (role == DEFAULT_ADMIN_ROLE && account != address(this)) revert FixedGovernanceRoles();
            if (role == EXECUTOR_ROLE && account != address(0) && account != governor) revert FixedGovernanceRoles();
        }
        return super._grantRole(role, account);
    }

    constructor(address bootstrapAdmin)
        TimelockController(MINIMUM_DELAY, new address[](0), new address[](0), bootstrapAdmin)
    {}

    function updateDelay(uint256 newDelay) public override {
        if (newDelay < MINIMUM_DELAY) revert DelayBelowFloor();
        super.updateDelay(newDelay);
    }
}
