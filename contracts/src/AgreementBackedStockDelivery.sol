// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import {SignatureChecker} from '@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol';
import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Pausable} from '@openzeppelin/contracts/utils/Pausable.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/// @notice Records an agreement-backed stock advance while transferring the
/// approved stock token directly from the funder to the worker. This contract
/// never holds stock inventory.
contract AgreementBackedStockDelivery is EIP712, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MIN_ADVANCE_BPS = 1_000;
    uint16 public constant MAX_ADVANCE_BPS = 8_000;
    uint16 public constant MAX_FUNDER_FEE_BPS = 300;
    uint48 public constant MAX_PROTECTION_WINDOW = 30 days;
    uint48 public constant MAX_AUTHORIZATION_AGE = 5 minutes;
    string public constant DELIVERY_VERSION = '1';

    bytes32 public constant UNDERWRITING_OFFER_TYPEHASH = keccak256('UnderwritingOffer(address worker,bytes32 agreementTermsHash,bytes32 intelligenceCommitment,uint256 protectedAmount,uint16 maxAdvanceBps,uint48 protectionDeadline,uint48 underwritingDeadline,bytes32 nonce)');
    bytes32 public constant DELIVERY_TERMS_TYPEHASH = keccak256('DeliveryTerms(bytes32 offerHash,address funder,address repaymentRecipient,address workerArcRecipient,address platformTreasury,address stockAsset,uint256 stockTokenAmount,uint256 advanceUsdcAmount,uint256 funderRepaymentAmount,uint256 platformFeeAmount,uint48 marketObservedAt,uint48 deadline,bytes32 nonce)');
    bytes32 public constant PROTECTION_ATTESTATION_TYPEHASH = keccak256('ProtectionAttestation(bytes32 deliveryId,bytes32 arcAgreementHash,bytes32 arcTermsHash,bytes32 agreementTermsHash,bytes32 deliveryTermsHash,address arcRecipient,address funder,address repaymentRecipient,address worker,uint256 protectedAmount,uint256 advanceUsdcAmount,uint48 observedAt,uint48 deadline)');

    struct UnderwritingOffer {
        address worker; bytes32 agreementTermsHash; bytes32 intelligenceCommitment;
        uint256 protectedAmount; uint16 maxAdvanceBps; uint48 protectionDeadline;
        uint48 underwritingDeadline; bytes32 nonce;
    }

    struct DeliveryTerms {
        bytes32 offerHash; address funder; address repaymentRecipient; address workerArcRecipient;
        address platformTreasury; address stockAsset; uint256 stockTokenAmount;
        uint256 advanceUsdcAmount; uint256 funderRepaymentAmount; uint256 platformFeeAmount;
        uint48 marketObservedAt; uint48 deadline; bytes32 nonce;
    }

    struct ProtectionAttestation {
        bytes32 deliveryId; bytes32 arcAgreementHash; bytes32 arcTermsHash;
        bytes32 agreementTermsHash; bytes32 deliveryTermsHash; address arcRecipient;
        address funder; address repaymentRecipient; address worker; uint256 protectedAmount;
        uint256 advanceUsdcAmount; uint48 observedAt; uint48 deadline;
    }

    struct DeliveryRecord {
        bytes32 arcAgreementHash; bytes32 agreementTermsHash; bytes32 deliveryTermsHash;
        bytes32 intelligenceCommitment; address funder; address repaymentRecipient;
        address worker; address workerArcRecipient; address platformTreasury; address stockAsset;
        uint256 protectedAmount; uint256 stockTokenAmount; uint256 advanceUsdcAmount;
        uint256 funderRepaymentAmount; uint256 platformFeeAmount; uint48 deliveredAt;
    }

    address public immutable arcRepaymentRouter;
    address public underwritingSigner;
    address public riskSigner;
    address public protectionSigner;
    mapping(bytes32 deliveryId => DeliveryRecord) public deliveries;
    mapping(address funder => bool) public allowedFunders;
    mapping(address token => bool) public allowedStockAssets;
    mapping(bytes32 arcAgreementHash => bool) public usedArcAgreements;

    error InvalidAddress(); error InvalidAmount(); error InvalidAdvanceRate();
    error InvalidDeadline(); error InvalidSignature(); error DeliveryAlreadyUsed();
    error ProtectionMismatch(); error UnsupportedTransferFee(); error FunderNotAllowed();
    error StockAssetNotAllowed(); error ArcAgreementAlreadyUsed();

    event UnderwritingSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event RiskSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event ProtectionSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event FunderPermissionUpdated(address indexed funder, bool allowed);
    event StockAssetPermissionUpdated(address indexed token, bool allowed);
    event StockDelivered(bytes32 indexed deliveryId, bytes32 indexed arcAgreementHash, address indexed worker, address funder, address repaymentRecipient, address workerArcRecipient, address platformTreasury, address stockAsset, uint256 stockTokenAmount, uint256 protectedAmount, uint256 advanceUsdcAmount, uint256 funderRepaymentAmount, uint256 platformFeeAmount, bytes32 agreementTermsHash, bytes32 intelligenceCommitment);

    constructor(address arcRepaymentRouter_, address underwritingSigner_, address riskSigner_, address protectionSigner_, address initialOwner)
        EIP712('HashPayStream Stock Delivery', '1') Ownable(initialOwner)
    {
        if (arcRepaymentRouter_ == address(0) || underwritingSigner_ == address(0) || riskSigner_ == address(0) || protectionSigner_ == address(0) || initialOwner == address(0) || underwritingSigner_ == riskSigner_ || underwritingSigner_ == protectionSigner_ || riskSigner_ == protectionSigner_) revert InvalidAddress();
        arcRepaymentRouter = arcRepaymentRouter_; underwritingSigner = underwritingSigner_; riskSigner = riskSigner_; protectionSigner = protectionSigner_; _pause();
    }

    function setUnderwritingSigner(address nextSigner) external onlyOwner {
        if (nextSigner == address(0) || nextSigner == riskSigner || nextSigner == protectionSigner) revert InvalidAddress();
        emit UnderwritingSignerUpdated(underwritingSigner, nextSigner); underwritingSigner = nextSigner;
    }
    function setRiskSigner(address nextSigner) external onlyOwner {
        if (nextSigner == address(0) || nextSigner == underwritingSigner || nextSigner == protectionSigner) revert InvalidAddress();
        emit RiskSignerUpdated(riskSigner, nextSigner); riskSigner = nextSigner;
    }
    function setProtectionSigner(address nextSigner) external onlyOwner {
        if (nextSigner == address(0) || nextSigner == underwritingSigner || nextSigner == riskSigner) revert InvalidAddress();
        emit ProtectionSignerUpdated(protectionSigner, nextSigner); protectionSigner = nextSigner;
    }
    function setFunderAllowed(address funder, bool allowed) external onlyOwner {
        if (funder == address(0)) revert InvalidAddress();
        allowedFunders[funder] = allowed; emit FunderPermissionUpdated(funder, allowed);
    }
    function setStockAssetAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0) || token.code.length == 0) revert InvalidAddress();
        allowedStockAssets[token] = allowed; emit StockAssetPermissionUpdated(token, allowed);
    }
    function setPaused(bool shouldPause) external onlyOwner { if (shouldPause) _pause(); else _unpause(); }

    function hashUnderwritingOffer(UnderwritingOffer calldata offer) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(UNDERWRITING_OFFER_TYPEHASH, offer.worker, offer.agreementTermsHash, offer.intelligenceCommitment, offer.protectedAmount, offer.maxAdvanceBps, offer.protectionDeadline, offer.underwritingDeadline, offer.nonce)));
    }
    function hashDeliveryTerms(DeliveryTerms calldata terms) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(DELIVERY_TERMS_TYPEHASH, terms.offerHash, terms.funder, terms.repaymentRecipient, terms.workerArcRecipient, terms.platformTreasury, terms.stockAsset, terms.stockTokenAmount, terms.advanceUsdcAmount, terms.funderRepaymentAmount, terms.platformFeeAmount, terms.marketObservedAt, terms.deadline, terms.nonce)));
    }
    function hashProtectionAttestation(ProtectionAttestation calldata attestation) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(PROTECTION_ATTESTATION_TYPEHASH, attestation.deliveryId, attestation.arcAgreementHash, attestation.arcTermsHash, attestation.agreementTermsHash, attestation.deliveryTermsHash, attestation.arcRecipient, attestation.funder, attestation.repaymentRecipient, attestation.worker, attestation.protectedAmount, attestation.advanceUsdcAmount, attestation.observedAt, attestation.deadline)));
    }

    function deliver(UnderwritingOffer calldata offer, DeliveryTerms calldata terms, ProtectionAttestation calldata attestation, bytes calldata underwritingSignature, bytes calldata riskSignature, bytes calldata workerSignature, bytes calldata protectionSignature) external whenNotPaused nonReentrant returns (bytes32 deliveryId) {
        if (!allowedFunders[msg.sender]) revert FunderNotAllowed();
        if (!allowedStockAssets[terms.stockAsset]) revert StockAssetNotAllowed();
        if (offer.worker == address(0) || terms.funder != msg.sender || terms.repaymentRecipient == address(0) || terms.workerArcRecipient == address(0) || terms.platformTreasury == address(0)) revert InvalidAddress();
        if (offer.agreementTermsHash == bytes32(0) || offer.intelligenceCommitment == bytes32(0)) revert ProtectionMismatch();
        if (offer.protectedAmount == 0 || terms.stockTokenAmount == 0 || terms.advanceUsdcAmount == 0 || terms.funderRepaymentAmount < terms.advanceUsdcAmount || terms.platformFeeAmount == 0 || terms.funderRepaymentAmount + terms.platformFeeAmount >= offer.protectedAmount) revert InvalidAmount();
        if (offer.maxAdvanceBps < MIN_ADVANCE_BPS || offer.maxAdvanceBps > MAX_ADVANCE_BPS) revert InvalidAdvanceRate();
        if (terms.advanceUsdcAmount > offer.protectedAmount * offer.maxAdvanceBps / BPS_DENOMINATOR) revert InvalidAmount();
        if (terms.funderRepaymentAmount - terms.advanceUsdcAmount > terms.advanceUsdcAmount * MAX_FUNDER_FEE_BPS / BPS_DENOMINATOR) revert InvalidAmount();
        if (block.timestamp > offer.underwritingDeadline || offer.protectionDeadline <= offer.underwritingDeadline || offer.protectionDeadline > block.timestamp + MAX_PROTECTION_WINDOW || terms.deadline > offer.underwritingDeadline || block.timestamp > terms.deadline || terms.marketObservedAt > block.timestamp || block.timestamp > terms.marketObservedAt + MAX_AUTHORIZATION_AGE) revert InvalidDeadline();
        if (terms.workerArcRecipient == terms.repaymentRecipient || terms.workerArcRecipient == terms.platformTreasury || terms.repaymentRecipient == terms.platformTreasury) revert ProtectionMismatch();

        bytes32 offerHash = hashUnderwritingOffer(offer);
        if (terms.offerHash != offerHash) revert ProtectionMismatch();
        if (!SignatureChecker.isValidSignatureNow(underwritingSigner, offerHash, underwritingSignature)) revert InvalidSignature();
        bytes32 deliveryTermsHash = hashDeliveryTerms(terms);
        if (!SignatureChecker.isValidSignatureNow(riskSigner, deliveryTermsHash, riskSignature)) revert InvalidSignature();
        if (!SignatureChecker.isValidSignatureNow(offer.worker, deliveryTermsHash, workerSignature)) revert InvalidSignature();

        deliveryId = deliveryTermsHash;
        if (deliveries[deliveryId].deliveredAt != 0) revert DeliveryAlreadyUsed();
        if (usedArcAgreements[attestation.arcAgreementHash]) revert ArcAgreementAlreadyUsed();
        if (attestation.deliveryId != deliveryId || attestation.arcAgreementHash == bytes32(0) || attestation.arcTermsHash == bytes32(0) || attestation.agreementTermsHash != offer.agreementTermsHash || attestation.deliveryTermsHash != deliveryTermsHash || attestation.arcRecipient != arcRepaymentRouter || attestation.funder != msg.sender || attestation.repaymentRecipient != terms.repaymentRecipient || attestation.worker != offer.worker || attestation.protectedAmount != offer.protectedAmount || attestation.advanceUsdcAmount != terms.advanceUsdcAmount || attestation.observedAt > block.timestamp || block.timestamp > attestation.deadline || block.timestamp > attestation.observedAt + MAX_AUTHORIZATION_AGE || block.timestamp > offer.protectionDeadline) revert ProtectionMismatch();
        if (!SignatureChecker.isValidSignatureNow(protectionSigner, hashProtectionAttestation(attestation), protectionSignature)) revert InvalidSignature();

        deliveries[deliveryId] = DeliveryRecord({arcAgreementHash: attestation.arcAgreementHash, agreementTermsHash: offer.agreementTermsHash, deliveryTermsHash: deliveryTermsHash, intelligenceCommitment: offer.intelligenceCommitment, funder: msg.sender, repaymentRecipient: terms.repaymentRecipient, worker: offer.worker, workerArcRecipient: terms.workerArcRecipient, platformTreasury: terms.platformTreasury, stockAsset: terms.stockAsset, protectedAmount: offer.protectedAmount, stockTokenAmount: terms.stockTokenAmount, advanceUsdcAmount: terms.advanceUsdcAmount, funderRepaymentAmount: terms.funderRepaymentAmount, platformFeeAmount: terms.platformFeeAmount, deliveredAt: uint48(block.timestamp)});
        usedArcAgreements[attestation.arcAgreementHash] = true;

        IERC20 token = IERC20(terms.stockAsset);
        uint256 contractBalanceBefore = token.balanceOf(address(this));
        uint256 funderBalanceBefore = token.balanceOf(msg.sender);
        uint256 workerBalanceBefore = token.balanceOf(offer.worker);
        token.safeTransferFrom(msg.sender, offer.worker, terms.stockTokenAmount);
        if (token.balanceOf(address(this)) != contractBalanceBefore || funderBalanceBefore - token.balanceOf(msg.sender) != terms.stockTokenAmount || token.balanceOf(offer.worker) - workerBalanceBefore != terms.stockTokenAmount) revert UnsupportedTransferFee();

        emit StockDelivered(deliveryId, attestation.arcAgreementHash, offer.worker, msg.sender, terms.repaymentRecipient, terms.workerArcRecipient, terms.platformTreasury, terms.stockAsset, terms.stockTokenAmount, offer.protectedAmount, terms.advanceUsdcAmount, terms.funderRepaymentAmount, terms.platformFeeAmount, offer.agreementTermsHash, offer.intelligenceCommitment);
    }
}