# Trade escrow candidate: review required

Status: LOCAL / UNDEPLOYED / NOT CONNECTED TO CHECKOUT.

## Why a separate contract

The inspected Hash PayLink ArcAgreementEscrow source permits the operator to releaseStep while Active, before expiry, with a nonzero evidence hash and the next schedule step. It does not implement an on-chain buyer receipt, inspection period or dispute state. The upstream operator-action module implements application-level disputes. These facts do not establish that its live deployment can enforce physical-goods protections. No existing service agreement or savings contract was modified.

## Candidate flow

Seller creates an escrow through TradeEscrowFactory, which fixes the token and arbitrator and rejects a second escrow for the same seller/buyer/offer. Seller explicitly accepts the terms hash. Buyer funds that exact hash and amount before the funding deadline. Funding uses transferFrom and exact balance delta; unsolicited transfers are not funding.

Seller records dispatch before the dispatch deadline. This neither proves receipt nor releases funds. The buyer can confirm receipt and start the agreed 24/48/72-hour inspection window, or explicitly approve release. After a buyer-acknowledged inspection window expires, release is permissionless. A buyer dispute must be included on-chain before that deadline; the UI must disclose this and provide adequate transaction margin.

No dispatch by the deadline permits a buyer refund. Once dispatched, an unresponsive buyer does not produce an automatic refund or payout: the seller can escalate after the delivery deadline. A timely buyer dispute freezes releases. The configured arbitrator can then refund, release or split the original principal. Seller voluntary full refund is available, including during a dispute. Terminal payouts cannot be replayed. Donations can be recovered only by the buyer without touching outstanding principal.

For pickup, markDispatched represents a handover appointment, not proof of collection. A dedicated UI label is needed before integration.

## Explicit unresolved policy and integration gates

- Arbitration is trusted. An unavailable arbitrator can leave disputed funds locked; no arbitrary timeout winner has been invented. Recommend an operated HashPayStream dispute process backed by a multisig, subject to the user's selection, documented response targets and key-recovery procedure. This candidate is not production-ready without that policy.
- Return terms and evidence are handled through arbitration and seller refunds. There is no autonomous return-shipment state or carrier verification.
- The current off-chain Trade offers do not yet obtain consent to automatic inspection expiry release or arbitration trust. They cannot be funded through this candidate as-is. A new terms version and explicit bilateral consent are required.
- A delivery window is a new explicit term. It must be shown and accepted; it cannot be silently inferred from the existing dispatch deadline.
- A reviewed adapter must bind the accepted offer, complete snapshot digest, buyer/seller verified wallets, factory, code identity, token, chain, amount, quote expiry and arbitrator. The existing two-decimal agreement currencies do not authorize a fiat-to-USDC conversion.
- Global item exclusivity still needs the server listing lock and a durable funding reservation. The factory prevents duplication only within its own address for the same seller/buyer/offer; it cannot prevent a seller listing the item under another identity or offer.
- No platform fee is implemented. Existing split/early-pay economics are not imported into Trade.
- Only a reviewed standard USDC asset should be configured. Fee/rebasing tokens and token pause/blacklist behavior need explicit deployment checks and tests.
- No factory deployment, wallet key, arbitrator address, chain switch, live funds or public payment CTA was created.

## Validation

Local Hardhat: 13 candidate tests and 55 total contract tests pass. Cases include exact funding/terms and role checks, replay prevention, donations, funding expiry, dispatch deadline boundary, buyer-only receipt, inspection timing, dispute freeze, arbitration authorization and split accounting, silent-buyer escalation, voluntary refund, duplicate factory creation and invalid configuration. Existing service/savings suites pass unchanged.

This is an implementation review candidate, not an external security audit. Additional contract-wallet, fuzz/invariant and independent security review is required before any deployment.

## Static analysis disposition

Slither completed successfully after the funding-source clarification. Nine findings remain: one high-severity balance/reentrancy heuristic, seven deadline/timestamp notices and one informational mixed-pragma notice. This is not a zero-findings audit.

The balance check intentionally compares the actual incoming token delta. fund is nonReentrant, is buyer-only, transitions state before calling the token and rejects any short transfer atomically. The callback and short-transfer regressions pass. Retain the high-severity finding for independent review rather than suppressing it. Deadlines intentionally use block timestamps with daily-scale windows; exact boundary tests cover dispatch and inspection expiry. Compiler configuration pins Solidity 0.8.24, compatible with imported OpenZeppelin ^0.8.20 pragmas.

Sanitized detector output is in trade-escrow-static-findings.json. The earlier arbitrary-from warning was removed by expressing the funding source as msg.sender under onlyBuyer, without changing the authorization boundary.
