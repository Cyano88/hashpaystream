# Stock price provider selection - 12 September 2026

> Superseding decision: Pyth is excluded from the launch path on cost/access grounds. Twelve Data is the lower-cost implementation candidate and the default fail-closed adapter. It is restricted to verified regular US sessions. Its live session behavior and production data rights remain release gates; this is not mainnet approval.

## Decision

Use Twelve Data as the default independent reference for `xlayer-dex-v1`. The backend requires a server-only `HASHPAYSTREAM_TWELVE_DATA_KEY`; there is no silent provider or DEX-price fallback. Pyth Pro and Alpaca SIP remain explicit legacy options for deployments that later obtain suitable access and rights. This selection does not activate mainnet.

## Evidence and alternatives

| Candidate | Assessment |
| --- | --- |
| Twelve Data | Selected lower-cost candidate. Authenticated weekend requests verified exact SPY/ARCX/USD and USDC/USD/Binance identities and source timestamps. Historical 1-minute SPY access was observed. A regular-session end-to-end read and production usage rights remain unverified. |
| Pyth Pro | Technically implemented and tested with fixtures, but excluded from the launch path on cost/access grounds. |
| Alpaca SIP + Kraken | Existing implementation retained. Standard Alpaca API redistribution is prohibited by its published FAQ; suitable rights for this product were never established. Two independent service credentials/connectivity paths also increase operational dependencies. |
| Chainlink Data Streams | Strong alternative with an SPY extended-hours stream. Account access, commercial terms and the exact backend verification integration were not validated in this audit. No claim that X Layer support is unavailable. |
| RedStone | Its Ink announcement discusses xStocks coverage; this audit did not verify a usable SPY feed and equivalent access/history for this integration. |
| Backed public asset endpoint | Useful issuer halt/session evidence, but not an independent timestamped stock-price source. |
| Existing DEX spot/TWAP | Required executable-exit evidence, but cannot independently validate the same market's price. |

Primary sources:
- https://docs.pyth.network/price-feeds/pro/api/rest
- https://docs.pyth.network/price-feeds/pro/payload-reference
- https://docs.pyth.network/price-feeds/pro/api/history
- https://docs.pyth.network/price-feeds/pro/symbology-reference
- https://alpaca.markets/support/redistribute-alpaca-api
- https://data.chain.link/streams/spy-usd-extendedhoursequityprice-streams
- https://blog.redstone.finance/2026/05/15/redstone-becomes-the-official-oracle-provider-for-krakens-l2-ink/

## Access and cost

Official Terminal documentation offers a free API trial without a credit card: https://docs.pyth.network/price-feeds/pro/pyth-terminal . A trial is not a production license. Current published plans show Free as view-only, Starter at $500/month for crypto, and Pro starting at $2,500/month with equities and limited redistribution: https://app.pyth.com/plans . The equity package and this application's display/non-display/redistribution rights need confirmation; the starting price is not a quote for HashPayStream. No account, key or subscription was created or purchased.

## Verified feed pins and implementation

Public catalogue requests returned exact Equity.US.SPY/USD id 1398 exponent -5 and Crypto.USDC/USD id 7 exponent -8, both stable. SPY regular-session minimum is three publishers, even though its top-level minimum differs. Evidence: evidence/stock-pyth-candidate.json. An unauthenticated latest-price POST returned HTTP 403; reachability is not authenticated data access.

Each reference refresh checks stable identity, the regular-session minimum, the source feedUpdateTimestamp independently of the envelope, confidence <= 0.5%, USDC deviation <= 0.5%, and regular-session timing. The calendar parser handles published holidays, early closes and New York DST and rejects unknown syntax. Complete minute history and the previous session's last minute are required. Known recent/upcoming corporate actions block funding pending review. Day-range and five-minute limits use completed minute bars plus the latest price; they do not capture every transient tick inside the current incomplete minute. Absence of corporate-action metadata is not an asset-review approval.

Pyth prices are obtained over authenticated HTTPS and consumed by the existing trusted backend risk attestor. This implementation does not verify Pyth signatures on X Layer and does not claim a deployed Pyth contract. DEX execution, wrapper conversion and code identity checks remain independent. No stock-price input is required to repay an already accepted fixed-USDC claim.

## Remaining release gates

1. Run the configured Twelve Data adapter during an open regular US session and capture fresh SPY and USDC quotes plus contiguous current-session bars.
2. Confirm written production rights, the required tier, request capacity and any US-equity exchange fees before public testing.
3. Establish real participant eligibility and asset/corporate-action review decisions. A price provider does not grant permission to distribute tokenized stocks.
4. Approve pilot limits, security review, owner multisig and distinct risk and settlement signers, then review the paused deployment packet. Existing API and scheduler chain-196 gates remain in place.

No mainnet transaction, deployment, hosting change, provider registration or payment occurred.

## Validation checkpoint

Passed: TypeScript, Twelve Data calendar/identity/freshness/history/depeg rejection tests, DEX risk guards and provider-preflight tests. The Twelve Data repayment rehearsal used a pinned X Layer mainnet fork, actual wSPYx and USDC code, synthetic independent price and participant evidence, and isolated PostgreSQL. It delivered stock, repaid fixed 101 USDC to the funder, left 399 USDC for the worker, and exercised crash/restart, confirmation and reorg recovery. Evidence: `evidence/stock-twelve-data-repayment-fork.json`.

The weekend live preflight reached Twelve Data and the issuer, then correctly remained blocked because the regular stock session was closed and participant review was not configured. No production readiness claim is made.
