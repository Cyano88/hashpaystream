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
    bytes32 public constant REPAYMENT_CREDIT_TYPEHASH = keccak256(
        'RepaymentCredit(bytes32 arcAgreementHash,bytes32 arcTermsHash,address funder,uint256 amount,uint48 observedAt,uint48 deadline)'
    );

    struct RepaymentCredit {
        bytes32 arcAgreementHash;
        bytes32 arcTermsHash;
        address funder;
        uint256 amount;
        uint48 observedAt;
        uint48 deadline;
    }

    IERC20 public immutable asset;
    address public creditSigner;
    uint256 public totalClaimable;
    mapping(bytes32 arcAgreementHash => bool) public creditedAgreements;
    mapping(address funder => uint256) public claimable;

    error InvalidAddress();
    error InvalidCredit();
    error InvalidSignature();
    error AgreementAlreadyCredited();
    error InsufficientRepaymentBalance();
    error NothingToClaim();

    event CreditSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event RepaymentCredited(bytes32 indexed arcAgreementHash, bytes32 indexed arcTermsHash, address indexed funder, uint256 amount);
    event RepaymentClaimed(address indexed funder, uint256 amount);

    constructor(IERC20 asset_, address creditSigner_, address initialOwner)
        EIP712('HashPayStream Upfront Repayment', '1') Ownable(initialOwner)
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

    function hashRepaymentCredit(RepaymentCredit calldata credit) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            REPAYMENT_CREDIT_TYPEHASH,
            credit.arcAgreementHash,
            credit.arcTermsHash,
            credit.funder,
            credit.amount,
            credit.observedAt,
            credit.deadline
        )));
    }

    function creditRepayment(RepaymentCredit calldata credit, bytes calldata signature) external nonReentrant {
        if (
            credit.arcAgreementHash == bytes32(0) || credit.arcTermsHash == bytes32(0)
                || credit.funder == address(0) || credit.amount == 0
                || credit.observedAt > block.timestamp || block.timestamp > credit.deadline
                || block.timestamp > credit.observedAt + MAX_ATTESTATION_AGE
        ) revert InvalidCredit();
        if (creditedAgreements[credit.arcAgreementHash]) revert AgreementAlreadyCredited();
        if (ECDSA.recover(hashRepaymentCredit(credit), signature) != creditSigner) revert InvalidSignature();
        if (asset.balanceOf(address(this)) < totalClaimable + credit.amount) revert InsufficientRepaymentBalance();

        creditedAgreements[credit.arcAgreementHash] = true;
        totalClaimable += credit.amount;
        claimable[credit.funder] += credit.amount;
        emit RepaymentCredited(credit.arcAgreementHash, credit.arcTermsHash, credit.funder, credit.amount);
    }

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        totalClaimable -= amount;
        asset.safeTransfer(msg.sender, amount);
        emit RepaymentClaimed(msg.sender, amount);
    }
}
