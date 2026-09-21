// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IERC20Metadata} from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import {SignatureChecker} from '@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol';
import {Math} from '@openzeppelin/contracts/utils/math/Math.sol';

/// @notice Local review candidate. No deployed asset or price source is endorsed.
/// @dev Fully funded approved earnings only. Exact-transfer, non-rebasing tokens only.
///      Risk signer is trusted to validate price, liquidity, volatility and eligibility.
contract StockEarlyPayEscrow is Ownable2Step, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    struct Earnings {
        address employer;
        address worker;
        uint256 available;
        uint48 payAt;
        bool approved;
    }
    struct Offer {
        bytes32 earningsId;
        address funder;
        address asset;
        uint256 tokenAmount;
        uint256 principal;
        uint16 feeBps;
        uint48 payAt;
        uint48 expiresAt;
        bytes32 nonce;
    }
    struct RiskApproval {
        bytes32 offerHash;
        uint48 observedAt;
        uint48 validUntil;
        uint256 policyVersion;
    }
    struct Claim {
        address funder;
        address worker;
        bytes32 earningsId;
        uint256 repayment;
        uint48 payAt;
        bool settled;
    }

    bytes32 private constant OFFER_TYPEHASH = keccak256('StockOffer(bytes32 earningsId,address funder,address asset,uint256 tokenAmount,uint256 principal,uint16 feeBps,uint48 payAt,uint48 expiresAt,bytes32 nonce)');
    bytes32 private constant RISK_TYPEHASH = keccak256('RiskApproval(bytes32 offerHash,uint48 observedAt,uint48 validUntil,uint256 policyVersion)');
    IERC20 public immutable usdc;
    uint16 public immutable maxFeeBps;
    uint48 public immutable maxRiskAge;
    address public riskSigner;
    bool public paused = true;
    uint256 public policyVersion = 1;
    uint256 public totalUsdcLiability;
    mapping(address => bool) public allowedAsset;
    mapping(address => bool) public allowedFunder;
    mapping(address => mapping(address => uint256)) public inventory;
    mapping(bytes32 => Earnings) public earnings;
    mapping(bytes32 => Claim) public claims;
    mapping(bytes32 => bool) public usedOffers;

    error InvalidInput();
    error Unavailable();
    error Unauthorized();
    error InvalidSignature();
    error StaleRiskApproval();
    error NotDue();
    error TransferMismatch();

    event EarningsFunded(bytes32 indexed earningsId, address indexed employer, address indexed worker, uint256 amount, uint48 payAt);
    event EarningsApproved(bytes32 indexed earningsId);
    event EarningsCancelled(bytes32 indexed earningsId, uint256 amount);
    event EarningsPaid(bytes32 indexed earningsId, address indexed worker, uint256 amount);
    event InventoryChanged(address indexed funder, address indexed asset, uint256 remaining);
    event StockDelivered(bytes32 indexed offerHash, bytes32 indexed earningsId, address indexed funder, address worker, address asset, uint256 tokenAmount, uint256 principal, uint256 fee, uint48 payAt);
    event FunderRepaid(bytes32 indexed offerHash, address indexed funder, uint256 amount);
    event PolicyChanged(uint256 version, address riskSigner);
    event AssetAllowed(address indexed asset, bool allowed);
    event FunderAllowed(address indexed funder, bool allowed);
    event PauseChanged(bool paused);
    event OfferCancelled(bytes32 indexed offerHash, address indexed funder);

    constructor(address usdc_, address owner_, address riskSigner_, uint16 maxFeeBps_, uint48 maxRiskAge_)
        Ownable(owner_) EIP712('HashPayStream Stock Early Pay', '1')
    {
        if (usdc_.code.length == 0 || IERC20Metadata(usdc_).decimals() != 6 ||
            riskSigner_ == address(0) || maxFeeBps_ > 10_000 || maxRiskAge_ == 0) revert InvalidInput();
        usdc = IERC20(usdc_);
        riskSigner = riskSigner_;
        maxFeeBps = maxFeeBps_;
        maxRiskAge = maxRiskAge_;
    }

    function setPaused(bool value) external onlyOwner { paused = value; emit PauseChanged(value); }
    function setAssetAllowed(address asset, bool allowed) external onlyOwner {
        if (asset.code.length == 0 || asset == address(usdc)) revert InvalidInput();
        allowedAsset[asset] = allowed;
        ++policyVersion;
        emit AssetAllowed(asset, allowed);
        emit PolicyChanged(policyVersion, riskSigner);
    }
    function setFunderAllowed(address funder, bool allowed) external onlyOwner {
        if (funder == address(0) || funder == address(this)) revert InvalidInput();
        allowedFunder[funder] = allowed;
        ++policyVersion;
        emit FunderAllowed(funder, allowed);
        emit PolicyChanged(policyVersion, riskSigner);
    }
    function setRiskSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert InvalidInput();
        riskSigner = signer;
        ++policyVersion;
        emit PolicyChanged(policyVersion, signer);
    }
    /// Invalidate outstanding risk attestations when monitored conditions change.
    function invalidateRiskApprovals() external onlyOwner {
        ++policyVersion;
        emit PolicyChanged(policyVersion, riskSigner);
    }

    function depositStock(address asset, uint256 amount) external nonReentrant {
        if (paused || !allowedFunder[msg.sender] || !allowedAsset[asset]) revert Unavailable();
        if (amount == 0) revert InvalidInput();
        inventory[msg.sender][asset] += amount;
        _pullExact(IERC20(asset), msg.sender, amount);
        emit InventoryChanged(msg.sender, asset, inventory[msg.sender][asset]);
    }
    function withdrawStock(address asset, uint256 amount) external nonReentrant {
        if (amount == 0 || inventory[msg.sender][asset] < amount) revert InvalidInput();
        inventory[msg.sender][asset] -= amount;
        _pushExact(IERC20(asset), msg.sender, amount);
        emit InventoryChanged(msg.sender, asset, inventory[msg.sender][asset]);
    }
    function fundEarnings(bytes32 salt, address worker, uint256 amount, uint48 payAt) external nonReentrant returns (bytes32 id) {
        if (paused) revert Unavailable();
        if (worker == address(0) || worker == msg.sender || worker == address(this) || amount == 0 || payAt <= block.timestamp) revert InvalidInput();
        id = keccak256(abi.encode(msg.sender, salt));
        if (earnings[id].employer != address(0)) revert InvalidInput();
        earnings[id] = Earnings(msg.sender, worker, amount, payAt, false);
        totalUsdcLiability += amount;
        _pullExact(usdc, msg.sender, amount);
        emit EarningsFunded(id, msg.sender, worker, amount, payAt);
    }
    /// Approval irrevocably assigns the funded earnings to the worker.
    function approveEarnings(bytes32 id) external {
        Earnings storage item = earnings[id];
        if (msg.sender != item.employer) revert Unauthorized();
        if (paused || item.approved || item.available == 0 || item.payAt <= block.timestamp) revert Unavailable();
        item.approved = true;
        emit EarningsApproved(id);
    }
    function cancelUnapprovedEarnings(bytes32 id) external nonReentrant {
        Earnings storage item = earnings[id];
        if (msg.sender != item.employer) revert Unauthorized();
        if (item.approved || item.available == 0) revert Unavailable();
        uint256 amount = item.available;
        item.available = 0;
        totalUsdcLiability -= amount;
        _pushExact(usdc, item.employer, amount);
        emit EarningsCancelled(id, amount);
    }
    function offerHash(Offer calldata offer) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(OFFER_TYPEHASH, offer.earningsId, offer.funder, offer.asset,
            offer.tokenAmount, offer.principal, offer.feeBps, offer.payAt, offer.expiresAt, offer.nonce)));
    }
    function riskHash(RiskApproval calldata approval) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(RISK_TYPEHASH, approval.offerHash, approval.observedAt, approval.validUntil, approval.policyVersion)));
    }
    function feeFor(uint256 principal, uint16 feeBps) public view returns (uint256) {
        if (principal == 0 || feeBps > maxFeeBps) revert InvalidInput();
        return Math.mulDiv(principal, feeBps, 10_000);
    }
    function cancelOffer(Offer calldata offer) external {
        if (msg.sender != offer.funder) revert Unauthorized();
        bytes32 id = offerHash(offer);
        usedOffers[id] = true;
        emit OfferCancelled(id, msg.sender);
    }

    function acceptOffer(Offer calldata offer, bytes calldata funderSignature, RiskApproval calldata risk, bytes calldata riskSignature)
        external nonReentrant
    {
        Earnings storage item = earnings[offer.earningsId];
        if (msg.sender != item.worker) revert Unauthorized();
        if (paused || !allowedAsset[offer.asset] || !allowedFunder[offer.funder] || !item.approved ||
            offer.expiresAt <= block.timestamp || item.payAt <= block.timestamp ||
            offer.payAt != item.payAt || offer.expiresAt > offer.payAt) revert Unavailable();
        if (offer.funder == item.worker || offer.funder == item.employer || offer.tokenAmount == 0) revert InvalidInput();
        uint256 fee = feeFor(offer.principal, offer.feeBps);
        uint256 repayment = offer.principal + fee;
        bytes32 id = offerHash(offer);
        if (usedOffers[id] || item.available < repayment || inventory[offer.funder][offer.asset] < offer.tokenAmount) revert Unavailable();
        if (risk.offerHash != id || risk.policyVersion != policyVersion || risk.observedAt > block.timestamp ||
            risk.validUntil <= block.timestamp || risk.validUntil < risk.observedAt ||
            risk.validUntil - risk.observedAt > maxRiskAge || block.timestamp - risk.observedAt > maxRiskAge) revert StaleRiskApproval();
        if (!SignatureChecker.isValidSignatureNow(offer.funder, id, funderSignature) ||
            !SignatureChecker.isValidSignatureNow(riskSigner, riskHash(risk), riskSignature)) revert InvalidSignature();
        usedOffers[id] = true;
        item.available -= repayment;
        inventory[offer.funder][offer.asset] -= offer.tokenAmount;
        claims[id] = Claim(offer.funder, item.worker, offer.earningsId, repayment, item.payAt, false);
        _pushExact(IERC20(offer.asset), item.worker, offer.tokenAmount);
        emit StockDelivered(id, offer.earningsId, offer.funder, item.worker, offer.asset, offer.tokenAmount, offer.principal, fee, item.payAt);
    }
    /// Callable by anyone, including when paused; never redirects the recipient.
    function settle(bytes32 id) external nonReentrant {
        Claim storage claim = claims[id];
        if (claim.funder == address(0) || claim.settled) revert Unavailable();
        if (block.timestamp < claim.payAt) revert NotDue();
        claim.settled = true;
        totalUsdcLiability -= claim.repayment;
        _pushExact(usdc, claim.funder, claim.repayment);
        emit FunderRepaid(id, claim.funder, claim.repayment);
    }
    function releaseEarnings(bytes32 id) external nonReentrant {
        Earnings storage item = earnings[id];
        if (!item.approved || item.available == 0) revert Unavailable();
        if (block.timestamp < item.payAt) revert NotDue();
        uint256 amount = item.available;
        item.available = 0;
        totalUsdcLiability -= amount;
        _pushExact(usdc, item.worker, amount);
        emit EarningsPaid(id, item.worker, amount);
    }

    function _pullExact(IERC20 token, address from, uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) != beforeBalance + amount) revert TransferMismatch();
    }
    function _pushExact(IERC20 token, address to, uint256 amount) private {
        uint256 beforeBalance = token.balanceOf(address(this));
        uint256 recipientBalance = token.balanceOf(to);
        token.safeTransfer(to, amount);
        if (token.balanceOf(address(this)) + amount != beforeBalance || token.balanceOf(to) != recipientBalance + amount) revert TransferMismatch();
    }
}
