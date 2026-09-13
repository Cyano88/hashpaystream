# HashPayStream chain scope - 13 September 2026

## Canonical product boundary

- Arc is the savings network. Before Arc public mainnet launches, public testing uses Arc Testnet chain 5042002 and test USDC only.
- X Layer mainnet chain 196 is the Stock Early Pay network. Workers request a fixed eligible USDC amount and funders publish capped offers backed by an approved stock token.
- Arc test funds never secure, repay, or prove an X Layer funding position.
- The legacy service-agreement advance implementation remains in source for migration and record recovery, but the canonical /upfront and approved-funder /funding surfaces render Stock Early Pay.

## Launch controls

The Stock Early Pay UI is visible by default. Money movement requires all three server switches and valid pinned configuration:

1. HASHPAYSTREAM_STOCK_EARLY_PAY_ENABLED=true
2. HASHPAYSTREAM_STOCK_XLAYER_MAINNET_APPROVED=true
3. HASHPAYSTREAM_STOCK_CONFIG with chain 196, HTTPS RPC and risk endpoints, reviewed runtime hash, approved asset, participants, fee ceiling, liquidity, volatility, quote-age, and deviation limits.

Receipt and settlement workers remain independently disabled until their own switches, signer, and transaction budget are configured.

Arc savings is deployed on Arc Testnet at 0x218271a4dc03c0578dA4B2274A56c15Fc751f5EF. Deposits require HASHPAYSTREAM_SAVINGS_DEPOSITS_ENABLED=true and remain disabled while the test-USDC rehearsal is completed. A bounded 0.1 test-USDC weekly-plan rehearsal succeeded at block 61823383. External audit and financial-production readiness remain false.

## Migration evidence

The earlier PersonalSavingsVault at 0x9D2ca9763503C99ac2F788B7743B8aE6840d6A06 is an X Layer deployment and is not used by the new Arc savings runtime. Its deployment record remains for audit and any future withdrawal or migration work.
