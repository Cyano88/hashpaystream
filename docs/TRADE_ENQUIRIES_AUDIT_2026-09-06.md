# Trade enquiries and moderation pilot

## Scope

Adds private buyer/seller text enquiries, message blocking, listing/conversation reports, and admin report review to the isolated Trade pilot. The four existing Trade selectors remain unchanged; enquiries are accessible from the header. No checkout, payment endpoints, or financial contracts are changed.

## Controls

- Server-verified Privy identity and HMAC ownership; only thread participants can read or send messages.
- Pair locks serialize blocking and sending. Durable quotas limit new conversations, messages, and reports. Message UUIDs make retries idempotent.
- Reports disclose that item photos and up to 20 recent messages are included. Evidence survives listing removal for review.
- Admin privileges are checked against the existing server email allowlist using Privy's verified user record. Client flags cannot grant access.
- Hiding a listing removes its public photos and stops new messages. Moderation decisions record the actor and time.

## Verification

- Real local PostgreSQL smoke tests passed: participant isolation, idempotency, block/unblock, concurrent block/send, message pagination, quotas, report targets, admin rejection, evidence preservation, and hiding.
- Synthetic mobile browser test passed: buyer question, seller reply, conversation report, admin evidence review, and hide action. The queue became empty; no browser errors were recorded.
- Existing Trade backend, native routing, Android readiness, TypeScript, and preview browser regression passed. Preview checks include account isolation, drafts, saves, search/location, deep links, and mobile overflow.
- Browser conversations used synthetic local identities only; no messages were sent to real users for testing.

## Pilot limits and next work

Text enquiries refresh while open; there are no push notifications or unread counts. Blocking is per counterparty; there is no global account ban or automated spam classifier. Evidence retention and deletion operations must be defined before a wider launch. Admin access uses the existing allowlist, not a new client-managed role.

Payment remains unavailable. See [Trade payment design](TRADE_PAYMENT_DESIGN_2026-09-06.md) for the proposed agreement, delivery, inspection, dispute, and refund lifecycle that needs implementation and audit.
