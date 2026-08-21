// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Pausable} from '@openzeppelin/contracts/utils/Pausable.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

contract UpfrontAdvanceEscrow is EIP712, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint16 public constant MIN_ADVANCE_BPS = 1_000;
    uint16 public constant MAX_ADVANCE_BPS = 8_000;
    uint48 public constant MAX_PROTECTION_WINDOW = 30 days;
    uint48 public constant MAX_ATTESTATION_AGE = 1 days;

    bytes32 public constant UNDERWRITING_OFFER_TYPEHASH = keccak256(
        'UnderwritingOffer(address provider,bytes32 termsHash,bytes32 intelligenceCommitment,uint256 protectedAmount,uint16 maxAdvanceBps,uint48 protectionDeadline,uint48 underwritingDeadline,bytes32 nonce)'
    );
    bytes32 public constant PROTECTION_ATTESTATION_TYPEHASH = keccak256(
        'ProtectionAttestation(bytes32 positionId,bytes32 arcAgreementHash,bytes32 arcTermsHash,bytes32 termsHash,address arcRecipient,address funder,address repaymentRecipient,address provider,uint256 protectedAmount,uint256 advanceAmount,uint48 observedAt,uint48 deadline)'
    );

    enum Status {
        None,
        Funded,
        Released,
        Refunded
    }

    struct UnderwritingOffer {
        address provider;
        bytes32 termsHash;
        bytes32 intelligenceCommitment;
        uint256 protectedAmount;
        uint16 maxAdvanceBps;
        uint48 protectionDeadline;
        uint48 underwritingDeadline;
        bytes32 nonce;
    }

    struct ProtectionAttestation {
        bytes32 positionId;
        bytes32 arcAgreementHash;
        bytes32 arcTermsHash;
        bytes32 termsHash;
        address arcRecipient;
        address funder;
        address repaymentRecipient;
        address provider;
        uint256 protectedAmount;
        uint256 advanceAmount;
        uint48 observedAt;
        uint48 deadline;
    }

    struct Position {
        address funder;
        address repaymentRecipient;
        address provider;
        address protectionSigner;
        bytes32 termsHash;
        bytes32 intelligenceCommitment;
        bytes32 arcAgreementHash;
        uint256 protectedAmount;
        uint256 advanceAmount;
        uint48 protectionDeadline;
        Status status;
    }

    IERC20 public immutable asset;
    address public immutable arcRepaymentRouter;
    address public underwritingSigner;
    address public protectionSigner;
    uint256 public immutable maxAdvanceAmount;
    uint256 public immutable maxTotalFunded;
    uint256 public totalFunded;

    mapping(bytes32 positionId => Position) public positions;
    mapping(address funder => bool) public allowedFunders;

    error InvalidAddress();
    error InvalidAmount();
    error InvalidAdvanceRate();
    error InvalidDeadline();
    error InvalidSignature();
    error OfferAlreadyUsed();
    error PositionNotFunded();
    error NotFunder();
    error ProtectionMismatch();
    error ProtectionNotExpired();
    error UnsupportedTransferFee();
    error FunderNotAllowed();
    error FundingCapExceeded();

    event UnderwritingSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event ProtectionSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event FunderPermissionUpdated(address indexed funder, bool allowed);
    event AdvanceFunded(
        bytes32 indexed positionId,
        address indexed funder,
        address indexed provider,
        address repaymentRecipient,
        uint256 protectedAmount,
        uint256 advanceAmount,
        bytes32 termsHash,
        bytes32 intelligenceCommitment,
        uint48 protectionDeadline
    );
    event AdvanceReleased(bytes32 indexed positionId, bytes32 indexed arcAgreementHash, address indexed provider, uint256 advanceAmount);
    event AdvanceRefunded(bytes32 indexed positionId, address indexed funder, uint256 advanceAmount);

    constructor(
        IERC20 asset_,
        address arcRepaymentRouter_,
        address underwritingSigner_,
        address protectionSigner_,
        address initialOwner,
        uint256 maxAdvanceAmount_,
        uint256 maxTotalFunded_
    ) EIP712('HashPayStream Upfront', '1') Ownable(initialOwner) {
        if (
            address(asset_) == address(0)
                || arcRepaymentRouter_ == address(0)
                || underwritingSigner_ == address(0)
                || protectionSigner_ == address(0)
                || initialOwner == address(0)
        ) revert InvalidAddress();
        if (maxAdvanceAmount_ == 0 || maxTotalFunded_ < maxAdvanceAmount_) revert InvalidAmount();
        asset = asset_;
        arcRepaymentRouter = arcRepaymentRouter_;
        underwritingSigner = underwritingSigner_;
        protectionSigner = protectionSigner_;
        maxAdvanceAmount = maxAdvanceAmount_;
        maxTotalFunded = maxTotalFunded_;
        _pause();
    }

    function setUnderwritingSigner(address nextSigner) external onlyOwner {
        if (nextSigner == address(0)) revert InvalidAddress();
        emit UnderwritingSignerUpdated(underwritingSigner, nextSigner);
        underwritingSigner = nextSigner;
    }

    function setProtectionSigner(address nextSigner) external onlyOwner {
        if (nextSigner == address(0)) revert InvalidAddress();
        emit ProtectionSignerUpdated(protectionSigner, nextSigner);
        protectionSigner = nextSigner;
    }

    function setFunderAllowed(address funder, bool allowed) external onlyOwner {
        if (funder == address(0)) revert InvalidAddress();
        allowedFunders[funder] = allowed;
        emit FunderPermissionUpdated(funder, allowed);
    }

    function setPaused(bool shouldPause) external onlyOwner {
        if (shouldPause) _pause();
        else _unpause();
    }

    function hashUnderwritingOffer(UnderwritingOffer calldata offer) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            UNDERWRITING_OFFER_TYPEHASH,
            offer.provider,
            offer.termsHash,
            offer.intelligenceCommitment,
            offer.protectedAmount,
            offer.maxAdvanceBps,
            offer.protectionDeadline,
            offer.underwritingDeadline,
            offer.nonce
        )));
    }

    function hashProtectionAttestation(ProtectionAttestation calldata attestation) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            PROTECTION_ATTESTATION_TYPEHASH,
            attestation.positionId,
            attestation.arcAgreementHash,
            attestation.arcTermsHash,
            attestation.termsHash,
            attestation.arcRecipient,
            attestation.funder,
            attestation.repaymentRecipient,
            attestation.provider,
            attestation.protectedAmount,
            attestation.advanceAmount,
            attestation.observedAt,
            attestation.deadline
        )));
    }

    function fundAdvance(
        UnderwritingOffer calldata offer,
        uint256 advanceAmount,
        address repaymentRecipient,
        bytes calldata underwritingSignature
    ) external whenNotPaused nonReentrant returns (bytes32 positionId) {
        if (!allowedFunders[msg.sender]) revert FunderNotAllowed();
        if (offer.provider == address(0) || repaymentRecipient == address(0)) revert InvalidAddress();
        if (offer.termsHash == bytes32(0) || offer.intelligenceCommitment == bytes32(0)) revert ProtectionMismatch();
        if (offer.protectedAmount == 0 || advanceAmount == 0) revert InvalidAmount();
        if (offer.maxAdvanceBps < MIN_ADVANCE_BPS || offer.maxAdvanceBps > MAX_ADVANCE_BPS) revert InvalidAdvanceRate();
        if (
            block.timestamp > offer.underwritingDeadline
                || offer.protectionDeadline <= offer.underwritingDeadline
                || offer.protectionDeadline > block.timestamp + MAX_PROTECTION_WINDOW
        ) revert InvalidDeadline();
        if (advanceAmount > offer.protectedAmount * offer.maxAdvanceBps / BPS_DENOMINATOR) revert InvalidAmount();
        if (advanceAmount > maxAdvanceAmount || totalFunded + advanceAmount > maxTotalFunded) revert FundingCapExceeded();

        positionId = hashUnderwritingOffer(offer);
        if (positions[positionId].status != Status.None) revert OfferAlreadyUsed();
        if (ECDSA.recover(positionId, underwritingSignature) != underwritingSigner) revert InvalidSignature();

        positions[positionId] = Position({
            funder: msg.sender,
            repaymentRecipient: repaymentRecipient,
            provider: offer.provider,
            protectionSigner: protectionSigner,
            termsHash: offer.termsHash,
            intelligenceCommitment: offer.intelligenceCommitment,
            arcAgreementHash: bytes32(0),
            protectedAmount: offer.protectedAmount,
            advanceAmount: advanceAmount,
            protectionDeadline: offer.protectionDeadline,
            status: Status.Funded
        });
        totalFunded += advanceAmount;

        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), advanceAmount);
        if (asset.balanceOf(address(this)) - balanceBefore != advanceAmount) revert UnsupportedTransferFee();

        emit AdvanceFunded(
            positionId,
            msg.sender,
            offer.provider,
            repaymentRecipient,
            offer.protectedAmount,
            advanceAmount,
            offer.termsHash,
            offer.intelligenceCommitment,
            offer.protectionDeadline
        );
    }

    function releaseAdvance(
        ProtectionAttestation calldata attestation,
        bytes calldata protectionSignature
    ) external whenNotPaused nonReentrant {
        Position storage position = positions[attestation.positionId];
        if (position.status != Status.Funded) revert PositionNotFunded();
        if (
            attestation.arcAgreementHash == bytes32(0)
                || attestation.arcTermsHash == bytes32(0)
                || attestation.termsHash != position.termsHash
                || attestation.arcRecipient != arcRepaymentRouter
                || attestation.funder != position.funder
                || attestation.repaymentRecipient != position.repaymentRecipient
                || attestation.provider != position.provider
                || attestation.protectedAmount != position.protectedAmount
                || attestation.advanceAmount != position.advanceAmount
                || attestation.observedAt > block.timestamp
                || block.timestamp > attestation.deadline
                || block.timestamp > attestation.observedAt + MAX_ATTESTATION_AGE
                || block.timestamp > position.protectionDeadline
        ) revert ProtectionMismatch();
        if (ECDSA.recover(hashProtectionAttestation(attestation), protectionSignature) != position.protectionSigner) {
            revert InvalidSignature();
        }

        position.status = Status.Released;
        position.arcAgreementHash = attestation.arcAgreementHash;
        asset.safeTransfer(position.provider, position.advanceAmount);
        emit AdvanceReleased(attestation.positionId, attestation.arcAgreementHash, position.provider, position.advanceAmount);
    }

    function refundAdvance(bytes32 positionId) external nonReentrant {
        Position storage position = positions[positionId];
        if (position.status != Status.Funded) revert PositionNotFunded();
        if (msg.sender != position.funder) revert NotFunder();
        if (block.timestamp <= position.protectionDeadline) revert ProtectionNotExpired();

        position.status = Status.Refunded;
        asset.safeTransfer(position.funder, position.advanceAmount);
        emit AdvanceRefunded(positionId, position.funder, position.advanceAmount);
    }
}
