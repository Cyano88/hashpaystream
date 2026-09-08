# Pocket production audit - 8 September 2026

## Fixed
- Circle transfer hashes were presented as confirmed without verifying the chain receipt. Circle and X Layer sends now wait for two confirmations and verify the exact token, sender, recipient and amount from USDC Transfer events before success.
- Interrupted X Layer sends retain the returned hash and original intent. Circle transfers persist an idempotency key before preparation and retain the same challenge/transaction references for recovery. Check transfer resumes the saved operation rather than preparing a new payment. Module locks and available browser Web Locks prevent overlapping operations.
- Delayed Pocket-ID resolution cannot populate a recipient after the ID or mode changes. Amount precision is validated and rapid duplicate send taps are guarded synchronously.
- Circle provider state resets by authenticated identity/email; old asynchronous API requests and approval continuations cannot use a new account's context. Send forms reset on account change.
- X Layer balance reads are bound to identity and wallet address, with older overlapping RPC responses rejected.
- Activity previously required direct ERC-20 transaction calldata, which excluded Circle smart-account execution. Recording now validates one exact owner USDC event, canonical receipt, network and confirmations; timestamps come from the block. Existing transfer replay is participant-only.
- Pending Activity references now use a wallet-specific queue rather than one global overwrite slot. Legacy references remain recoverable through the authenticated recorder. Activity outages do not turn confirmed sends into failures.

## Evidence
Regression tests cover exact/missing/wrong-token events, amount mismatch, timeout/reopen recovery without resubmission, Circle preparation response loss with stable retry key, failed transactions, recipient edits during lookup, duplicate taps, Activity outage/queue isolation, out-of-order balances and transfer-record access control. Existing Circle session/ownership/router tests pass. The exact event verifier also passed read-only against the completed Arc rehearsal receipt at block 61018691; this was not a new transfer.

Full application smoke, TypeScript/build and Android checks are recorded in the release package. No contracts, public savings configuration or early-pay containment were changed.

## Remaining limits
No new live wallet transfer was authorized or submitted during this audit. Recovery records and Activity retry references are device-local and are lost if storage is cleared. X Layer recovery starts once the wallet returns a transaction hash; a provider failure before that point is not resolved by hash recovery. Circle recovery may reopen the original approval challenge; it does not create a new payment intent. Arbitrary multi-transfer batches are rejected by Activity if more than one owner USDC transfer is present. Activity is not a complete external-wallet chain-history index. Timed savings and earlier funding refund checks remain pending.
