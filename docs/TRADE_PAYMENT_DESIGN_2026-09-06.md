# Proposed Trade agreement payment flow

Status: design only. Enquiries and moderation do not activate payments.

## What is verified today

Trade has listing publication and no payment endpoint. The inspected service-request
acceptance path in api/service-requests.ts creates upstream fixed_unlock agreements
after both parties accept a terms version, verifies the provider wallet and records
agreement ownership. This is a useful integration pattern, but it does not establish
physical-goods delivery, inspection, returns or dispute-release rules for Trade.
The existing Trade pilot has no settlement credentials and no financial routes.

## Proposed purchase flow

1. Buyer and seller discuss the item in its enquiry thread.
2. Seller proposes a Trade agreement. Freeze the listing ID/revision, description,
   disclosed defects, selected photos or their durable hashes, quantity, buyer,
   seller, price, delivery charge, platform fee, handover method, destination,
   shipping deadline, inspection window and return/refund terms.
3. Both parties accept the exact same immutable terms version. A changed price,
   delivery condition or defect disclosure requires fresh acceptance.
4. Buyer reviews the settlement amount and explicitly funds using the approved
   payment rail. If the listing currency differs from settlement currency, show
   the source amount, conversion quote, expiry, fees and final settlement amount.
   Never treat a displayed NGN amount as an interchangeable USDC amount.
5. Reserve the single item atomically for that purchase before funding. Resolve
   expired quotes, pending chain funding, retries and a second buyer without
   allowing two funded purchases of the same item.
6. Seller hands over or ships through an appropriate trackable courier. Store
   evidence against the order; courier tracking alone does not authorize release.
7. Apply the audited acceptance/inspection rules. A buyer acceptance or a precisely
   defined, notified timeout can release funds only when the eventual contract
   permissions and dispute state allow it. No silent immediate payout on dispatch.
8. A timely dispute pauses release under the agreed rules. A reviewed decision
   selects the permitted release/refund outcome. Returns require explicit evidence,
   shipping responsibility and deadlines; refund rights are not assumed from a
   generic timed-unlock agreement.
9. Generate the familiar light-theme receipt from verified settlement events.

## Reuse and new work

Reuse the agreement review UI, versioned consent pattern, server-side identity and
wallet checks, established payment rail, idempotency conventions and verified
receipts. Trade uses a Privy-user-ID ownership hash, while existing service flows
use verified account/email mappings. Resolve this mapping on the server; never
trust a client-supplied buyer email, seller wallet or ownership hash.

Add an order state machine, immutable goods terms, reservation/stock controls,
delivery and inspection evidence, dispute handling, return policy and a reviewed
release/refund authority model. Confirm the upstream agreement contract's actual
permissions and supported settlement network before choosing an adapter or writing
funding code. A timer-only fixed_unlock template must not be labelled physical-goods
buyer protection without that audit. The savings/advance contracts are not a
substitute for this review. No contract deployment or payment action is authorized
by implementation of messaging or reporting alone.

Recommended initial experience: one item, one purchase agreement, one approved
settlement rail, with a compact Review and fund screen. Do not introduce installment
streaming or early-pay financing as the default used-goods checkout.
