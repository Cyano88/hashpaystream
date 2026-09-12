# Twelve Data stock-reference handoff - 12 September 2026

## Implemented path

Twelve Data is the default independent-reference candidate for `xlayer-dex-v1`. The server reads `HASHPAYSTREAM_TWELVE_DATA_KEY`; the browser never receives it. There is no automatic fallback to Pyth, Alpaca or the X Layer pool price.

An offer can pass only during the regular NYSE session when all of these agree:

- SPY is exactly identified as the ARCX-listed USD ETF and reports the market open.
- USDC/USD is exactly identified on the pinned Binance venue and remains within 50 basis points of one dollar.
- Both quotes carry source timestamps inside the configured freshness limit.
- Every completed one-minute SPY bar since the session open is present, ordered and internally valid.
- Five-minute movement and session volatility stay inside policy limits.
- The independently derived wSPYx value stays within the configured deviation from executable X Layer output, and the route meets the depth floor.
- Issuer availability, participant review, asset review and their expiries all pass.

The adapter uses a reviewed static NYSE calendar for 2026-2028, including holidays and early closes. Any other year fails closed. Twelve Data's exchange-schedule endpoint was not available on the trial plan, so calendar maintenance is an explicit operational task.

## Evidence

The unit suite covers missing credentials, weekends, holidays, early close, unknown calendar years, stock and USDC identity changes, closed sessions, stale source timestamps, USDC depeg, incomplete or duplicate bars, invalid OHLC, movement and volatility calculations.

The full repayment rehearsal passed against a pinned X Layer mainnet fork with actual wSPYx and USDC code, synthetic Twelve Data and participant evidence, and isolated PostgreSQL. It exercised executable amount/depth quotes, independent-price disagreement, runtime pinning, stock delivery, fixed 101 USDC repayment, 399 USDC worker remainder, crash/restart, confirmations and receipt persistence. Evidence: `evidence/stock-twelve-data-repayment-fork.json`.

The separate manipulation rehearsal rejects DEX-only valuation. A sustained 244-basis-point same-pool move eventually passed the pool-history guard and produced a positive modeled result across 100 hypothetical claims before gas and capital costs. This bounded local simulation is enough to retain the independent reference; it is not a claim of a live exploit. Evidence: `evidence/stock-dex-manipulation-fork.json`.

## Release gates

1. On Monday 14 September 2026 after 14:36 Africa/Lagos, run `node --env-file=.env.local --import tsx scripts/stock-provider-preflight.mjs` during the open US session. Capture fresh quotes and contiguous current-session history; recheck the official market status that day.
2. Run `node scripts/stock-token-market-audit.mjs` close to the successful reference check and assess the independently derived price against the executable X Layer quote.
3. Obtain written confirmation of production usage rights, the required Twelve Data tier, US-equity fees, feed coverage and capacity. The trial key and a successful response do not establish public-product rights.
4. Configure real participant and corporate-action decisions, approve pilot limits, complete security review, select the owner multisig and distinct risk and settlement signers, and finalize the paused deployment packet.

No mainnet transaction, deployment, production database mutation, hosting change or provider purchase occurred.
