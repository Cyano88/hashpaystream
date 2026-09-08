# Savings receipt and recovery audit - 8 September 2026

## Confirmed issues and fixes

- Receipt timeouts previously discarded the returned transaction hash and allowed the form to submit again. The saved pending transaction is now scoped to chain, owner, vault and asset. A retry verifies that hash and its original intent, including after reopening. New plan actions are disabled while a saved transaction is unresolved; a Check transaction entry remains available when deposits are paused and the vault remains configured.
- Withdrawal confirmations previously matched event identity without validating the amount or exact USDC transfer. The shared verifier now checks transaction hash, sender, target, status, vault event, plan/amount and native-USDC transfer direction/value. Approval checks require the exact owner, spender and allowance event. Confirmation waits require two blocks.
- Refresh errors after a verified receipt no longer turn success into an apparent transaction failure. Refreshes run independently after confirmation.
- Confirmed reverts clear the saved attempt. Timeouts and mismatched receipts retain it. Fee replacements track the replacement hash; confirmed wallet cancellations/replacements clear the superseded attempt without calling it a successful savings operation.

## Validation

Synthetic receipt tests cover correct and wrong transfer amounts, missing transfers, wrong emitter/sender/target/hash/plan, normal withdrawal, emergency completion and allowance receipts. Recovery tests cover timeout, reopened module/device-local cache, original-intent preservation, mismatched receipt retention, confirmed revert, user rejection, unavailable storage, concurrent duplicate clicks, fee replacement and confirmed cancellation. The rendered deposit component test covers recovery with deposits paused and empty fields, no wallet write, a recovered withdrawal labelled correctly and a failed balance refresh after confirmation. Existing savings runtime and plan-isolation regressions and surface checks pass.

## Limits and launch state

No live transaction was sent for this audit. The existing 0.10 USDC canary and its 10 September 08:35:49 Lagos emergency-exit deadline are unchanged. Public deposits remain disabled.

Recovery is device-local and applies after the wallet returns a transaction hash. It is not server reconciliation, recovery after clearing device storage, cross-device coordination, or a guarantee about a wallet transport failure before it returns the hash. Clearing the configured vault also hides that vault's recovery UI; retain the address with deposits disabled when existing users need access. The current public address is intentionally unset during the private canary.

There is no dedicated savings PDF/image export route in the current receipt code. This audit verifies on-chain receipts and UI confirmation/recovery, not a nonexistent export flow. The real mature emergency withdrawal still needs its scheduled canary check.
