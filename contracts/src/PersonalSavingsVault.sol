// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/// @notice Self-custodial scheduled savings for one immutable ERC-20 asset.
/// @dev This contract does not invest deposits and does not generate yield.
contract PersonalSavingsVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint32 public constant WEEKLY = 7 days;
    uint32 public constant MONTHLY = 30 days;
    uint48 public constant EMERGENCY_EXIT_DELAY = 48 hours;
    uint256 public constant MAX_PAGE_SIZE = 100;

    struct Plan {
        address owner;
        uint256 deposited;
        uint256 withdrawn;
        uint256 releaseAmount;
        uint48 firstReleaseAt;
        uint32 interval;
        uint48 emergencyExitAt;
    }

    IERC20 public immutable asset;
    uint256 public totalManaged;
    mapping(bytes32 planId => Plan) public plans;
    mapping(address owner => bytes32[]) private ownerPlans;
    mapping(address owner => uint256) public nonces;

    error InvalidAddress();
    error InvalidAmount();
    error InvalidCadence();
    error InvalidPageSize();
    error NotPlanOwner();
    error NothingToWithdraw();
    error EmergencyExitAlreadyRequested();
    error EmergencyExitNotReady();
    error UnsupportedTransferFee();

    event PlanCreated(bytes32 indexed planId, address indexed owner, uint256 amount, uint256 releaseAmount, uint48 firstReleaseAt, uint32 interval);
    event SavingsWithdrawn(bytes32 indexed planId, address indexed owner, uint256 amount);
    event EmergencyExitRequested(bytes32 indexed planId, address indexed owner, uint48 availableAt);
    event EmergencyExitCancelled(bytes32 indexed planId, address indexed owner);
    event EmergencyExitCompleted(bytes32 indexed planId, address indexed owner, uint256 amount);

    constructor(IERC20 asset_) {
        if (address(asset_) == address(0) || address(asset_).code.length == 0) revert InvalidAddress();
        asset = asset_;
    }

    function createPlan(uint256 amount, uint32 interval, uint256 releaseAmount) external nonReentrant returns (bytes32 planId) {
        if (amount == 0 || releaseAmount == 0 || releaseAmount > amount) revert InvalidAmount();
        if (interval != WEEKLY && interval != MONTHLY) revert InvalidCadence();

        uint256 beforeBalance = asset.balanceOf(address(this));
        uint256 nonce = nonces[msg.sender]++;
        planId = keccak256(abi.encode(block.chainid, address(this), msg.sender, nonce));
        uint48 firstReleaseAt = uint48(block.timestamp + interval);
        plans[planId] = Plan({
            owner: msg.sender,
            deposited: amount,
            withdrawn: 0,
            releaseAmount: releaseAmount,
            firstReleaseAt: firstReleaseAt,
            interval: interval,
            emergencyExitAt: 0
        });
        ownerPlans[msg.sender].push(planId);
        totalManaged += amount;

        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (asset.balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedTransferFee();
        emit PlanCreated(planId, msg.sender, amount, releaseAmount, firstReleaseAt, interval);
    }

    function planCount(address owner) external view returns (uint256) {
        return ownerPlans[owner].length;
    }

    function planIdsPage(address owner, uint256 offset, uint256 limit) external view returns (bytes32[] memory page) {
        if (limit == 0 || limit > MAX_PAGE_SIZE) revert InvalidPageSize();
        bytes32[] storage ids = ownerPlans[owner];
        if (offset >= ids.length) return new bytes32[](0);
        uint256 count = ids.length - offset;
        if (count > limit) count = limit;
        page = new bytes32[](count);
        for (uint256 index = 0; index < count; index += 1) {
            page[index] = ids[offset + index];
        }
    }

    function remaining(bytes32 planId) public view returns (uint256) {
        Plan storage plan = plans[planId];
        return plan.deposited - plan.withdrawn;
    }

    function withdrawable(bytes32 planId) public view returns (uint256) {
        Plan storage plan = plans[planId];
        if (plan.owner == address(0)) return 0;
        uint256 balance = remaining(planId);
        if (balance == 0) return 0;
        if (plan.emergencyExitAt != 0 && block.timestamp >= plan.emergencyExitAt) return balance;
        if (block.timestamp < plan.firstReleaseAt) return 0;
        uint256 periods = ((block.timestamp - plan.firstReleaseAt) / plan.interval) + 1;
        uint256 unlocked = periods * plan.releaseAmount;
        if (unlocked > plan.deposited) unlocked = plan.deposited;
        return unlocked > plan.withdrawn ? unlocked - plan.withdrawn : 0;
    }

    function withdraw(bytes32 planId, uint256 amount) external nonReentrant {
        Plan storage plan = _ownedPlan(planId);
        if (amount == 0 || amount > withdrawable(planId)) revert NothingToWithdraw();
        plan.withdrawn += amount;
        totalManaged -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit SavingsWithdrawn(planId, msg.sender, amount);
    }

    function requestEmergencyExit(bytes32 planId) external {
        Plan storage plan = _ownedPlan(planId);
        if (remaining(planId) == 0) revert NothingToWithdraw();
        if (plan.emergencyExitAt != 0) revert EmergencyExitAlreadyRequested();
        uint48 availableAt = uint48(block.timestamp + EMERGENCY_EXIT_DELAY);
        plan.emergencyExitAt = availableAt;
        emit EmergencyExitRequested(planId, msg.sender, availableAt);
    }

    function cancelEmergencyExit(bytes32 planId) external {
        Plan storage plan = _ownedPlan(planId);
        plan.emergencyExitAt = 0;
        emit EmergencyExitCancelled(planId, msg.sender);
    }

    function completeEmergencyExit(bytes32 planId) external nonReentrant {
        Plan storage plan = _ownedPlan(planId);
        if (plan.emergencyExitAt == 0 || block.timestamp < plan.emergencyExitAt) revert EmergencyExitNotReady();
        uint256 amount = remaining(planId);
        if (amount == 0) revert NothingToWithdraw();
        plan.withdrawn = plan.deposited;
        totalManaged -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit EmergencyExitCompleted(planId, msg.sender, amount);
    }

    function _ownedPlan(bytes32 planId) private view returns (Plan storage plan) {
        plan = plans[planId];
        if (plan.owner != msg.sender) revert NotPlanOwner();
    }
}
