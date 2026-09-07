# Agreement walkthrough - 2026-09-08

## Completed isolated rehearsal

The existing reviewed-contract integration harness passed with current application code and the reviewed V2/V4 artifacts. All wallets, tokens and chains were synthetic and bound to loopback; inherited production wallet/provider variables were excluded from the child nodes.

Verified underwriting, provider funding consent, funding into V2, protected advance release, exact V4 funder/provider/treasury balance changes, rejected legacy signatures, immutable treasury enforcement, replay prevention, and exact refund after the protection deadline.

The walkthrough now executes the real settlement worker against the local contracts. It saves its checkpoint to a temporary disk journal, submits one real local EVM transaction, verifies the receipt/event after a second block, then deliberately fails the state write. A fresh pass reads the journal and recovers the transaction evidence from the local router logs. Broadcast count stays exactly one; a subsequent pass has no eligible settlement remaining. The provider completion and repayment source are simulated; this does not validate the external provider or bridge.

## External walkthrough gate

Read-only checks confirm the configured networks remain X Layer mainnet (196) and Arc testnet (5042002). Both reviewed contracts are paused. The embedded worker and automatic-settlement flags remain explicitly false. This rehearsal did not allowlist a funder, unpause a contract, move external funds or send notifications.

Before any external transaction, establish the authorized spending cap and the user-controlled customer/provider/funder wallets. The X Layer leg uses real USDC while the Arc leg uses test assets. Record the exact agreement terms, expected split and refund amounts, and owner-approved contract controls for that scope. Browser wallet control currently fails with Windows sandbox error 1344, so the live signing screen has not been verified.

The local funding-to-split/refund and disk-journal recovery checks are complete. Public-network execution, external delivery review and final wallet receipt sharing remain unverified.
