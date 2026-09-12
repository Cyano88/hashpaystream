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

The current production adapter implements Pyth Pro or explicitly selected Alpaca SIP. Twelve Data remains evaluation-only. Saving a Twelve Data key does not configure Pyth or switch providers. Missing authenticated access cannot be fixed by waiting for Monday. Do not silently fall back, invent prices or treat the low-cost evaluator as an implemented risk adapter.

3. After the reference has actually passed, run a contemporaneous read-only X Layer route audit:

```powershell
node scripts/stock-token-market-audit.mjs
```

This refreshes stock-token-market-audit.json, not the pinned stock-dex-exit.json fixture. It checks route/token identities and quotes multiple exit sizes. Independent-reference comparison must use correctly denominated values whose source times satisfy the same freshness window. Sequential command results are not automatically contemporaneous, and the current Twelve Data evaluator does not implement the complete production DEX comparison. That integration remains work after provider verification.

4. When live-reference integration changes, run the local repayment rehearsal:

```powershell
npm.cmd run test:stock-pyth-repayment
```

This uses a local X Layer fork and isolated local PostgreSQL with synthetic price/participant evidence. Its last verified result was fixed 101 USDC repayment to the funder and 399 USDC remainder to the worker, including restart/reorg recovery. It is not a live-worker or production-price rehearsal. No need to repeat the unchanged long rehearsal merely because the market opens. Any replacement provider needs its own equivalent integration coverage before claiming this test verifies it.

## Boundaries and next implementation

No background task or automatic run was scheduled. No mainnet transaction, deployment, provider switch or production configuration change occurred. Do not load production database or wallet credentials for these diagnostics.

The next gate is observed regular-session provider freshness/history plus a decision on a usable reference provider. The remaining production work includes adapter completion for the selected accessible provider, real participant/corporate-action evidence, approved limits, owner/multisig and distinct risk signer, security review, and the paused deployment packet. Kraken weekend snapshots did not meet freshness requirements and remain unsuitable for acceptance based on the captured evidence.
The live configured-adapter preflight was also repeated at 15:39 UTC: Pyth feed metadata verified, issuer closed and not halted, Pyth key absent, participant review endpoint/authentication absent. Evidence: evidence/stock-provider-preflight.json. These are verified local-process configuration results, not an audit of Render environment variables.