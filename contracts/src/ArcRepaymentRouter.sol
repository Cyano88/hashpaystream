// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

contract ArcRepaymentRouter is EIP712, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint48 public constant MAX_ATTESTATION_AGE = 1 days;
    bytes32 public constant SPLIT_SETTLEMENT_TYPEHASH = keccak256(
        'SplitSettlement(bytes32 arcAgreementHash,bytes32 arcTermsHash,address funder,address provider,address treasury,uint256 funderAmount,uint256 providerAmount,uint256 treasuryAmount,uint48 observedAt,uint48 deadline)'
    );

    struct SplitSettlement {
        bytes32 arcAgreementHash;
        bytes32 arcTermsHash;
        address funder;
        address provider;
        address treasury;
        uint256 funderAmount;
        uint256 providerAmount;
        uint256 treasuryAmount;
        uint48 observedAt;
        uint48 deadline;
    }

    IERC20 public immutable asset;
    address public creditSigner;
    mapping(bytes32 arcAgreementHash => bool) public settledAgreements;

    error InvalidAddress();
    error InvalidCredit();
    error InvalidSignature();
    error AgreementAlreadyCredited();
    error InsufficientRepaymentBalance();

    event CreditSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event RepaymentSettled(
        bytes32 indexed arcAgreementHash,
        bytes32 indexed arcTermsHash,
        address indexed funder,
        address provider,
        address treasury,
        uint256 funderAmount,
        uint256 providerAmount,
        uint256 treasuryAmount
    );

    constructor(IERC20 asset_, address creditSigner_, address initialOwner)
        EIP712('HashPayStream Upfront Repayment', '3') Ownable(initialOwner)
    {
        if (address(asset_) == address(0) || creditSigner_ == address(0) || initialOwner == address(0)) revert InvalidAddress();
        asset = asset_;
        creditSigner = creditSigner_;
    }

    function setCreditSigner(address nextSigner) external onlyOwner {
        if (nextSigner == address(0)) revert InvalidAddress();
        emit CreditSignerUpdated(creditSigner, nextSigner);
        creditSigner = nextSigner;
    }

    function hashSplitSettlement(SplitSettlement calldata settlement) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            SPLIT_SETTLEMENT_TYPEHASH,
            settlement.arcAgreementHash,
            settlement.arcTermsHash,
            settlement.funder,
            settlement.provider,
            settlement.treasury,
            settlement.funderAmount,
            settlement.providerAmount,
            settlement.treasuryAmount,
            settlement.observedAt,
            settlement.deadline
        )));
    }

    function settleRepayment(SplitSettlement calldata settlement, bytes calldata signature) external nonReentrant {
        if (
            settlement.arcAgreementHash == bytes32(0) || settlement.arcTermsHash == bytes32(0)
                || settlement.funder == address(0) || settlement.provider == address(0)
                || settlement.treasury == address(0) || settlement.funder == settlement.provider
                || settlement.funder == settlement.treasury || settlement.provider == settlement.treasury
                || settlement.funderAmount == 0 || settlement.providerAmount == 0 || settlement.treasuryAmount == 0
                || settlement.observedAt > block.timestamp || block.timestamp > settlement.deadline
                || block.timestamp > settlement.observedAt + MAX_ATTESTATION_AGE
        ) revert InvalidCredit();
        if (settledAgreements[settlement.arcAgreementHash]) revert AgreementAlreadyCredited();
        if (ECDSA.recover(hashSplitSettlement(settlement), signature) != creditSigner) revert InvalidSignature();
        uint256 total = settlement.funderAmount + settlement.providerAmount + settlement.treasuryAmount;
        if (asset.balanceOf(address(this)) < total) revert InsufficientRepaymentBalance();

        settledAgreements[settlement.arcAgreementHash] = true;
        asset.safeTransfer(settlement.funder, settlement.funderAmount);
        asset.safeTransfer(settlement.provider, settlement.providerAmount);
        asset.safeTransfer(settlement.treasury, settlement.treasuryAmount);
        emit RepaymentSettled(
            settlement.arcAgreementHash,
            settlement.arcTermsHash,
            settlement.funder,
            settlement.provider,
            settlement.treasury,
            settlement.funderAmount,
            settlement.providerAmount,
            settlement.treasuryAmount
        );
    }
}
