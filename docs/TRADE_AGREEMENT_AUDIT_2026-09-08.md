# Trade agreement audit - 8 September 2026

## Outcome and scope

The audited baseline supports discovery, seller listings, participant-isolated enquiries, blocking, reports and moderation. It has no Trade offer record, buyer acceptance, item reservation, payment-to-listing binding, or physical-goods fulfillment/dispute lifecycle. The existing agreement gateway delegates service agreements to an upstream service; it is not evidence that physical-goods escrow is ready.

This change implements the pre-payment terms layer inside the existing enquiry, using the existing Postgres service and confirmation/select components. It deliberately exposes no payment operation. No contracts, balances, wallets, provider configuration or production data are changed by this implementation.

## Recommended complete flow

1. Buyer opens an enquiry from the item. Both parties discuss condition, defects and handover.
2. Seller proposes an immutable offer: item price, explicit delivery cost, currency, pickup/delivery area, proposed carrier, handover deadline after confirmed funding, inspection period and return terms. Freeze the listing revision, description and photos. An offer expires after 24 hours.
3. Buyer reviews and explicitly accepts that offer. Changed listings require new terms. Serialize acceptance per item so competing buyers cannot both accept. Before funding, either participant can cancel without claiming a refund.
4. Add an authenticated funding handoff only after the existing escrow has a verified physical-goods adapter. Bind the accepted offer ID and terms digest to buyer/payer identity, verified seller payout wallet, chain, token, exact settlement amount, quote expiry and one escrow record. NGN/USD are display/agreement currencies, never implicitly USDC or a 1:1 conversion. Client status cannot prove funding. A retry must recover the same funding intent.
5. Seller dispatch becomes available only after exact funding confirmation. Record carrier/tracking evidence or a pickup handover record; a seller or carrier delivery assertion alone must not release money.
6. Buyer confirms receipt and inspects against the preserved condition. Show the deadline and release consequence clearly. A buyer issue raised within the supported period prevents automatic release. The current contract must be checked for that capability before promising it.
7. Buyer approves release, or follows the verified dispute/return path. Returns need reason, evidence, responsibility for return costs, deadline and receipt handling. Administrative moderation is not escrow arbitration. Do not present automated intelligence as final dispute authority.
8. Completion/refund requires a matching confirmed transaction and durable Activity/receipt records. Contract timeout and non-delivery recovery must remain accessible when chat is blocked or a listing is hidden.

## Implemented safeguards

- Only the seller proposes final terms; only the buyer accepts/declines. Conversation membership is checked before offer reads/writes.
- Offers use UUID retry identity, immutable terms and a server-created listing snapshot. Matching retries recover the same offer; conflicting retries fail.
- New proposals supersede earlier unaccepted proposals; prior records remain available. Maximum 20 offers per conversation bounds history.
- Per-pair and listing row locks serialize acceptance against other buyers and listing edits. A partial unique index additionally permits only one accepted offer per item.
- Acceptance rejects expired offers, removed/sold listings, changed revisions and blocked participants.
- Accepted unfunded terms can be cancelled by either participant, even when messages are blocked. This does not execute or describe a refund.
- Prices use integer hundredths for totals, with explicit currency; pickup cannot carry a delivery charge.
- The existing database gains hashpaystream_trade_offers. Include this table and its listing/thread dependencies in backup/restore inventory.
- Existing mobile selectors, confirmation sheet, theme classes and compact enquiry layout are reused. No new top navigation or separate marketplace agreement app.

## Remaining production gates

The payment, dispatch, receipt, inspection, dispute, return, refund and payout steps above are specifications, not implemented or verified capabilities. Public Trade must not claim protected checkout until those gates pass. Accepted terms currently live in the enquiry; they are not yet financial agreement records in the global Agreements screen. Carrier licensing is a seller recommendation, not a platform verification claim. Full offer photos are retained in the database; the current offer UI displays preserved text, not a separate historical photo gallery.

Before enabling money movement, audit the upstream contract/source and live configuration against physical-goods timeout and dispute requirements; build the binding adapter; test duplicate funding, account changes, competing buyers, non-delivery, disputed delivery, return/refund and worker recovery; then run a controlled end-to-end payment.

## Validation

Real isolated local PostgreSQL/HTTP tests cover participant and role isolation, exact retry identity, frozen description/photos, concurrent buyers, stale listing revisions, offer expiry, blocked cancellation and payment containment. Existing enquiry and listing regression suites are also run. Mobile browser preview uses synthetic offers only; no real user conversation or offer is created.

Validation result: existing listing and enquiry suites, new real PostgreSQL agreement cases, TypeScript and production build passed. A 390px browser preview passed seller proposal and buyer acceptance with the existing confirmation sheet, no horizontal overflow and no payment CTA; light and dark screenshots were inspected. Changes are local and have not been deployed or packaged into Android.
