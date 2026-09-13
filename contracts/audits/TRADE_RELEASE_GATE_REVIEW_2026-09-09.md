# Trade release-gate audit - 2026-09-09

Status: local review candidate. No deployment or public payment enablement.

## Current result

All 89 contract tests passed, including 30 new Trade audit cases. The TradeEscrow and TradeEscrowFactory source files match their existing review-manifest SHA-256 values byte for byte. No payout defect was reproduced and neither contract was modified in this pass. Passing tests do not establish complete exploit coverage or replace independent review.

New tests cover issuer-paused funding with allowance/state rollback, an arbitrator split where the second recipient is blocked (the first transfer rolls back too), paused inspection payout without false terminal state, last-second versus exact-deadline disputes/dispatch, a dispute remaining frozen a year later, and 24 fixed-seed generated accounting scenarios across eight terminal paths. The accounting cases check exact principal/donation conservation, terminal-state permanence, no payout replay and one settlement event. The restriction token is a test model, not a replica of deployed USDC. These are bounded generated tests, not exhaustive stateful fuzzing.

Fresh static analysis from clean compiler artifacts completed with nine findings: one high balance/reentrancy heuristic, seven low timestamp notices and one informational pragma notice, matching the prior detector classes. These remain disclosed for independent review.

Binding and preflight suites pass against the newly generated local contract-wallet/runtime fixture. A generic contract wallet is not proof of live Circle execution, paymaster behavior, wallet recovery or multisig policy.

## Remaining release blockers

1. Independent reviewer disposition against the exact source and dependency hashes, including the retained high-severity Slither balance/reentrancy heuristic. Source is guarded by nonReentrant, checks the actual balance increase and rolls back short/failed funding; the detector is not suppressed or declared externally cleared.
2. Nominate the dispute multisig address and network. Verify deployed code, signers/threshold, signer separation, modules/guards and recovery procedures. No nominated address or approval was found in the recorded Trade review state. A bare address alone does not establish multisig safety.
3. Approve and verify a deployment profile: correct chain, canonical asset, token issuer restrictions/upgrade controls, exact factory/escrow code, immutable dispute authority and role separation. The factory intentionally fixes its authority; do not assume it can be changed on existing escrows.
4. Implement and test escrow creation/acceptance, Circle challenge idempotency and funding receipt reconciliation. Wallet selection/reservation UI is present; actual payment submission and settlement UI are still gated. Include response loss, expired sessions, delayed confirmation and reorg handling.
5. Verify testnet happy path, missed dispatch refund, disputed refund/release/split, mutual settlement, silent-buyer escalation, cancellation races and issuer-restricted failures through the actual app and designated authority before public payment enablement.

The existing database reservation prevents normal item reassignment after checkout is bound. It must not be released merely because a request or timer expired. A confirmed terminal/unfundable escrow proof and consistent server reconciliation are required.

## Proposed dispute operating process (not yet an approved customer promise)

- Use a multisig with multiple independently controlled signers; propose 2-of-3, subject to network support and operator selection. No new custom multisig contract is part of this review.
- Acknowledge a submitted case within one business day; target an initial evidence review within three business days, and publish updates at least every seven days while unresolved. These targets need a staffed owner before launch.
- Preserve the accepted listing/terms, dispatch evidence, receipt/dispute times, buyer and seller evidence, and the precise proposed buyer/seller allocation. A second operator reviews the allocation before multisig execution.
- Verify escrow identity, chain, amount, disputed state and decision evidence immediately before signing. Confirm the resulting on-chain settlement before changing app status.
- Return shipping and item-condition disagreements require evidence review. Logistics claims do not prove receipt or automatically authorize payout.
- Issuer freezes may block payouts; do not mark a reverted settlement complete. Restore normal settlement only when the token permits it. Do not promise the platform can override token restrictions.
- If the arbitrator is unavailable, parties may use mutual settlement or seller full refund where allowed. If they disagree, funds can remain locked; never silently award one side a timeout win.

## Combined review scope

The generated bundle includes every current production Solidity source, including PersonalSavingsVault, LockedSavingsCohortVault, both Upfront versions, both Arc routers, TradeEscrow and TradeEscrowFactory, with all local contract tests and test helpers. Review custody and shared-asset/trust boundaries together. Trade does not borrow from savings or inherit the advance repayment split. The separately hosted upstream agreement implementation is not reproduced by these files.

Selected Trade API/UI source is included as integration reference, not a standalone runnable app. The bundled Hardhat harness has no deployment networks, no key loading and only local test/compile commands. No environment files, credentials, production database contents or browser/session artifacts are included.
