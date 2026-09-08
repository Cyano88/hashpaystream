// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {MockUSDC} from "./MockUSDC.sol";
contract ShortTransferUSDC is MockUSDC {
 function transferFrom(address from,address to,uint256 value) public override returns(bool){return super.transferFrom(from,to,value-1);}
}
