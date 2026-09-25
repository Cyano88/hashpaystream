// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XStocksTradeEscrow} from "./XStocksTradeEscrow.sol";

/// @notice Safe-controlled factory for escrows over a verified X Layer token set.
/// @dev The arbiter Safe must approve each token before sellers can create offers.
contract XStocksTradeEscrowFactory {
    address public immutable arbiter;
    mapping(address token => bool approved) public approvedTokens;
    uint256 public approvedTokenCount;
    address[] private _approvedTokenList;
    mapping(address token => uint256 indexPlusOne) private _approvedTokenIndexPlusOne;
    mapping(bytes32 => address) public escrows;

    error InvalidConfiguration();
    error Unauthorized();
    error TokenNotApproved();
    error DuplicateOffer();

    event TokenApprovalChanged(address indexed token, bool approved, address indexed actor);
    event TradeCreated(
        bytes32 indexed key,
        address indexed escrow,
        bytes32 indexed offerId,
        bytes32 termsHash,
        address buyer,
        address seller,
        address token
    );

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert Unauthorized();
        _;
    }

    constructor(address arbiter_, address[] memory initialTokens) {
        if (arbiter_ == address(0) || arbiter_.code.length == 0) revert InvalidConfiguration();
        arbiter = arbiter_;
        for (uint256 i; i < initialTokens.length; ++i) {
            _setTokenApproval(initialTokens[i], true);
        }
    }

    function approvedTokenAt(uint256 index) external view returns (address) {
        return _approvedTokenList[index];
    }

    function setTokenApproval(address token, bool approved) external onlyArbiter {
        _setTokenApproval(token, approved);
    }

    function _setTokenApproval(address token, bool approved) internal {
        if (token == address(0) || token == arbiter || token.code.length == 0) revert InvalidConfiguration();
        bool previous = approvedTokens[token];
        if (previous == approved) return;
        approvedTokens[token] = approved;
        if (approved) {
            _approvedTokenList.push(token);
            _approvedTokenIndexPlusOne[token] = _approvedTokenList.length;
            ++approvedTokenCount;
        } else {
            uint256 index = _approvedTokenIndexPlusOne[token] - 1;
            uint256 last = _approvedTokenList.length - 1;
            if (index != last) {
                address moved = _approvedTokenList[last];
                _approvedTokenList[index] = moved;
                _approvedTokenIndexPlusOne[moved] = index + 1;
            }
            _approvedTokenList.pop();
            delete _approvedTokenIndexPlusOne[token];
            --approvedTokenCount;
        }
        emit TokenApprovalChanged(token, approved, msg.sender);
    }

    function offerKey(address seller, address buyer, bytes32 offerId) public pure returns (bytes32) {
        return keccak256(abi.encode(seller, buyer, offerId));
    }

    function create(XStocksTradeEscrow.Terms calldata terms) external returns (address escrow) {
        if (msg.sender != terms.seller) revert Unauthorized();
        if (terms.arbiter != arbiter || !approvedTokens[terms.token]) revert TokenNotApproved();
        bytes32 key = offerKey(terms.seller, terms.buyer, terms.offerId);
        if (escrows[key] != address(0)) revert DuplicateOffer();
        escrow = address(new XStocksTradeEscrow(terms));
        escrows[key] = escrow;
        emit TradeCreated(key, escrow, terms.offerId, terms.termsHash, terms.buyer, terms.seller, terms.token);
    }
}
