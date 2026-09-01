// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract ReentrantUSDC is ERC20 {
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackArmed;
    bool public callbackBlocked;

    constructor() ERC20('Reentrant Test USDC', 'rtUSDC') {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }

    function armCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
        callbackArmed = true;
        callbackBlocked = false;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (callbackArmed) {
            callbackArmed = false;
            (bool success,) = callbackTarget.call(callbackData);
            callbackBlocked = !success;
        }
        return super.transferFrom(from, to, value);
    }
}
