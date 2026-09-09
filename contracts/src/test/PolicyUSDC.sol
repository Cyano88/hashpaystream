// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @notice Test-only model of issuer pause/address restrictions; not a USDC implementation.
contract PolicyUSDC is ERC20 {
    bool public paused;
    mapping(address => bool) public blocked;
    error IssuerRestricted();
    constructor() ERC20("Policy test USDC", "pUSDC") {}
    function decimals() public pure override returns(uint8) { return 6; }
    function mint(address to,uint256 value) external { _mint(to,value); }
    function setPaused(bool value) external { paused=value; }
    function setBlocked(address who,bool value) external { blocked[who]=value; }
    function _update(address from,address to,uint256 value) internal override {
        if (paused || blocked[from] || blocked[to]) revert IssuerRestricted();
        super._update(from,to,value);
    }
}
