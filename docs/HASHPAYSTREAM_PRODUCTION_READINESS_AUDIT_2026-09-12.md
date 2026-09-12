# HashPayStream production-readiness audit - 12 September 2026

## Decision

The candidate can be synchronized into the shared web/Capacitor codebase for continued private testing, but it is not cleared for public money movement. Keep Trade funding and stock acceptance fail-closed. Do not deploy or unpause TradeEscrow, TradeEscrowFactory, or StockEarlyPayEscrow with public funds until the blockers below are closed.

## Verified in this audit

- Candidate worktree: `feat/stock-early-pay-20260910` at `55248c4`; clean before validation.
- Production worktree: `release/production-20260907` at `98b485e`; clean and separately ahead of `origin/main`. Integration requires a reviewed reconciliation of both histories.
- Production TypeScript/Vite build passed. Rollup reported existing annotation, `eval`, and large-chunk warnings.
- All 103 Solidity tests passed, covering savings, advances, stock early pay, Trade escrow, issuer restrictions, replay, deadlines, accounting, reentrancy regression cases, and contract-wallet behavior.
- Trade binding, runtime preflight, wallet verification, cache, preview, and readiness tests passed.
- Android readiness, account isolation, native receipt sharing, navigation/back behavior, cleartext blocking, and backup exclusion checks passed.
- Android release packaging correctly failed closed because all four upload-keystore environment variables are absent.
- `npm audit --omit=dev --audit-level=high` reported no high/critical findings and 21 moderate transitive findings. Remediation requires a controlled dependency update; the suggested forced fix includes a breaking Privy change.
- Trade PostgreSQL-backed backend/community tests could not run because the isolated local PostgreSQL harness was unavailable at `127.0.0.1:55439`. This is an incomplete validation item, not a passing result.

## Trade Agreement verdict

The pre-payment agreement UI/data layer is suitable for continued private testing. It is not production-ready as a protected checkout. Current code intentionally returns `fundingEnabled: false`; there is no approved deployment profile or connected payment adapter. Dispatch, receipt, inspection, dispute, return, refund, payout, reconciliation, and recovery still need end-to-end verification through the real app.

## Blocking gates

1. Obtain an independent external review of the exact contract source and dependency hashes, including disposition of the retained high-severity Slither balance/reentrancy heuristic.
2. Nominate and verify the dispute multisig: chain, address, owners, threshold, signer separation, modules/guards, recovery, and staffed dispute procedure.
3. Approve a deployment profile for canonical assets, issuer controls, factory/escrow bytecode, immutable authority, roles, caps, and pause state.
4. Implement Trade escrow creation/acceptance, authenticated wallet ownership, durable item/funding reservation, idempotent wallet challenge, receipt reconciliation, and recovery from response loss, expiry, delayed confirmation, and reorgs.
5. Complete real PostgreSQL Trade regression tests and actual-app lifecycle rehearsals for happy path, cancellation, missed dispatch, dispute outcomes, mutual settlement, silent buyer, and issuer-restricted transfers.
6. Close stock launch gates: provider/commercial eligibility, independent timestamped price and market-session evidence, executable X Layer liquidity, corporate-action/risk limits, deployed-code verification, operator separation, monitoring, and capped pilot policy.
7. Configure and protect the Android upload keystore, increment release metadata when packaging, sync the audited web bundle, build a signed AAB, and run physical-device authentication, wallet, deep-link, offline/recovery, and transaction-confirmation tests.
8. Resolve or formally accept the moderate dependency advisories after testing supported upgrades; address the oversized web bundles before broad mobile rollout if startup performance is poor.

## External-audit requirement

Yes. Before public testing with real customer funds, the custody contracts need an independent external audit. Internal tests and Slither are useful evidence but are not adequate clearance for contracts that hold USDC, savings balances, or tokenized-stock inventory. A private, no-funds UI rehearsal can proceed while funding stays disabled. A capped allowlisted mainnet pilot should begin only after audit findings are remediated, deployment bytecode is verified, multisig operations are live, and end-to-end reconciliation passes.
