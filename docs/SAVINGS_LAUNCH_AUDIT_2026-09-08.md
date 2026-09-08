# Savings launch audit - 2026-09-08

Scope: production hardening of the current personal savings flow. No contract deployment, deposit, withdrawal or live configuration change was performed.

## Verified state

The public savings configuration returned chain 196, native X Layer USDC, null vaultAddress, depositsEnabled false and status in_review. This confirms savings is unavailable in the live app; it does not prove no vault exists elsewhere.

PersonalSavingsVault passes its review manifest verifier. Its contract is non-upgradeable and has no administrator withdrawal method. Plan owners withdraw unlocked funds themselves. Weekly means 7 days; monthly means 30 days. Emergency access requires a 48-hour wait and an owner transaction. This flow does not automate wallet payouts or earn interest.

Both local savings suites passed: 9 PersonalSavingsVault tests and 12 LockedSavingsCohortVault tests. The cohort product has different penalty/reward terms and is not the contract used by this personal savings UI. Passing tests is not a substitute for external audit approval or deployed bytecode verification.

## Changes

- Replace uncertain transaction errors that claimed no funds moved with instructions to check wallet and savings before retrying.
- Accept confirmation events only from the configured vault.
- Show exact 7/30-day intervals and explain user-triggered withdrawals.
- Validate loaded plan ownership and invalidate pending reads on effect cleanup.
- Normalize Windows line endings in the runtime test harness.

Validation: Production build, TypeScript, savings schedule, savings config, runtime cache/offline/remount checks and the review manifest verifier passed. Both local contract suites passed (21 tests).

## Remaining launch gates

- Tie the auditor approval to this exact PersonalSavingsVault source and dependency manifest.
- Review and authorize deployment separately; verify chain, asset and deployed runtime bytecode before assigning the production vault address.
- Run the complete wallet deposit, scheduled withdrawal and 48-hour emergency exit rehearsal with a separately authorized funding limit.
- Verify receipts and balance changes through the actual wallet UI, including confirmation timeout recovery. This audit did not establish end-to-end receipt coverage.
- Enable deposits only after those checks. Early pay remains excluded from launch; its pending refund is a separate tracked task.

## Follow-up: auditor package and read-only deployment preflight

The Desktop combined auditor ZIP `HashPayStream-combined-contract-audit-2026-09-06.zip` contains the exact current LF-normalized PersonalSavingsVault source and package-lock. Its context deployment script also matches. Compiler settings agree: Solidity 0.8.24, optimizer 200, viaIR true, effective EVM Paris. The Hardhat file differs in network configuration. Auditor approval is user-reported; the source correspondence is independently checked here, not an independently obtained audit verdict.

`scripts/savings-deployment-preflight.mjs` performs read-only checks without loading any wallet keys. It validates the review manifest source/dependency hashes, compiled source and settings, artifact bytecode consistency, live chain and token, and estimates deployment gas. It derives a candidate deployer from the recorded previous escrow deployment transaction; that does not authorize its use for savings.

At 2026-09-08T07:10:34Z, X Layer block 70082396:

- Candidate deployer: `0xAeAEA86026c820934EFfC356B94bC3092efA9eb6`.
- Pending nonce: 8; predicted vault: `0x9D2ca9763503C99ac2F788B7743B8aE6840d6A06`.
- Estimated deployment gas: 973813; estimate: 0.000019476260973813 OKB.
- With 20 percent gas buffer: 0.000023371501168575 OKB; candidate balance was sufficient.
- Address and estimate must be rechecked immediately before deployment because nonce and fees can change.
- No transaction was signed or broadcast. App savings configuration remains disabled.

Proposed next execution scope, pending user approval: deploy the matched personal savings vault using the candidate deployer; cap aggregate savings deployment/canary gas at 0.0001 OKB and the canary principal at 0.10 USDC. Verify runtime/source, keep public deposits disabled, create a minimal weekly plan, verify exact transfers and accounting, then test the real 48-hour emergency exit. The earlier aggregate 0.20 USDC test allowance is exhausted and cannot fund this canary without fresh approval. Local tests cover scheduled releases; a live normal release requires the actual 7-day schedule.
