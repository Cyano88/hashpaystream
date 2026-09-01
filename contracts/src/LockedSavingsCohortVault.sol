// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/// @notice Immutable fixed-term savings cohorts for one ERC-20 asset.
/// @dev Early-exit penalties stay within their duration and are paid only by contract rules.
contract LockedSavingsCohortVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant EARLY_EXIT_PENALTY_BPS = 500;
    uint16 public constant MAXIMUM_REWARD_BPS = 500;
    uint16 private constant BPS = 10_000;
    uint256 public constant MINIMUM_DEPOSIT = 1_000_000;
    uint32 public constant COHORT_INTERVAL = 7 days;
    uint32 public constant THIRTY_DAYS = 30 days;
    uint32 public constant NINETY_DAYS = 90 days;
    uint32 public constant ONE_EIGHTY_DAYS = 180 days;
    uint32 public constant THREE_SIXTY_FIVE_DAYS = 365 days;

    struct Cohort {
        uint48 startsAt;
        uint48 maturesAt;
        uint32 duration;
        uint32 activePositions;
        uint32 remainingClaims;
        uint256 totalPrincipal;
        uint256 finalPrincipal;
        uint256 rewardPool;
        uint256 rewardsPaid;
    }

    struct Position {
        uint256 principal;
        bool exited;
        bool claimed;
    }

    IERC20 public immutable asset;
    uint256 public totalManaged;
    mapping(bytes32 cohortId => Cohort) public cohorts;
    mapping(bytes32 cohortId => mapping(address owner => Position)) public positions;
    mapping(uint32 duration => uint256) public termRewardCarry;
    mapping(address owner => bytes32[]) private ownerCohorts;

    error InvalidAddress();
    error InvalidAmount();
    error InvalidDuration();
    error CohortStarted();
    error CohortNotStarted();
    error CohortMatured();
    error CohortNotMatured();
    error NoPosition();
    error PositionClosed();
    error UnsupportedTransferFee();

    event LockedSavingsDeposited(bytes32 indexed cohortId, address indexed owner, uint256 amount, uint48 startsAt, uint48 maturesAt);
    event PreStartDepositCancelled(bytes32 indexed cohortId, address indexed owner, uint256 amount);
    event EarlyExit(bytes32 indexed cohortId, address indexed owner, uint256 principal, uint256 penalty, uint256 payout);
    event RewardsCarriedForward(bytes32 indexed cohortId, uint32 indexed duration, uint256 amount);
    event RewardsApplied(bytes32 indexed cohortId, uint32 indexed duration, uint256 amount);
    event LockedSavingsClaimed(bytes32 indexed cohortId, address indexed owner, uint256 principal, uint256 reward);

    constructor(IERC20 asset_) {
        if (address(asset_) == address(0)) revert InvalidAddress();
        asset = asset_;
    }

    function nextCohort(uint32 duration) public view returns (bytes32 cohortId, uint48 startsAt, uint48 maturesAt) {
        _validateDuration(duration);
        startsAt = uint48(((block.timestamp / COHORT_INTERVAL) + 1) * COHORT_INTERVAL);
        maturesAt = startsAt + duration;
        cohortId = keccak256(abi.encode(block.chainid, address(this), startsAt, duration));
    }

    function deposit(uint256 amount, uint32 duration) external nonReentrant returns (bytes32 cohortId) {
        if (amount < MINIMUM_DEPOSIT) revert InvalidAmount();
        uint48 startsAt;
        uint48 maturesAt;
        (cohortId, startsAt, maturesAt) = nextCohort(duration);

        Cohort storage cohort = cohorts[cohortId];
        if (cohort.startsAt == 0) {
            cohort.startsAt = startsAt;
            cohort.maturesAt = maturesAt;
            cohort.duration = duration;
        }
        if (block.timestamp >= cohort.startsAt) revert CohortStarted();

        Position storage position = positions[cohortId][msg.sender];
        if (position.exited || position.claimed) revert PositionClosed();

        uint256 beforeBalance = asset.balanceOf(address(this));
        if (position.principal == 0) {
            cohort.activePositions += 1;
            ownerCohorts[msg.sender].push(cohortId);
        }
        position.principal += amount;
        cohort.totalPrincipal += amount;
        totalManaged += amount;

        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (asset.balanceOf(address(this)) - beforeBalance != amount) revert UnsupportedTransferFee();
        emit LockedSavingsDeposited(cohortId, msg.sender, amount, startsAt, maturesAt);
    }

    function cancelBeforeStart(bytes32 cohortId) external nonReentrant {
        Cohort storage cohort = cohorts[cohortId];
        if (cohort.startsAt == 0) revert NoPosition();
        if (block.timestamp >= cohort.startsAt) revert CohortStarted();
        Position storage position = _openPosition(cohortId);
        uint256 principal = position.principal;
        position.principal = 0;
        position.exited = true;
        cohort.totalPrincipal -= principal;
        cohort.activePositions -= 1;
        totalManaged -= principal;
        asset.safeTransfer(msg.sender, principal);
        emit PreStartDepositCancelled(cohortId, msg.sender, principal);
    }

    function exitEarly(bytes32 cohortId) external nonReentrant {
        Cohort storage cohort = cohorts[cohortId];
        if (block.timestamp < cohort.startsAt) revert CohortNotStarted();
        if (block.timestamp >= cohort.maturesAt) revert CohortMatured();
        Position storage position = _openPosition(cohortId);
        uint256 principal = position.principal;

        position.principal = 0;
        position.exited = true;
        cohort.totalPrincipal -= principal;
        cohort.activePositions -= 1;

        uint256 penalty = (principal * EARLY_EXIT_PENALTY_BPS) / BPS;
        uint256 payout = principal - penalty;
        cohort.rewardPool += penalty;
        totalManaged -= payout;
        uint256 carried = 0;
        if (cohort.activePositions == 0 && cohort.rewardPool != 0) {
            carried = cohort.rewardPool;
            cohort.rewardPool = 0;
            termRewardCarry[cohort.duration] += carried;
        }

        asset.safeTransfer(msg.sender, payout);
        emit EarlyExit(cohortId, msg.sender, principal, penalty, payout);
        if (carried != 0) emit RewardsCarriedForward(cohortId, cohort.duration, carried);
    }

    function claim(bytes32 cohortId) external nonReentrant {
        Cohort storage cohort = cohorts[cohortId];
        if (block.timestamp < cohort.maturesAt) revert CohortNotMatured();
        Position storage position = _openPosition(cohortId);
        if (cohort.finalPrincipal == 0) {
            cohort.finalPrincipal = cohort.totalPrincipal;
            cohort.remainingClaims = cohort.activePositions;
            uint256 maximumCohortReward = (cohort.finalPrincipal * MAXIMUM_REWARD_BPS) / BPS;
            if (cohort.rewardPool > maximumCohortReward) {
                uint256 excess = cohort.rewardPool - maximumCohortReward;
                cohort.rewardPool = maximumCohortReward;
                termRewardCarry[cohort.duration] += excess;
                emit RewardsCarriedForward(cohortId, cohort.duration, excess);
            } else if (cohort.rewardPool < maximumCohortReward) {
                uint256 capacity = maximumCohortReward - cohort.rewardPool;
                uint256 carry = termRewardCarry[cohort.duration];
                uint256 applied = carry < capacity ? carry : capacity;
                if (applied != 0) {
                    termRewardCarry[cohort.duration] = carry - applied;
                    cohort.rewardPool += applied;
                    emit RewardsApplied(cohortId, cohort.duration, applied);
                }
            }
        }

        uint256 proportionalReward = (cohort.rewardPool * position.principal) / cohort.finalPrincipal;
        uint256 maximumReward = (position.principal * MAXIMUM_REWARD_BPS) / BPS;
        uint256 reward = proportionalReward < maximumReward ? proportionalReward : maximumReward;
        uint256 principal = position.principal;
        position.principal = 0;
        position.claimed = true;
        cohort.activePositions -= 1;
        cohort.remainingClaims -= 1;
        cohort.rewardsPaid += reward;
        if (cohort.remainingClaims == 0 && cohort.rewardPool > cohort.rewardsPaid) {
            uint256 carry = cohort.rewardPool - cohort.rewardsPaid;
            termRewardCarry[cohort.duration] += carry;
            emit RewardsCarriedForward(cohortId, cohort.duration, carry);
        }
        totalManaged -= principal + reward;
        asset.safeTransfer(msg.sender, principal + reward);
        emit LockedSavingsClaimed(cohortId, msg.sender, principal, reward);
    }

    function ownerCohortIds(address owner) external view returns (bytes32[] memory) {
        return ownerCohorts[owner];
    }

    function previewEarlyExit(bytes32 cohortId, address owner) external view returns (uint256 payout, uint256 penalty) {
        uint256 principal = positions[cohortId][owner].principal;
        if (principal == 0) return (0, 0);
        penalty = (principal * EARLY_EXIT_PENALTY_BPS) / BPS;
        payout = principal - penalty;
    }

    function _openPosition(bytes32 cohortId) private view returns (Position storage position) {
        position = positions[cohortId][msg.sender];
        if (position.principal == 0) revert NoPosition();
        if (position.exited || position.claimed) revert PositionClosed();
    }

    function _validateDuration(uint32 duration) private pure {
        if (duration != THIRTY_DAYS && duration != NINETY_DAYS && duration != ONE_EIGHTY_DAYS && duration != THREE_SIXTY_FIVE_DAYS) {
            revert InvalidDuration();
        }
    }
}
