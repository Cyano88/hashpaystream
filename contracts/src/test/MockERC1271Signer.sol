// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1271} from '@openzeppelin/contracts/interfaces/IERC1271.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';

contract MockERC1271Signer is IERC1271 {
    address public immutable signer;

    constructor(address signer_) {
        require(signer_ != address(0), 'zero signer');
        signer = signer_;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        if (ECDSA.recover(hash, signature) == signer) return IERC1271.isValidSignature.selector;
        return 0xffffffff;
    }
}
