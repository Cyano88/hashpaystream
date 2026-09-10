// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ReentrantUSDC} from './ReentrantUSDC.sol';
contract StockTransferTestToken is ReentrantUSDC {
    bool public shortTransfer;
    function setShortTransfer(bool enabled) external { shortTransfer = enabled; }
    function transfer(address to, uint256 value) public override returns (bool) {
        if (callbackArmed) {
            callbackArmed = false;
            (bool success,) = callbackTarget.call(callbackData);
            callbackBlocked = !success;
        }
        return super.transfer(to, shortTransfer ? value - 1 : value);
    }
}
