# X Layer DEX-only pricing rehearsal - 12 September 2026

## Decision

Do not use the X Layer route as the sole valuation source for stock advances. Keep its executable quote, depth and history checks, and require an independent stock reference.

## Evidence

The local-fork rehearsal used the pinned X Layer block, real wSPYx/USDC/USDG contracts, verified runtime hashes and real router execution. All attacker balances and transactions were synthetic and confined to chain 31337. No mainnet transaction occurred.

At the tested block, a synthetic 100,000 USDC purchase moved the quoted wSPYx exit price by about 244 basis points. An immediate move failed the 50-basis-point history guard. After holding the changed state for 1,801 seconds, the same-pool history guard passed. Across 100 hypothetical 100-USDC advances, the modeled unwind plus fixed repayment receivables was positive by 107.114729 USDC before gas and capital costs. Workers received tokens worth about 9,760.94 USDC at the pre-move price for 10,000 USDC of fixed principal.

This is a bounded economic simulation, not proof of a live exploit or guaranteed profit. It excludes gas, financing cost, arbitrage, other traders and MEV; uses one historical block and a finite parameter matrix; and models fixed receivables rather than executing the full escrow lifecycle. Its purpose is narrower: it disproves the assumption that same-pool price history alone makes DEX-only valuation safe. Sustained movement can become its own history.

Evidence: evidence/stock-dex-manipulation-fork.json. Reproduction: scripts/stock-dex-manipulation-fork.mjs. The script refuses non-loopback writes, pins chain and runtime identities, and labels all results productionApproved=false.

## Architecture consequence

The production acceptance path remains: independent SPY/USD and USDC/USD reference, current wSPYx conversion, executable X Layer output/depth, and bounded disagreement. Twelve Data is now the lower-cost integration candidate. It remains restricted to regular US market sessions and mainnet stays disabled until live-session data and commercial rights are verified.
