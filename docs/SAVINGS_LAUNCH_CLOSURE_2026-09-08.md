# Savings launch closure audit - 8 September 2026

## Verified now
- Deployed PersonalSavingsVault runtime matches reviewed bytecode. Frozen source manifest check passes. No contract changes.
- 21 savings contract tests pass: deposit validation, reentrancy, ownership, pagination, exact scheduled releases, emergency delay/cancellation and partial/final withdrawal accounting. The separate cohort contract remains outside the personal savings UI.
- Live chain at block 70093306: canary remaining 100000 USDC units, withdrawable zero, totalManaged 100000. Emergency exit remains 10 September 2026 07:35:49 UTC. No new funds moved.
- Earlier unreleased funding position remains funded with 100000 units and cannot yet refund. Deadline 9 September 2026 04:44:19 UTC; refund requires chain time after the deadline.
- Production health/readiness return 200. Public savings vault unset and deposits disabled.

## Fixed in this pass
1. Reproduced: malformed optional receipt history trapped an otherwise verified transaction in pending recovery. The damaged index is preserved under a recovery key before rebuilding the recent index from verified chain evidence.
2. Receipt-storage failure after chain confirmation now states that the transaction is confirmed and saving failed. Its hash remains protected for retry without resubmission.
3. Web Locks serialize savings operations across same-origin browser tabs. Busy tabs fail immediately instead of queuing another financial action. Existing module lock remains the fallback where Web Locks is unavailable.

Regression tests cover the actual failure, independent module instances competing for the browser lock, receipt-storage quota failure, retained hashes and no-resubmit recovery.

## Remaining launch gates
- Perform and verify the real savings emergency withdrawal at maturity: successful receipt, exact USDC return, zero remaining balance and consistent totalManaged. Export that actual withdrawal receipt.
- Keep public savings disabled until the real exit succeeds. Do not cancel/restart the request or create another canary.
- Execute the separate earlier funding refund after its deadline.

## Explicit limits
Receipt references and pending recovery are device-local; no cross-device coordination or historical backfill. A provider failure before it returns a transaction hash is outside hash-based recovery. Cross-tab exclusion requires browser Web Locks; the native single WebView retains the module lock. Device time can affect emergency button availability, but the contract simulation and chain enforce the delay. Server configuration pauses the UI deposit path, not this immutable contract. Withdrawals require the owner wallet and X Layer gas. No automated time-based withdrawals are claimed.
