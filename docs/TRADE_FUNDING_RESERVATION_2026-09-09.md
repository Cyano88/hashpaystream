# Trade funding reservation - local implementation

## Behavior

Authenticated `GET /funding-reservation` recovers the participant-owned reservation by thread and offer. Buyer-only `POST /funding-reservation` creates or recovers it. Both responses keep `paymentsEnabled: false`.

The existing Trade PostgreSQL database stores one reservation per offer and per listing. Creation follows the existing pair, listing, offer lock order. Concurrent requests recover the same server-generated ID and immutable binding; a retry does not refresh the deadline or choose new wallets. Amount and snapshot come from the accepted database offer, never the request body. USDC only; other currencies require a separately accepted settlement quote.

A server-only adapter must supply approved deployment context. Participant wallets now come from immutable per-offer Circle-verified selections; see TRADE_SETTLEMENT_WALLETS_2026-09-09.md. No production adapter is installed. New reservations therefore fail closed with 503 in the configured application. Tests inject synthetic context only. There is no environment flag that bypasses this gate.

Existing reservations remain recoverable after adapter loss, restart, blocking, or removal of the listing. Ordinary offer cancellation rejects any reservation. The item remains held by its accepted offer. There is intentionally no automatic timeout deletion or client-controlled release: an issued transaction could still confirm. A future reconciliation path must prove the relevant escrow cannot be funded or has reached the appropriate confirmed terminal state before releasing a hold.

## Validation

Real isolated PostgreSQL and authenticated HTTP smoke tests cover missing authentication, participant isolation, seller creation denial, disabled production setup, concurrent retries, exact USDC amount, persisted recovery, block/removal recovery and cancellation rejection. TypeScript and diff whitespace checks also run.

## Remaining checkout gates

This is reservation infrastructure, not a completed payment attempt or checkout. No Circle challenge is issued, no token approval is requested, and no transaction is sent. The reservation ID is not yet a provider transaction ID.

Still required: nominated dispute authority, independently reviewed and approved escrow deployment profile, checkout UI for the implemented wallet selections, fresh buyer wallet verification before payment submission, escrow creation and acceptance, provider idempotency/challenge binding, confirmed funding receipt reconciliation, safe terminal hold release, and UI integration. Expired or ambiguous attempts must recover and reconcile rather than silently create replacements. Nothing in this change deploys contracts, updates the live service, or packages Android.
