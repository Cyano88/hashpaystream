# Pyth SPY / SPYx weekend coverage audit - 12 September 2026

## Decision

Prioritize evaluating Crypto.SPYX/USD before buying an equity or custom-index subscription. The earlier equity-only query missed this token-specific feed. Metadata is verified; live prices, source independence, denomination and commercial entitlement are NOT verified. Do not change production feed pins or open weekend offers yet.

## Exact public catalogue findings

Source: https://pyth.dourolabs.app/v1/symbols?query=SPY

- Equity.US.SPY/USD: ID 1398, exponent -5, stable; regular/pre/post/overnight sessions, with Saturday closed. This is the existing adapter's feed.
- Crypto.SPYX/USD: ID 1843, exponent -8, description SP500 XSTOCK / US DOLLAR, stable, crypto spot, minimum 3 publishers, fixed_rate@200ms minimum channel. Regular-session schedule is America/New_York;O,O,O,O,O,O,O; (seven-day availability metadata).
- Crypto.SPYX/SPY.RR: ID 1842, exponent -8, stable redemption rate, minimum 2 publishers, same seven-day schedule. A redemption rate is not an independent USD market price.

SPYX/USD Hermes ID: 2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14
SPYX/SPY.RR Hermes ID: 9e916cc00d292da2367646ffd6537d6b8d0c3f15e2d5891ac44aed31291811a9

The public SPY and Index searches did not establish an exact SPY 24/7 Index. Absence from these searches does not prove no private/custom product exists. Pyth's public indices page advertises E-mini S&P 500 coverage, which is not automatically a SPY ETF or SPYx token price.

Evidence: evidence/stock-pyth-weekend-catalog.json. Index results are retained as identity/schedule summaries; all SPY matches include full metadata.

## Live access result

An unauthenticated Hermes latest-price request for the two SPYX feeds returned unauthorized. No price payload or source timestamp was obtained. Evidence: evidence/stock-pyth-spyx-hermes.json. Pyth documents mandatory Hermes API-key authentication since the 26 August 2026 upgrade, including for the existing hermes.pyth.network endpoint. This failure does not establish that these feeds lack weekend prices.

https://docs.pyth.network/price-feeds/core/upgrade/preparing

## Access and cost

https://app.pyth.com/plans currently lists:
- Free: view-only, no API, no redistribution.
- Starter: $500/month plus tax, crypto symbols, display rights, no redistribution.
- Pro: starts at $2,500/month plus tax, equities and other symbols, display/non-display and limited redistribution.
- Pyth Indices: 24/7 including weekends, negotiated licensing/pricing, not self-service.

Crypto classification of SPYX/USD suggests Starter may be worth asking about; it does not establish inclusion or permission for HashPayStream's derived worker/funder valuations. Do not buy a plan on that assumption. The free API trial described at https://docs.pyth.network/price-feeds/pro/pyth-terminal is evaluation access, not proof of production entitlement. No subscription, account, request submission or payment was made.

## Next verification

Use a Pyth evaluation key with confirmed SPYX/USD and SPYX/SPY.RR access, plus USDC/USD. Keep it server-side. Capture repeated source update timestamps, confidence, actual publisher counts, market sessions and history over the weekend. Confirm whether the SPYX/USD feed measures raw custody units, rebased token units or a derived underlying-equity value, and whether source venues overlap the X Layer route. Matching a ticker alone does not establish independence or correct conversion.

Then implement explicit token-reference normalization with corporate-action tests; never just replace feed 1398 with 1843 in the existing equity parser. Compare against pinned, executable X Layer quotes with fresh USDC conversion and test stale/frozen prices, confidence widening, publisher loss and conversion changes. The seven-day metadata does not waive issuer, participant, risk-policy or security review gates.

## Draft provider questions (not sent)

We are evaluating SPYx stock-token early payment on X Layer, with fixed USDC repayment from employer-approved escrow. We need Crypto.SPYX/USD (1843), Crypto.SPYX/SPY.RR (1842), and Crypto.USDC/USD (7).

Please confirm:
1. Weekend source-update behavior, market-data methodology, source venues and actual publisher coverage for feed 1843; is it market-derived token pricing or computed from underlying SPY and a multiplier?
2. Exact price and quantity denomination across EVM rebasing and wrapped SPYx; how should feed 1842 be applied without double adjustment?
3. Trial access to latest prices and minute history, including weekend data, and the lowest eligible production plan for these exact feeds.
4. Rights for non-display acceptance checks and worker/funder-facing derived valuations; all applicable charges.
5. Whether a separate SPY weekend index exists, its exact ID/methodology and cost if feed 1843 does not satisfy this use case.

Official access page: https://app.pyth.com/ . Indices enquiry: https://www.pyth.network/indices . No message has been sent.