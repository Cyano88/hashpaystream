# Cancellation and expiry audit - 2026-09-08

## Fixed in HashPayStream

- Confirmed agreement cancellation now appears in customer Requests and agreement history, including receipt access.
- Negotiation cancel/decline endpoints reject financially active or terminal requests and any request already bound to an agreement.
- Completed, cancelled, and refunded status cannot regress to funded because a later activation notification arrives.
- Payer lifecycle status, record, and recovery can finish after a terminal webhook arrives. New lifecycle challenges and delivery approvals remain blocked in terminal states; original customer identity and upstream capability checks remain enforced.
- A response with pending=false is no longer treated as proof of a return. Only lifecycleAction.status=confirmed can show funds returned. Failed/provider-failed/manual-review actions never show a successful refund.
- Standard agreements expose Cancel and return USDC only when the authoritative upstream cancellation policy says eligible. Circle confirmation remains required. The control is not exposed for early-pay terms.

## Verified policy and tests

The upstream reviewed escrow restricts payer cancellation to the configured cancellation window with no prior release. Expiry refunds return only totalAmount minus releasedAmount to the original payer. The upstream local payer cancellation and expiry-refund harness passes.

HashPayStream service-request tests cover terminal mutation denial, cancellation propagation, late activation events, customer-only review/recovery, and refusal of new financial actions after terminal events. Outcome tests cover explicit confirmation versus failures and pending=false without proof. Agreement gateway and customer-request ownership/capability tests pass. TypeScript passes; production build verification is recorded separately in the local build log.

## Still open

Early-pay cancellation/default handling requires a dedicated review: Arc payer refunds and X Layer advance recovery are separate. Upfront protection attestation checks active Arc state but does not currently check whether the payer cancellation window has closed. A released X Layer advance is not refundable through refundAdvance, which accepts only Funded positions. Hiding cancellation UI alone cannot resolve direct contract-call exposure. No contract changes or production-readiness claim are made by this application fix.

The existing real-USDC refund rehearsal remains Funded and unreleased. Its deadline is 2026-09-09 04:44:19 UTC / 05:44:19 Lagos. This audit performed no additional live financial action. The 0.20 USDC test funding cap is exhausted. Android has not been rebuilt for these UI changes.
