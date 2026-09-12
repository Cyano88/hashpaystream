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
