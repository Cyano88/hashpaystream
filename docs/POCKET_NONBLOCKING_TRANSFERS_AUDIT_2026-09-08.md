# Pocket independent payment tracking audit - 8 September 2026

## Correction

Version 1.0.23 used one device-local pending transfer per wallet and asset. Returning to Send resumed that payment instead of starting a new one. This correction keeps submission separate from final confirmation and scopes duplicate protection to a payment intent.

- Arc frees the form when Circle accepts the signed approval. X Layer frees it when the wallet returns a submitted hash. Both show Processing and keep Send available.
- Each explicit new payment has its own UUID. Interrupted preparation retries retain the original UUID. Approval locks apply to that UUID, not the wallet.
- Activity shows each tracked payment separately. Successful is set only by the server after exact token, sender, recipient, amount, canonical block and two-confirmation checks. Circle acceptance alone never means successful.
- Authenticated durable records and reservation checks use existing Render Postgres. Pending amounts reduce available spending. Reservation checks serialize concurrent creation; wallet ownership is verified before creation. The backend reads a fresh balance before reserving.
- Reservations are conservative: a mined payment awaiting final verification can temporarily be deducted twice until confirmation. RPC uncertainty never releases a hold.
- The existing Render process runs a bounded read-only worker every 15 seconds. It never signs, approves or sends funds. No new service, cron job or wallet key was added.
- New Circle approvals carry a unique server-bound reference. The worker can retrieve delayed hashes using the existing Circle API key without saving user tokens. A read-only live capability probe returned HTTP 200 and ENDUSER transactions without a user-session header. Worker tests verify exact reference, wallet and source matching before chain confirmation.
- Confirmed Arc transfers are recorded idempotently into the existing account Activity ledger, including recipient visibility. Recording failure remains retryable and cannot reverse verified success.
- Device outbox retries failed status writes without sending money. Existing 1.0.23 pending entries migrate before removal, preserving Circle preparation keys and existing hashes/challenges.
- Account changes hide prior records and invalidate pending authenticated requests. Separate payments can proceed while another confirmation is delayed.

## Deliberate limits

- An X Layer provider failure before returning a hash is ambiguous. The intent remains reserved and is not automatically resubmitted. Other payments may use remaining funds. Explicit wallet rejection (4001) closes an unsubmitted X Layer intent.
- Legacy Circle approvals without the new unique reference may need an open authenticated wallet session to discover their hash. Once the hash is known, server confirmation continues independently.
- Unfinished Circle approval remains resumable in Activity; it never auto-signs. Provider-verified failure releases its reservation.
- At most 20 unresolved intents per account; the worker processes up to three oldest records concurrently per pass. Existing terminal Activity history is retained.
- Live follow-up below supersedes the original synthetic-only evidence.
- Public savings deposits and early-pay launch containment remain unchanged.

## Validation

Focused tests cover independent sends, duplicate taps, per-payment locks, stable keys, legacy migration, status-outbox replay, account switching, atomic reservations, worker restart, unique Circle reference discovery, exact chain receipt matching and provider failure. Full application smoke, TypeScript, release build and Android verification are required before release.

## Live follow-up

Two authorized Arc Testnet transfers (0.01 and 0.02 test USDC) were submitted between the signed-in user's verified wallets. The second intent was created at 18:15:29 UTC while the first remained Processing. Distinct canonical receipts verified exact token, source, destination and amounts. Aggregate source debit and destination credit were both 30,000 atomic units; Activity displayed both successful payments without duplicate entries.

- 0.01 receipt: `0xb67d2eb04839e9a5b6e1d8a9066ceea4724dbe0f58778238f862851b94b215e7`.
- 0.02 receipt: `0x4507098e0782ae1d5f1ffd1d1e6856f4869c4870b426e5b1579ce1404ff6a79b`.

The app was navigated to about:blank at 18:16:36.721 UTC and reopened at 18:18:01.121 UTC. The second payment was mined but remained Processing in the initial durable response. Live Circle list responses omitted refId, while individual transaction details included the exact server-bound reference. The original mock incorrectly assumed list responses included it.

The worker now reads missing references from individual transaction details, with five candidates per page, preserving exact identity/source/reference matching and canonical receipt verification. Regression checks reproduce missing list references and reject wrong detail references and sources. The corrected inspector discovered and verified both real receipts from hashless intents using only the service API key, without a user session or another payment. TypeScript and focused durable/worker tests passed.

The original closed-page check failed and is not represented as a pass. Browser-session recovery subsequently completed both durable rows. An additional fresh end-to-end closed-page payment after deployment is not claimed; no third transfer was made. This correction changes backend code only and applies to the installed Android client through the shared service.

Provider reference: https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/get-transaction
