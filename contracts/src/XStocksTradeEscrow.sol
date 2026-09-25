// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
/// @notice Undeployed review candidate. One physical-goods escrow; arbitration is a disclosed trust dependency.
/// @dev No silent timeout payout during disputes. Arbiter unavailability can lock disputed funds.
interface IStockShares {
    function sharesOf(address) external view returns (uint256);
    function getSharesByUnderlyingAmount(uint256) external view returns (uint256);
    function transferShares(address,uint256) external returns (bool);
}
/// @dev V2 candidate: accepted nominal amount determines shares at funding; settlement distributes those shares.
contract XStocksTradeEscrow is ReentrancyGuard {
    uint256 public fundedShares;
    event SharesFunded(uint256 shares);
    event SharesSettled(uint256 buyerShares,uint256 sellerShares);
    error ShareTransferMismatch();
    using SafeERC20 for IERC20;
    enum State {
        Offered, Accepted, Funded, Dispatched, Inspecting, Disputed, Completed, Refunded, Resolved, Cancelled
    }
    struct Terms {
        bytes32 offerId;
        bytes32 termsHash;
        address buyer;
        address seller;
        address arbiter;
        address token;
        uint256 amount;
        uint64 fundBy;
        uint32 dispatchWindow;
        uint32 deliveryWindow;
        uint32 inspectionWindow;
    }
    IERC20 public immutable token;
    address public immutable buyer;
    address public immutable seller;
    address public immutable arbiter;
    bytes32 public immutable offerId;
    bytes32 public immutable termsHash;
    uint256 public immutable amount;
    uint64 public immutable fundBy;
    uint32 public immutable dispatchWindow;
    uint32 public immutable deliveryWindow;
    uint32 public immutable inspectionWindow;
    State public state;
    uint256 public dispatchBy;
    uint256 public deliveryBy;
    uint256 public inspectUntil;
    bytes32 public dispatchEvidence;
    bytes32 public disputeEvidence;
    uint256 public settlementNonce;
    uint256 public proposedBuyerAmount;
    address public settlementProposer;
    bytes32 public settlementEvidence;
    event SettlementProposed(uint256 indexed nonce,address indexed proposer,uint256 buyerAmount,bytes32 evidence);
    event SettlementWithdrawn(uint256 indexed nonce);
    event MutualSettlementAccepted(uint256 indexed nonce,address indexed accepter);
    error InvalidTerms();
    error Unauthorized();
    error InvalidState();
    error Deadline();
    error InvalidEvidence();
    error IncorrectFunding();
    event TermsAccepted(bytes32 indexed offerId, bytes32 termsHash);
    event Funded(bytes32 indexed offerId,uint256 amount,uint256 dispatchBy);
    event Dispatched(bytes32 indexed offerId,bytes32 evidence,uint256 deliveryBy);
    event ReceiptConfirmed(bytes32 indexed offerId,uint256 inspectUntil);
    event Disputed(bytes32 indexed offerId,address indexed actor,bytes32 evidence);
    // Amounts here are original-term allocation weights, not rebased token receipts.
    event ShareSettlementAllocation(bytes32 indexed offerId,uint256 buyerOriginalAmount,uint256 sellerOriginalAmount,bytes32 evidence,State state);
    event Cancelled(bytes32 indexed offerId);
    modifier onlyBuyer() {
        if (msg.sender!=buyer) revert Unauthorized();
        _;
    }
    modifier onlySeller() {
        if (msg.sender!=seller) revert Unauthorized();
        _;
    }
    constructor(Terms memory t) {
        if (t.buyer==address(0)||t.seller==address(0)||t.arbiter==address(0)||t.token.code.length==0||t.buyer==t.seller||t.arbiter==t.buyer||t.arbiter==t.seller||t.token==t.buyer||t.token==t.seller||t.token==t.arbiter||t.amount==0||t.offerId==bytes32(0)||t.termsHash==bytes32(0)) revert InvalidTerms();
        if (t.fundBy<=block.timestamp||t.fundBy>block.timestamp+7 days||t.dispatchWindow<1 days||t.dispatchWindow>30 days||t.deliveryWindow<1 days||t.deliveryWindow>60 days||(t.inspectionWindow!=1 days&&t.inspectionWindow!=2 days&&t.inspectionWindow!=3 days)) revert InvalidTerms();
        buyer=t.buyer;
        seller=t.seller;
        arbiter=t.arbiter;
        token=IERC20(t.token);
        amount=t.amount;
        offerId=t.offerId;
        termsHash=t.termsHash;
        fundBy=t.fundBy;
        dispatchWindow=t.dispatchWindow;
        deliveryWindow=t.deliveryWindow;
        inspectionWindow=t.inspectionWindow;
    }
    function acceptTerms(bytes32 expectedTermsHash) external onlySeller {
        if (state!=State.Offered) revert InvalidState();
        if (block.timestamp>=fundBy) revert Deadline();
        if (expectedTermsHash!=termsHash) revert InvalidTerms();
        state=State.Accepted;
        emit TermsAccepted(offerId,termsHash);
    }
    function cancelUnfunded() external {
        if (msg.sender!=buyer&&msg.sender!=seller) revert Unauthorized();
        if (state!=State.Offered&&state!=State.Accepted) revert InvalidState();
        state=State.Cancelled;
        emit Cancelled(offerId);
    }
    function fund(bytes32 expectedTermsHash) external onlyBuyer nonReentrant {
        if (state!=State.Accepted) revert InvalidState();
        if (block.timestamp>=fundBy) revert Deadline();
        if (expectedTermsHash!=termsHash) revert InvalidTerms();
        state=State.Funded;
        dispatchBy=block.timestamp+dispatchWindow;
        IStockShares stock=IStockShares(address(token));
        uint256 expected=stock.getSharesByUnderlyingAmount(amount);
        if (expected==0) revert IncorrectFunding();
        uint256 beforeShares=stock.sharesOf(address(this));
        token.safeTransferFrom(msg.sender,address(this),amount);
        if (stock.sharesOf(address(this))-beforeShares!=expected) revert IncorrectFunding();
        fundedShares=expected;
        emit SharesFunded(expected);
        emit Funded(offerId,amount,dispatchBy);
    }
    /// @dev For pickup this records the handover appointment, never proof of receipt.
    function markDispatched(bytes32 evidence) external onlySeller {
        if (state!=State.Funded) revert InvalidState();
        if (block.timestamp>=dispatchBy) revert Deadline();
        if (evidence==bytes32(0)) revert InvalidEvidence();
        state=State.Dispatched;
        dispatchEvidence=evidence;
        deliveryBy=block.timestamp+deliveryWindow;
        emit Dispatched(offerId,evidence,deliveryBy);
    }
    function confirmReceipt() external onlyBuyer {
        if (state!=State.Dispatched) revert InvalidState();
        state=State.Inspecting;
        inspectUntil=block.timestamp+inspectionWindow;
        emit ReceiptConfirmed(offerId,inspectUntil);
    }
    function approveRelease() external onlyBuyer nonReentrant {
        if (state!=State.Dispatched&&state!=State.Inspecting) revert InvalidState();
        _settle(0,State.Completed,bytes32(0));
    }
    /// @notice Only a buyer-acknowledged receipt can start the automatic release clock.
    function releaseAfterInspection() external nonReentrant {
        if (state!=State.Inspecting) revert InvalidState();
        if (block.timestamp<inspectUntil) revert Deadline();
        _settle(0,State.Completed,bytes32(0));
    }
    function refundUndispatched() external onlyBuyer nonReentrant {
        if (state!=State.Funded) revert InvalidState();
        if (block.timestamp<dispatchBy) revert Deadline();
        _settle(amount,State.Refunded,bytes32(0));
    }
    function refundBySeller(bytes32 evidence) external onlySeller nonReentrant {
        if (state!=State.Funded&&state!=State.Dispatched&&state!=State.Inspecting&&state!=State.Disputed) revert InvalidState();
        if (evidence==bytes32(0)) revert InvalidEvidence();
        _settle(amount,State.Refunded,evidence);
    }
    function openDispute(bytes32 evidence) external {
        if (msg.sender!=buyer&&msg.sender!=seller) revert Unauthorized();
        if (evidence==bytes32(0)) revert InvalidEvidence();
        if (msg.sender==buyer) {
            if (state!=State.Dispatched&&state!=State.Inspecting) revert InvalidState();
            if (state==State.Inspecting&&block.timestamp>=inspectUntil) revert Deadline();
        }
        else {
            if (state!=State.Dispatched) revert InvalidState();
            if (block.timestamp<deliveryBy) revert Deadline();
        }
        state=State.Disputed;
        disputeEvidence=evidence;
        emit Disputed(offerId,msg.sender,evidence);
    }
    /// @notice An agreed resolution does not depend on arbitrator availability.
    function proposeSettlement(uint256 buyerAmount,bytes32 evidence) external {
        if (msg.sender!=buyer && msg.sender!=seller) revert Unauthorized();
        if (state!=State.Disputed) revert InvalidState();
        if (buyerAmount>amount) revert InvalidTerms();
        if (evidence==bytes32(0)) revert InvalidEvidence();
        settlementNonce++;
        settlementProposer=msg.sender;
        proposedBuyerAmount=buyerAmount;
        settlementEvidence=evidence;
        emit SettlementProposed(settlementNonce,msg.sender,buyerAmount,evidence);
    }
    function withdrawSettlement(uint256 expectedNonce) external {
        if (msg.sender!=settlementProposer) revert Unauthorized();
        if (state!=State.Disputed) revert InvalidState();
        if (expectedNonce!=settlementNonce) revert InvalidTerms();
        settlementProposer=address(0);
        emit SettlementWithdrawn(expectedNonce);
    }
    function acceptSettlement(uint256 expectedNonce,uint256 expectedBuyerAmount,bytes32 expectedEvidence) external nonReentrant {
        if ((msg.sender!=buyer && msg.sender!=seller) || msg.sender==settlementProposer) revert Unauthorized();
        if (state!=State.Disputed || settlementProposer==address(0)) revert InvalidState();
        if (expectedNonce!=settlementNonce || expectedBuyerAmount!=proposedBuyerAmount || expectedEvidence!=settlementEvidence) revert InvalidTerms();
        emit MutualSettlementAccepted(expectedNonce,msg.sender);
        _settle(proposedBuyerAmount,State.Resolved,settlementEvidence);
    }
    function resolveDispute(uint256 buyerAmount,bytes32 evidence) external nonReentrant {
        if (msg.sender!=arbiter) revert Unauthorized();
        if (state!=State.Disputed) revert InvalidState();
        if (buyerAmount>amount) revert InvalidTerms();
        if (evidence==bytes32(0)) revert InvalidEvidence();
        _settle(buyerAmount,State.Resolved,evidence);
    }
    function _settle(uint256 buyerAmount,State terminal,bytes32 evidence) private {
        state=terminal;
        uint256 buyerShares=Math.mulDiv(fundedShares,buyerAmount,amount);
        uint256 sellerShares=fundedShares-buyerShares;
        if (buyerShares>0) _sendShares(buyer,buyerShares);
        if (sellerShares>0) _sendShares(seller,sellerShares);
        emit SharesSettled(buyerShares,sellerShares);
        emit ShareSettlementAllocation(offerId,buyerAmount,amount-buyerAmount,evidence,terminal);
    }
    /// @dev Donations never activate an agreement or increase a payout.
    function recoverExcess() external onlyBuyer nonReentrant {
        uint256 obligation=(state==State.Funded||state==State.Dispatched||state==State.Inspecting||state==State.Disputed)?fundedShares:0;
        uint256 balance=IStockShares(address(token)).sharesOf(address(this));
        if (balance>obligation) _sendShares(buyer,balance-obligation);
    }
    function _sendShares(address to,uint256 quantity) private {
        IStockShares stock=IStockShares(address(token));
        uint256 held=stock.sharesOf(address(this));
        uint256 received=stock.sharesOf(to);
        if (!stock.transferShares(to,quantity)) revert ShareTransferMismatch();
        if (stock.sharesOf(address(this))!=held-quantity || stock.sharesOf(to)!=received+quantity) revert ShareTransferMismatch();
    }

}
