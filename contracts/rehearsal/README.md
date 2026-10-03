# Local Arc Trade Safe rehearsal

Run from `contracts/` after installing the normal contract development dependencies:

```powershell
npm.cmd ci --prefix rehearsal --ignore-scripts --no-audit --no-fund
npm.cmd run test:trade-arc-safe
```

The separate lockfile pins published Safe 1.4.1 artifacts without changing shared
contract dependencies. Tests deploy its actual singleton and proxy factory, a
two-owner Safe with threshold two and no modules, mock six-decimal USDC, and the
existing TradeEscrowFactory on an ephemeral Hardhat chain with ID 5042. The test
refuses any other network. It lives outside the default test directory because
its signatures deliberately require this chain ID.

Coverage includes direct-call rejection, insufficient and duplicate approvals,
wrong-chain and outsider signatures, altered allocations, successful two-signer
execution, exact buyer/seller transfers and settlement events, and replay rejection.

This is local contract evidence only. It does not verify Arc mainnet deployment,
official USDC behavior, Circle execution, production Safe owners, or the separate
XLayer split canary. No live funds or signing credentials are used, and this test
does not enable hosted Arc funding.

Validated on 2026-10-03: all 50 tests passed in the combined run (47 existing
Trade tests and three Safe rehearsal tests):

```powershell
npx.cmd hardhat test --config hardhat.arc-trade.config.ts test/TradeEscrow.test.ts test/TradeEscrowPreflight.test.ts test/TradeEscrowAudit.test.ts rehearsal/test/TradeArcSafeRehearsal.test.ts
```
