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

## Price-history guard implementation

Added api/stock-dex-history.ts and wired it into both reviewed route pools in readStockDexQuote. The adapter now compares current pool tick against five- and thirty-minute mean ticks and compares those means against each other. It uses the existing maxQuoteDeviationBps ceiling and exact integer ratios for tick-distance comparisons, with bounded exponent work. Mean ticks round down for negative values and handle int56 cumulative wrap. Tick quantization is approximately one basis point; this does not replace the exact executable-output versus independent-price check.

This is an additional movement guard. Quiet stale trading or a sustained attack affecting all three samples can still pass it. A reliable independent source remains mandatory. The thirty-minute comparison can reject legitimate fast price changes too; limit calibration and production approval remain outstanding. API chain 196 and weekend gates remain closed.

Synthetic tests cover upward/downward price shocks, short-window manipulation, sustained spot/history disagreement, threshold boundaries, negative rounding, cumulative wrap and malformed history. The independent-price integration test now changes its synthetic SPY reference by 2% instead of forcing every deviation limit to zero, which could trigger the new earlier guard and obscure the condition being tested.

Kraken's current FAQ explicitly lists SPYx among the assets traded 24/7 on Kraken Pro: https://support.kraken.com/articles/xstocks-faq . It also describes exchange quantity multipliers. An eventual SPYx-to-wSPYx reference must verify the exchange's quote units and multiplier semantics, not blindly apply a wrapper conversion to an assumed underlying share price. Market availability in documentation is not live feed verification.

Public Kraken WebSocket probe failed with ENOTFOUND; Bybit spot metadata probe timed out. The machine's configured DNS resolver timed out for api.kraken.com while a read-only lookup through 1.1.1.1 succeeded. No system DNS settings changed. Evidence: evidence/stock-kraken-websocket-probe.json and evidence/stock-bybit-spot-probe.json. Neither exchange was marked as a verified price source.

The one-off HTTPS request using the independently resolved Kraken address also timed out while connecting. Thus DNS is one observed failure, but correcting resolution alone did not restore connectivity. No successful Kraken HTTP response or live token quote was obtained.

Validation completed: TypeScript, DEX history unit scenarios, existing DEX guard tests, and the full Pyth actual-token local-fork plus isolated PostgreSQL repayment rehearsal passed. The first integration attempt exposed the obsolete zero-limit assertion described above; the corrected independent-price scenario and subsequent full run passed. Provider prices and participant approvals in that rehearsal were synthetic. No live manipulation-cost or independent-source verification is claimed.

## Render public-data probe

An isolated smallest-plan Render job successfully queried Kraken's public tokenized-asset catalog, SPYx/USD spot depth and recent trades. The job succeeded and finished at 2026-09-12T14:55:01Z; the probe completed at 14:54:54.407Z. No app deployment, environment change, authenticated market request, database access or transaction occurred. The job used per-second billed compute and a 75-second script deadline. Evidence: evidence/stock-kraken-render-job.json and evidence/stock-kraken-render-probe.json. Reproducible public-only script: scripts/stock-kraken-public-probe.mjs (syntax check passed).

Kraken returned tokenized SPYx/USD as online. Best bid was 765.94 USD and best ask 766.02 USD. Latest trade was 766.01 USD, but its source timestamp was 262.525 seconds old at completion. Best bid/ask level timestamps were 262.407/332.407 seconds old. These are historical observations, not current prices. Successful HTTP access does not satisfy the proposed 15-second freshness limit; old resting levels do not alone prove the whole book is stale.

Next: measure ongoing public book/trade updates from the reachable backend. Verify exchange quantity/multiplier semantics against raw SPYx and wSPYx before a same-time X Layer comparison; the older DEX snapshot cannot establish current agreement. Independent USDC conversion, data-use rights and risk-policy approval remain unresolved. Kraken is a reachable candidate, not an approved production reference. Mainnet and weekend gates remain closed.
## Continuous feed and unit-mapping checkpoint

The second isolated Render job completed successfully on 2026-09-12 at 15:23:32Z. The actual sampling window was approximately 15:22:37-15:23:30Z, with a 95-second script deadline (Render startup is additional). Evidence: evidence/stock-kraken-continuity-job.json, evidence/stock-kraken-continuity.json and evidence/stock-kraken-continuity-summary.json. Both new diagnostic scripts passed syntax checks; the summary was reproduced from the captured response.

Kraken accepted both SPYx/USD WebSocket subscriptions. We received a book snapshot, a trade snapshot and 52 heartbeats, but zero market updates. The book snapshot source timestamp was already 44.151 seconds old at receipt. Six REST samples all returned trade ID 108059, aged 1926-1978 seconds. Zero samples met the proposed 15-second stock freshness limit. Two of six USDC trade samples also exceeded 15 seconds. This finite window establishes neither universal venue inactivity nor continuous availability. Heartbeats and receipt timestamps must never refresh stock prices. Book checksums were captured but not validated; this is a diagnostic recorder, not a production order-book adapter.

Kraken Assets exposes token_multiplier=1.005714560286254, matching the issuer's currentMultiplier. At X Layer blocks 70457520 and 70457573, convertToAssets(1e18) returned 1005714560286254000 underlying units. Thus these three multiplier observations agree. Kraken REST and WebSocket also returned the same last trade ID with different decimal precision. This corroborates feed identity, but does not establish the API price/quantity denomination contract through a corporate action.

The issuer documents rebasing in EVM balanceOf and recommends valuing current wrappers with convertToAssets(shares) multiplied by an independent underlying-token price. Kraken's customer FAQ describes rebased display quantities and underlying raw custody quantities. Do not apply a second multiplier after converting wrapper shares to rebased EVM assets; confirm the exchange API convention before acceptance.

Sources:
- https://docs.xstocks.fi/developers
- https://docs.xstocks.fi/developers/wrapped-xstocks
- https://support.kraken.com/articles/xstocks-faq
- https://docs.kraken.com/api-reference/market-data/get-asset-info
- https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/book

Contemporaneous read-only DEX simulations returned 100.077096 and 100.077069 USDC for 0.13 wSPYx. Under the explicitly unverified assumption that Kraken quotes rebased underlying units, the comparison with the old trade and USDC conversion is approximately -9.31 basis points. This is NOT a fresh cross-venue validation: the stock price is stale, final USDC sample is stale, and this lightweight probe did not repeat the production runtime-hash checks. Numerical proximity cannot override those failures.

Decision: do not promote Kraken to the production reference or open weekend offers. Next useful gate is a regular-session shadow run using the existing independent reference candidate and DEX adapter, measuring source freshness, complete volatility history and executable-depth agreement. A separate 24/7 route requires evidence of sustained fresh independent token-market data; weakening freshness merely to pass this sample is not justified. No application deployment, mainnet transaction, production database access or production configuration change occurred.