# Lower-cost stock data audit - 12 September 2026

## Result

No free, production-ready replacement was verified. Twelve Data is the leading lower-cost evaluation candidate, not an approved runtime replacement. Retain the tested Pyth implementation without purchasing or activating it. The earlier selection was technical; it did not establish affordability. No provider signup, message, payment, authenticated price request, hosting change or mainnet transaction occurred in this audit.

## Required capabilities

The current adapter requires independent SPY/USD and USDC/USD prices with actual source timestamps, complete current-session minute bars, previous-session close, holiday/early-close handling, and suitable rights for customer-facing stock early-pay valuations. A successful HTTP response or advertised real-time coverage alone does not establish these. A 15-minute delayed source cannot satisfy the draft 15-second price-age limit. Participant and corporate-action review remain separate requirements.

## Findings

| Candidate | Evidence and decision |
| --- | --- |
| Coinbase Exchange | Standard market-data terms restrict external-user applications, third-party derived works and financial-product valuations without written consent. A free public API is not sufficient permission for this flow. No documented free SPY endpoint was verified. |
| Twelve Data | Free Business Basic lists internal non-display use, real-time US equities, 8 requests/minute and 800/day. Best internal evaluation candidate. Business page lists Venture from $149 in its comparison and displays $499 for the selected larger credit bundle. Neither figure is an all-in quote: US-equity external distribution requires an add-on. Default feed covers roughly 5% of US trade volume, not consolidated market coverage. Live SPY freshness, complete current-session bars and USDC coverage have not been authenticated or tested. |
| Financial Datasets | Commercial use is permitted across plans subject to restrictions on redistribution/resale. $20 buys 1,000 requests; Build is $200/month. However, documented history supports day/week/month/year, not the current-session minute history we require. Does not replace the existing adapter as documented. |
| Market Data | Free stock quotes are delayed 24 hours; ordinary paid stock-quote API access is listed as 15-minute delayed. SmartMid is a separate real-time midpoint product, not evidence of fresh trade quotes. Customer-facing commercial licensing is custom. No complete inexpensive replacement verified. |
| Alpha Vantage | Free access is limited; current/delayed US equity entitlements and commercial access require separate arrangements. Published personal premium prices do not establish rights for this product. |
| Massive via Coinbase x402 | No API key required, but each request costs USDC on Base. Current snapshots use modeled Fair Market Value. Detailed docs say aggregate/indicator bars end at the previous completed session; no current-session history or streaming. Cannot supply our current risk checks as documented. No payment or wallet access attempted. |

Finnhub's documented real-time quote is potentially useful, but candles are marked Premium and commercial entitlement was not established. It is not selected. None of these findings proves no suitable free provider exists anywhere.

Sources checked:
- https://www.coinbase.com/legal/market_data
- https://docs.cdp.coinbase.com/coinbase-app/advanced-trade-apis/rest-api
- https://twelvedata.com/pricing-business
- https://support.twelvedata.com/en/articles/9935903-us-equities-market-data
- https://www.financialdatasets.ai/terms-of-use
- https://www.financial-datasets.ai/pricing
- https://docs.financialdatasets.ai/api/prices/historical
- https://www.marketdata.app/pricing/
- https://www.alphavantage.co/documentation/
- https://massive.com/docs/ai-tools/x402
- https://finnhub.io/docs/api/quote

## Concrete next step

Evaluate Twelve Data Business Basic internally only after a key is available. Verify SPY identity, timestamp semantics and age, current-session minute completeness, holidays and early closes, and independent USDC/USD coverage. Do not count a bar's start time or HTTP response time as a fresh trade timestamp. Keep existing fail-closed price/risk checks; do not weaken them to fit a free plan. Free quota is not a production capacity plan: one request every 15 seconds over a 6.5-hour session already consumes 1,560 requests before history or USDC queries.

Before public use, obtain a complete quote and explicit scope covering the following draft. This draft has NOT been sent:

> We are building HashPayStream, a stock early-pay application. Our backend uses SPY/USD and USDC/USD to calculate token quantities and risk limits for employee/funder offers. Customers see the resulting token quantity, USDC principal and fixed fee. We need source-timestamped prices no more than 15 seconds old, current-session one-minute OHLC history, the previous regular-session close, and US holiday/early-close status. We do not sell a market-data feed. Please confirm whether these derived customer-facing quotes and automated financial valuations are permitted, the exact required Business tier and US Equities Add-On, available startup discount, all recurring/exchange fees, feed coverage, and whether the free Basic plan permits internal evaluation of these exact datasets.

The scope question is necessary because internal backend processing does not by itself prove that customer-facing derived quotes are licensed. The total price and appropriate rights remain unverified. No payment approval is being requested in this audit.

## Verification

Reviewed current primary documentation and existing adapter requirements. Documentation changes only; no runtime provider switch and no new tests required. Previous Pyth local-fork tests remain historical evidence, not live validation of any replacement provider.

## Internal evaluation runner

Added npm run audit:stock-twelve-data. It reads HASHPAYSTREAM_TWELVE_DATA_KEY from the current process, uses the documented Authorization header, and makes at most three requests with no retry loop. Never place the key in a frontend VITE variable or commit it. It checks exact SPY ETF/ARCX/USD identity, reported quote age, USDC/USD deviation and complete minute bars in the regular-session window. OBSERVED means the candidate response passed these limited checks; it does not certify timestamp semantics, exchange calendar, commercial rights or production readiness. Nothing is connected to the risk signer or production pricing path.

The smoke test passes with synthetic responses, including stale prices, incorrect MIC, depeg and missing/duplicate/invalid bars. The attempted live run made zero requests because no key was configured. Boolean-only checks found no recognized Twelve Data key in the current process or .env/.env.local in this worktree and the production checkout; hosting secrets were not inspected. Evidence: evidence/stock-twelve-data-evaluation.json.

Next required input: create a free Twelve Data account, obtain the API key from its dashboard, and configure HASHPAYSTREAM_TWELVE_DATA_KEY privately in the runner's process. Then rerun during the regular US market session, at least six minutes after opening. Saturday cannot establish regular-session freshness. Official account/API instructions: https://twelvedata.com/docs . No subscription purchase or provider switch is required for this internal evaluation.

## Saved-key live verification

The user configured the ignored .env.local file. Loading it with node --env-file=.env.local succeeded. Live SPY and USDC/USD quote requests returned HTTP 200. Updated the evaluator to request interval=1min and handle the actual response schema: quote does not return type, and the crypto quote does not return currency. SPY is matched by symbol/USD/ARCX; the crypto symbol alone does not certify venue identity. The quote's bar timestamp is not used as a fresh source timestamp; reported last_quote_at is inspected separately and its semantics remain unverified.

At 2026-09-12T12:30:24Z, SPY reported closed and USDC last_quote_at was 24 seconds old, failing the draft 15-second limit. A separate read-only request for 2026-09-11 SPY history returned HTTP 200, ARCX identity, and all 390 one-minute timestamps in order. This establishes past-session history access, not current-session completeness or live-price suitability. Evidence: evidence/stock-twelve-data-evaluation.json and evidence/stock-twelve-data-history-access.json. Synthetic regression checks passed after correcting schema assumptions; no production provider switch occurred.

Next: evaluate during the next regular US session (Monday September 14, after 14:36 Lagos time, assuming no unscheduled closure), verify current-session bars and actual source freshness, then resolve timestamp semantics, USDC venue identity, calendar and usage rights before any runtime integration. No background check was scheduled.
