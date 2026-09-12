# Production DEX pricing adapter - 12 September 2026

## Implemented path

Set `marketAdapter: "xlayer-dex-v1"` in the reviewed stock configuration to select the new server-side adapter. It is opt-in. The mainnet feature gate remains closed; this change does not deploy, send a transaction or enable chain 196.

The adapter combines:

- **Alpaca SIP SPY/USD** latest quote and trade with source timestamps. It explicitly requests SIP, never falls back to IEX or delayed SIP. Bid/ask and trade disagreement are bounded.
- **Alpaca regular-session clock and calendar**, including holidays, early closes and New York daylight-saving changes. Complete adjusted minute history and the previous trading session's adjusted daily close are required. New offers wait until six complete minutes after opening. Intraday range includes the current daily range; the short-term guard covers the completed five-minute return and the latest quote versus that earlier close.
- **Kraken USDC/USD** last trade with its source timestamp, explicit pair binding and a 0.5% depeg guard. There is no assumed USD=USDC conversion.
- **Current wSPYx V2 conversion** and pinned underlying/wrapper implementation code, payment token, intermediate token, pool factory and quote contracts.
- **Uniswap v3 wSPYx -> USDG -> USDC quotes** for the exact offered amount and a larger depth probe. Both must stay within the configured independent-price deviation limit; the depth output must meet the configured liquidity floor. Pool history availability is checked; pool TWAP is not the independent price.
- **Authenticated participant and asset review**, plus the public issuer's current trading availability. New offers require explicit corporate-action clearance and transfer availability; missing evidence does not imply approval.

The USDC price per whole wrapper is computed with integer arithmetic:

`convertToAssets(1e18) * SPY_USD_E8 * 1e6 / (1e18 * USDC_USD_E8)`

Preparation derives a token amount from this independent reference. Publication, listing and acceptance send the existing offer's exact `tokenAmount` to the adapter. Participant clearance must echo it exactly when present. This closes the earlier gap where a principal-only quote could stand in for the actual stock amount.

Expiry is clipped to independent source age, quote block age, calendar close, issuer availability change, participant review, asset review and quote TTL. Source timestamps are never replaced with fetch time. Bodies are bounded; redirects and failed HTTP responses are rejected. Provider keys stay in server configuration and are excluded from public client configuration.

## Configuration and remaining live verification

The server reads these environment variables only for the selected adapter:

- `HASHPAYSTREAM_ALPACA_KEY` and `HASHPAYSTREAM_ALPACA_SECRET`: data/clock access. Current SIP entitlement must be verified. `HASHPAYSTREAM_ALPACA_PAPER=true` selects the paper calendar/clock origin; market data still comes from the official data origin.
- `HASHPAYSTREAM_STOCK_RISK_ADAPTER_TOKEN`: bearer authentication to the existing trusted `riskUrl` review service. The service must actually validate this token and return reviewed decisions; this change does not implement that service's identity or corporate-action review process.

Existing risk policy fields control source age, quote deviation, volatility and required exit depth. This adapter additionally restricts principal to 100 USDC, the short-term move to 0.5%, and USDC/USD deviation to 0.5%. These are conservative draft engineering limits, not calibrated or approved launch settings. Principal caps do not implement per-worker claim or tenor caps.

The review response must contain `participantClearance` with the exact existing request scope, plus `assetReview`:

```json
{
  "chainId": 196,
  "asset": "0xE7E553Cd128F0011777323A0b44a7b96EA1CB540",
  "policyVersion": "REVIEWED_POLICY_VERSION",
  "checkedAt": 0,
  "expiresAt": 0,
  "corporateActionsClear": true,
  "transfersAvailable": true,
  "reviewReference": "REAL_REVIEW_REFERENCE_REQUIRED"
}
```

The example is intentionally invalid until backed by current review evidence. `checkedAt` and `expiresAt` are Unix seconds, bounded by the configured risk age. There is no default eligibility, corporate-action or data-access approval.

No provider subscription, account registration or live authentication was performed. Public Coinbase and Kraken endpoint probes failed DNS resolution on this workstation; Coinbase was not integrated. Kraken support follows its documented response contract and remains subject to live endpoint verification. Alpaca SIP entitlement and permissible data use also remain unverified. Independent-source tests use explicitly synthetic responses, not claimed live prices.

A Backed issuer account is not required for this DEX route. A market-data credential is a separate service choice. The existing issuer integration request remains optional and unsent.

## Rehearsal and validation

`npm run test:stock-market-data` exercises source freshness, missing data, USDC depeg, minute-history gaps, closed sessions, early closes, daylight-saving changes, missing credentials and response bounds.

`npm run test:stock-dex-market` exercises token-scope binding, authenticated-review requirement, the principal cap, corporate-action and transfer decisions, source identity and volatility/session limits.

`npm run test:stock-actual-repayment` uses a loopback-only fork of X Layer block 70423197, the real wSPYx V2 and USDC implementations, a newly deployed local escrow, synthetic signers and an isolated PostgreSQL database. Actual wSPYx is wrapped locally and a real router swap supplies the local USDC test balances. Independent prices and participant/asset review remain synthetic fixtures. The harness exercises API preparation, signatures, delivery, scheduled repayment, worker remainder, worker process restart and receipt/reorg recovery.

The market adapter is not consulted to repay an already accepted claim. The test makes market pricing unavailable after delivery while checking that the principal-plus-fee and worker remainder stay fixed. The complete actual-token rehearsal passed. [Saved evidence](evidence/stock-actual-repayment-fork.json) records 0.129938829541818989 wSPYx delivered against 100 USDC principal, 1 USDC fee, 101 USDC repaid to the funder and 399 USDC released to the worker from 500 USDC funded earnings. The escrow was paused before repayment. Recovery included a fresh worker process and a distinct reorg branch. The independent-price deviation and changed-runtime rejection checks also passed on this fork.

TypeScript, independent data/adapter guard tests, participant validation, stock offer/checkout/funder UI tests, browser-secret checks and the existing synthetic-token PostgreSQL regression passed. Source timestamps are checked against a clock refreshed after provider requests; advancing-clock tests cover evidence that expires during a fetch. Local fork RPC timeouts are longer to accommodate cold storage reads; the mainnet timeout remains seven seconds.

## Release work still required

Verify live provider responses and data entitlement during an open regular session, configure real review evidence, and measure adapter latency against the source-age budget. Finish pilot claim/tenor limits, implementation monitoring and security review. Then confirm the owner multisig and dedicated signers and finalize the paused deployment packet. No mainnet approval is implied by passing local tests.

## Provider contracts

- [Alpaca stock snapshots](https://docs.alpaca.markets/us/reference/stocksnapshots-1)
- [Alpaca adjusted historical bars](https://docs.alpaca.markets/us/reference/stockbars)
- [Alpaca US market calendar](https://docs.alpaca.markets/us/reference/legacycalendar)
- [Alpaca US market clock](https://docs.alpaca.markets/us/reference/legacyclock)
- [Kraken timestamped recent trades](https://docs.kraken.com/api-reference/market-data/get-recent-trades)

## Live connection preflight checkpoint

Run `npm run audit:stock-providers` with server-side configuration already loaded into the process. This is read-only; it emits only redacted status and public timestamps to [the preflight evidence](evidence/stock-provider-preflight.json). It never signs, broadcasts or sends a synthetic participant scope to a real review service. A blocked result exits nonzero.

The current process has no Alpaca key/secret, stock config or review authentication token. No `.env` or `.env.local` was found in this worktree or the checked production checkout. Hosting secrets were not inspected, so this does not establish their global absence. The public issuer endpoint responded successfully and reports trading closed, not halted. Kraken timed out under the adapter's seven-second budget, including the retry outside the sandbox. Independent live SPY pricing, SIP entitlement, review-service authentication and actual participant/corporate-action decisions remain unverified.

The issuer's reported next change is not a regular-US-session opening or permission to enable new offers. The independent clock/calendar must still confirm an open session. Mainnet remains disabled.
