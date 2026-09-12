# Stock price provider selection - 12 September 2026

## Decision

Select Pyth Pro as the technical default for xlayer-dex-v1. This is an integration decision, not approval to buy a subscription or activate mainnet. HASHPAYSTREAM_PYTH_PRO_KEY must be configured server-side with SPY and USDC latest-price and history entitlement. There is no silent fallback. The prior Alpaca SIP plus Kraken path remains explicitly selectable for an appropriately entitled deployment.

## Evidence and alternatives

| Candidate | Assessment |
| --- | --- |
| Pyth Pro | Selected: one provider supplies SPY/USD, USDC/USD, source timestamps, confidence, publisher count, session metadata and minute history. Exact public metadata verified; authenticated prices not yet verified. |
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

1. Configure a trial key and verify actual SPY/USDC current and historical responses during a regular US stock session. Confirm commercial entitlement before public use.
2. Establish real participant eligibility and asset/corporate-action review decisions. Pyth supplies prices, not permission to distribute stocks. Provider partnership is not itself participant approval: https://xstocks.com/partner .
3. Calibrate and approve risk limits, complete missing product caps, security review and signer/owner configuration, then review the paused deployment packet. Existing API/scheduler chain 196 gates remain in place.

No mainnet transaction, deployment, hosting change, provider registration or payment occurred.

## Validation checkpoint

Passed: TypeScript, Pyth source/session/history rejection tests, legacy market-data tests, DEX risk guards, preflight redaction tests and standalone browser-secret/surface checks. The full Pyth local actual-token plus isolated PostgreSQL rehearsal passed after retrying fork startup with network access. Evidence: evidence/stock-pyth-repayment-fork.json. It delivered stock and repaid fixed 101 USDC to the funder, left 399 USDC for the worker, and exercised crash/restart, confirmation and reorg recovery. Pyth prices and participant decisions were synthetic fixtures; token and DEX code came from the pinned X Layer fork. This does not validate authenticated Pyth payloads.

Live preflight verified feed metadata and issuer availability, and deliberately returned blocked: key/entitlement absent in the inspected process, market closed, real participant/asset review unverified, and deployment/security gates outstanding. No production readiness claim is made.
