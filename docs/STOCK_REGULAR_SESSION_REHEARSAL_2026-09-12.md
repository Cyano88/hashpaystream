# Regular-session stock rehearsal - 12 September 2026

## Verified checkpoint

Worktree: C:/Users/USER/hashpaystream-stock-early-pay-20260910. The saved Twelve Data credential successfully accessed SPY and USDC on 12 September at 15:38 UTC. SPY reported market closed. USDC met the evaluator's 15-second timestamp limit in this sample, but timestamp semantics and venue identity remain unverified. The evaluator now skips current-session history unless the SPY quote passes its identity, freshness and regular-session checks. Closed-session access takes two requests, not three. Regression tests passed.

The next scheduled NYSE Arca core session is Monday 14 September 2026, 09:30-16:00 America/New_York (14:30-21:00 Africa/Lagos). Start the history evaluation at 14:40 Lagos, allowing more than the six completed minutes required by the existing checks. Recheck live market/session status on the day; the scheduled window is not evidence the market is actually open.

Official calendar: https://www.nyse.com/trade/hours-calendars (checked 12 September 2026).

## Exact operator sequence

Run in the worktree using Node 22. Keep the existing ignored .env.local file private.

1. Run the low-cost provider evaluation:

```powershell
node --env-file=.env.local --import tsx scripts/stock-twelve-data-evaluation.mjs
```

Require observed SPY and USDC quotes plus contiguous completed current-session minute history. The tool intentionally remains productionReady=false even if those checks pass: prior-session history, source timestamp semantics, venue identity, corporate actions, exchange calendar and commercial entitlement still need resolution. A blocked exit is an evidence result, not permission to loosen limits.

2. Run the actual configured adapter preflight separately:

```powershell
node --env-file=.env.local --import tsx scripts/stock-provider-preflight.mjs
```

Twelve Data is now the default independent-reference adapter. It reads the server-only key from `HASHPAYSTREAM_TWELVE_DATA_KEY`, pins SPY to ARCX/USD and USDC/USD to Binance, requires fresh source timestamps and complete current-session bars, and fails closed outside the reviewed 2026-2028 NYSE calendar. It has no silent provider or DEX-price fallback.

3. After the reference has actually passed, run a contemporaneous read-only X Layer route audit:

```powershell
node scripts/stock-token-market-audit.mjs
```

This refreshes stock-token-market-audit.json, not the pinned stock-dex-exit.json fixture. It checks route/token identities and quotes multiple exit sizes. Run the configured adapter preflight and route audit close together; sequential results are still separate observations and do not prove an atomic production decision.

4. When live-reference integration changes, run the local repayment rehearsal:

```powershell
npm.cmd run test:stock-twelve-data-repayment
```

This uses a local X Layer fork and isolated local PostgreSQL with synthetic Twelve Data and participant evidence. It passed with fixed 101 USDC repayment to the funder and 399 USDC remainder to the worker, including restart/reorg recovery. It is not a live-worker or production-price rehearsal. The Monday step should exercise the read-only live adapter, not repeat this unchanged integration test.

## Boundaries and next implementation

No background task or automatic run was scheduled. No mainnet transaction, deployment, provider switch or production configuration change occurred. Do not load production database or wallet credentials for these diagnostics.

The next gate is observed regular-session Twelve Data freshness/history and contemporaneous X Layer quote evidence. Production still requires data rights and capacity, real participant/corporate-action evidence, approved limits, owner multisig and distinct signers, security review, and the paused deployment packet.

The live configured-adapter preflight was repeated at 21:05 UTC. It reached the issuer and Twelve Data but correctly failed the independent-reference check because the stock session was closed; participant review was also not configured. Evidence: `evidence/stock-provider-preflight.json`. This describes the local process, not Render environment variables.
