# Crypto-aligned stock market audit - 12 September 2026

## Decision

Wallet delivery remains the intended architecture: supported wSPYx is delivered to the worker's EVM address on X Layer; escrow repayment remains fixed in USDC. This audit establishes an executable weekend exit at one block, but does not establish sufficient independent pricing or manipulation resistance to enable weekend offers. No production pricing gate, signer, wallet, deployment or hosted configuration changed.

## Live onchain evidence

Read-only chain 196 audit at block 70451779. Candidate wrapper, underlying and payment token runtime hashes and known implementation pins matched the earlier evidence. Reviewed factory and pool identities were checked. The wSPYx -> USDG -> USDC route remained active.

| wSPYx input | Simulated USDC output | Fees plus impact versus route spot, rounded down |
| --- | --- | --- |
| 0.13 | 100.058116 | 6 bps |
| 2 | 1539.093323 | 7 bps |
| 10 | 7689.861457 | 15 bps |
| 100 | 76270.364622 | 96 bps |

Gas is excluded. These independent eth_call quotes are not cumulative trades, reservations or executed transactions. Larger quotes measure size sensitivity, not the cost of manipulating an oracle. The 2-token probe exceeds the draft 1000-USDC executable-depth floor at this block. It does not prove future liquidity, ownership independence or manipulation safety.

Scanned the verified Uniswap V3 factory for wSPYx against USDC and USDG at fees 100/500/3000/10000. Only wSPYx/USDG fee 500 was active; wSPYx/USDC fee 500 existed but was inactive. This is a bounded scan of eight combinations, not an exhaustive search of every X Layer venue. Other token-pair listings are not independently dollar-priced liquidity simply because a tracker assigns them USD TVL.

The existing stock pool supplied 5-minute and 30-minute observation history. Its average prices were about 770.2155 USDG per wSPYx versus spot about 770.1387. These are floating-point audit diagnostics, not production price arithmetic. Same-pool averages do not constitute an independent reference; a quiet pool can keep an old price even while the chain produces fresh blocks.

Evidence: evidence/stock-token-market-audit.json. The earlier pinned stock-dex-exit.json was preserved so the actual-token rehearsal remains reproducible. Script: npm run audit:stock-token-market. A first RPC attempt timed out; the completed attempt used a longer audit-only timeout with one retry.

## Independent reference

Kraken documents tokenized-asset spot discovery through AssetPairs with aclass_base=tokenized_asset. Local public requests timed out at connection establishment, including the corrected tokenized-asset catalogue request. This is a connectivity failure, not evidence that SPYx is absent. No live independent Kraken price, book depth or trade timestamp was verified. Evidence: evidence/stock-token-independent-market.json.

Source: https://docs.kraken.com/api-reference/market-data/get-tradable-asset-pairs . A SPYx perpetual is not a substitute for spot-token pricing. Any external raw SPYx price must also be converted using the actual wSPYx wrapper exchange rate at the same valuation point, with quote-currency conversion and venue/data permissions checked.

## Next implementation boundary

Keep the current regular-session checks until a second economically meaningful token market is verified. Before proposing an outside-hours adapter, require fresh spot trades/order-book depth, compatible token identity and wrapper conversion, independent USDC value, short/long price history, stale-trading rejection, and a calibrated disagreement threshold. Then rehearse price manipulation, thin liquidity and missing-reference failures on a local fork. Do not merely remove the calendar gate or substitute the existing pool's TWAP as an independent price.

Current api/stock-dex-market.ts requests observe history but does not enforce a computed TWAP-divergence limit; the proposed token-market path would need one. Retain the fixed-principal-plus-fee repayment and minimal worker/funder checkout. No worker's deduction should increase because the token price falls.

Validation: live read-only audit completed, audit script syntax check passed, evidence identities and quote amounts inspected. No transaction or full deployment test was needed for this audit-only change. Public wallet delivery remains gated by the existing production release requirements.
