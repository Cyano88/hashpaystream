# Trade escrow preflight - 9 September 2026

Status: local implementation, no public funding endpoint or deployment.

The new verifier compares the target escrow and factory against trusted compiler runtime templates. Only compiler-declared 32-byte immutable slots are normalized. Every copy of each immutable must contain the same value; otherwise altered payout instructions could hide behind a correct getter. All other runtime bytes, including metadata, must match. Templates and immutable masks must come from a pinned trusted build/review profile, never from the user request or the target RPC.

The verifier checks the configured network, factory registry entry for the exact seller/buyer/offer key, factory token and arbitrator, and all eleven immutable escrow terms. It reads code and terms at a single block one behind the observed head, then rechecks the block hash and chain. It also reads head state and rechecks the head block hash. A newer lifecycle state is returned as state_confirmation_pending; funded and closed escrows are never classified as unfunded. Funding expiry uses the observed head timestamp, so a still-valid older snapshot cannot hide expiry at the head.

The result always keeps fundingEnabled false. It is an internal verification primitive, not authentication, wallet ownership proof, user approval, payment-intent reservation, factory allowlisting or external audit clearance. No current deployment has been verified by this turn. The authenticated checkout adapter and a trusted approved deployment profile remain outstanding.

## Validation

- Local Hardhat contract-wallet fixture executes seller factory creation and acceptance, buyer ERC20 approval and escrow funding, seller dispatch, buyer receipt and release. Wrong controller access and direct EOA impersonation of the wallet fail. This is generic contract-wallet execution, not a live Circle SDK, user-operation, sponsorship or authentication test.
- Preflight tests consume actual deployed local EVM runtime/code/constructor fixtures through an injected read interface. They reject changed terms, altered code, inconsistent immutable copies, wrong factory registration, network mismatch, reorg, expired funding, malformed masks and missing expected fields. They distinguish an unconfirmed funding state from another opportunity to fund.
- 59 full contract tests pass. Focused preflight tests and TypeScript pass. No production contracts or balances changed.

Source: api/trade-escrow-preflight.ts. Reproduce with npm run test:trade-escrow-preflight. The command first regenerates the synthetic local EVM fixture, then tests the reader against it.
