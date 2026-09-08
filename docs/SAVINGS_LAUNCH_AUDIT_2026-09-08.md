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

## Approved deployment and real canary result

The user approved deployment, 0.10 USDC principal and an aggregate 0.0001 OKB gas cap. This supersedes the pending-approval wording above.

- Deployed PersonalSavingsVault at `0x9D2ca9763503C99ac2F788B7743B8aE6840d6A06`, transaction `0x97991cc3a6ceb4b7318931ec0f0ffbf8c2473a4ce2dc946cbe82c7b32ad487e1`, block 70082826.
- Live runtime matches the reviewed compiler output with the native-USDC immutable inserted. All constants verified.
- Sourcify independently reports exact creation and runtime matches: https://repo.sourcify.dev/196/0x9D2ca9763503C99ac2F788B7743B8aE6840d6A06 . Official explorer UI verification was not separately established.
- The original frozen review manifest remains unchanged. Current deployment evidence is in `contracts/deployments/personal-savings-mainnet.json`.
- The actual UI canary exposed a readiness bug: the authenticated embedded wallet was present, but SDK global readiness also waited on external connectors. The corrected hook requires a unique connected embedded signer linked to the current authenticated account. Regression tests cover disabled connector readiness, account switching, signed-out sessions and ambiguous wallets.
- The configured production build passed and was served only inside the existing private Playwright session using local asset routing. Neither the public frontend nor Android has received the new local fixes.
- Public savings configuration was independently fetched and remains vaultAddress null, depositsEnabled false, status in_review. The session-only config override used the verified vault for the canary; it now also disables new deposits while retaining existing-plan reads.
- Exactly 0.10 USDC was approved and deposited through the UI. The PlanCreated event, native-USDC transfer, remaining balance, totalManaged and actual token balance all agree. The UI shows one plan and zero available for withdrawal.
- Deposit transaction: `0x75bd04a102edbd6aea92accdb1fd0cc2cd6d509760002361f692f16c8e56d489`.
- Plan: `0xb43c7f6842f09cc404a6f5f4df73e861ffbffcc8f86bef82e5408c97e2bf489b`.
- Emergency request transaction: `0x5966c408bf189a15abbc9eb9c873cb41961d18860e0f39105a2c500ee6a0d023`.
- Emergency exit becomes executable at **2026-09-10 07:35:49 UTC / 08:35:49 Africa/Lagos**. The timestamp is exactly 48 hours after the request block. Current early normal-withdrawal and early emergency-exit simulations reject as expected. These simulations broadcast nothing.
- Gas spent across deployment, gas-funding transfer, exact approval, deposit and exit request: **0.000026655341332767 OKB**. A separate 0.00001 OKB allocation was transferred to the canary wallet for gas; it is not an additional transaction fee and unspent allocation remains there.

### Resume after the real deadline

Do not create another plan or cancel/restart this emergency request. The approved 0.10 USDC canary principal is already locked in the vault. Recheck chain timestamp, source/runtime, owner, remaining amount and aggregate gas budget. Use the existing owner wallet to execute completeEmergencyExit for the recorded plan once mature. Verify a successful receipt, exact 0.10 USDC return to that owner, remaining == 0, totalManaged == 0 and the UI update. Public launch remains disabled until the real exit and remaining launch checks pass.

Ignored local operator helpers and evidence are under `output/playwright/savings-*`. The JSON deployment record above provides the durable public chain facts. Local test wallet uses the existing `trade-seller-release` browser session; the repaired frontend and paused canary configuration are session-only overrides. Three transient browser RPC 403 responses were observed during transactions; reads and receipts subsequently recovered. This canary does not establish uninterrupted RPC availability or completed end-to-end withdrawal/receipt coverage.

## Production web hardening follow-up

The user authorized shipping audited bug fixes while the canary timer runs. Public savings deposits remain disabled.

A further state-isolation audit found that a wallet or vault change could leave the previous plan snapshot visible while wallet initialization was pending. Savings now exposes plan balances only when their loaded owner/vault scope matches the current scope, and deposit readiness additionally requires the current connected wallet. The executable hook regression covers account changes, vault changes and delayed responses. This adds no contract or monetary operation.

The web release includes the previously tested exact interval wording, vault-bound event confirmation, truthful uncertain-transaction errors, embedded signer readiness, source/deployment records and the new plan isolation fix. The canary's 48-hour deadline and principal are unchanged. Android binaries are a separate release artifact and are not generated by a web deployment.

Release validation: TypeScript and the production-configured build passed. The smoke command passed every preceding suite, including both new savings regressions, then found a stale final surface assertion expecting the pre-refund button guard. Updated that assertion to require the existing refund-readiness guard; the final surface suite then passed. No application code changed after the successful production build.
