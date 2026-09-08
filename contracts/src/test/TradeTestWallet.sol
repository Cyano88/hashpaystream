// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @dev Local fixture, not Circle SDK or account-abstraction integration.
contract TradeTestWallet {
 address public immutable owner;
 constructor(address owner_){owner=owner_;}
 function execute(address target,bytes calldata data) external returns(bytes memory){
  require(msg.sender==owner,"Only owner");
  (bool success,bytes memory result)=target.call(data);
  if(!success){assembly{revert(add(result,32),mload(result))}}
  return result;
 }
}
