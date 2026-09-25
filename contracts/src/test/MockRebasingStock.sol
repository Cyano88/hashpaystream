// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract MockRebasingStock {
 uint256 public multiplier=1001701196801074000;
 mapping(address=>uint256) public sharesOf;
 mapping(address=>mapping(address=>uint256)) public allowance;
 bool public shortTransfer;
 address public blocked;
 function setBlocked(address a) external {blocked=a;}
 function setMultiplier(uint256 v) external {require(v>0);multiplier=v;}
 function setShortTransfer(bool v) external {shortTransfer=v;}
 function mintShares(address a,uint256 n) external {sharesOf[a]+=n;}
 function getSharesByUnderlyingAmount(uint256 n) public view returns(uint256){return n*1e18/multiplier;}
 function balanceOf(address a) external view returns(uint256){return sharesOf[a]*multiplier/1e18;}
 function approve(address a,uint256 n) external returns(bool){allowance[msg.sender][a]=n;return true;}
 function transferFrom(address a,address b,uint256 n) external returns(bool){allowance[a][msg.sender]-=n;move(a,b,getSharesByUnderlyingAmount(n));return true;}
 function transferShares(address a,uint256 n) external returns(bool){move(msg.sender,a,n);return true;}
 function move(address a,address b,uint256 n) private {require(b!=blocked);sharesOf[a]-=n;sharesOf[b]+=shortTransfer?n-1:n;}
}
