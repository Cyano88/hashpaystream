// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {TradeEscrow} from "./TradeEscrow.sol";
/// @notice Undeployed review candidate. A factory fixes the settlement token and dispute authority.
contract TradeEscrowFactory {
    address public immutable token;
    address public immutable arbiter;
    mapping(bytes32=>address) public escrows;
    error InvalidConfiguration();
    error Unauthorized();
    error DuplicateOffer();
    event TradeCreated(bytes32 indexed key,address indexed escrow,bytes32 indexed offerId,bytes32 termsHash,address buyer,address seller);
    constructor(address token_,address arbiter_) {
        if (token_.code.length==0||arbiter_==address(0)||token_==arbiter_) revert InvalidConfiguration();
        token=token_;
        arbiter=arbiter_;
    }
    function offerKey(address seller,address buyer,bytes32 offerId) public pure returns(bytes32) {
        return keccak256(abi.encode(seller,buyer,offerId));
    }
    function create(TradeEscrow.Terms calldata terms) external returns(address escrow) {
        if (msg.sender!=terms.seller) revert Unauthorized();
        if (terms.token!=token||terms.arbiter!=arbiter) revert InvalidConfiguration();
        bytes32 key=offerKey(terms.seller,terms.buyer,terms.offerId);
        if (escrows[key]!=address(0)) revert DuplicateOffer();
        escrow=address(new TradeEscrow(terms));
        escrows[key]=escrow;
        emit TradeCreated(key,escrow,terms.offerId,terms.termsHash,terms.buyer,terms.seller);
    }
}
