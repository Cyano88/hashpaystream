# xStocks share escrow migration (undeployed candidate)

The live nominal-balance factory cannot safely fund Backed share-based stocks. NVDAx mainnet reads on 2026-09-25 mapped 2220000000000000 nominal units to 2216229757026900 shares and back to 2219999999999999 nominal units. The old funding call reverts IncorrectFunding. No live stock deposit was completed.

## Candidate behavior

XStocksTradeEscrow and XStocksTradeEscrowFactory are new contracts; existing TradeEscrow, factory, Arc agreements and existing addresses are unchanged.

At funding, the accepted nominal amount is converted to shares using the issuer's current conversion. The escrow requires the exact share increase and stores that principal. Payouts distribute principal shares; issuer multiplier changes affect their displayed stock quantity. Split allocations use original agreed nominal amounts as weights, round the buyer share allocation down, and allocate every remaining share to the seller. Full refund/release returns every principal share. Donated shares remain outside principal.

SharesFunded and SharesSettled provide custody quantities. ShareSettlementAllocation describes original-term allocation weights only; it must never be presented as the actual rebased token receipt.

## Activation prerequisites

- Keep the legacy stock funding API guard enabled. Cancellation and existing funded recovery remain available.
- Register a separate versioned factory and pinned runtime after deployment verification. Do not replace the legacy factory constant globally: old agreements must retain original contract references and lifecycle routing.
- Bind the share-custody version into the agreement digest, participant consent and factory selection. Disclose multiplier effects and split rounding before acceptance.
- Extend API/SDK status and receipt schemas with funded shares, settled shares and block-specific displayed quantities. Use exact integer arithmetic; no float conversion.
- Test the hosted adapter, builder SDK, receipt evidence and all lifecycle routes against the new factory before enabling new stock agreements.
- Cancel the existing unfunded NVDAx test using its normal participant flow. A fresh agreement needs both users' consent and a new allowance for the new escrow. The old allowance does not authorize the replacement.
- Obtain the deployment wallet's signature only after the complete integration is ready for review. No mainnet deployment or cancellation was executed by this change.

## Checks

Candidate unit tests cover reproduced rounding, both rebase directions, full refund/release, uneven arbitration split, mutual settlement, deadlines, donation recovery, zero-share rejection, short funding/payout rejection, atomic two-leg rollback and factory authorization. The optional fork test exercises the actual mainnet token locally; run with XSTOCKS_FORK_TEST=1 on Hardhat only. Fork transactions are not broadcast to mainnet.
