# Trade settlement wallets - local implementation

## Verified selection

Authenticated participants can explicitly select their own Circle settlement wallet with POST /settlement-wallet (threadId, offerId, walletId, userToken). The server checks conversation/offer access before calling Circle, then rechecks agreement state under the existing transaction locks. GET recovers only the caller's selected wallet.

The verifier calls GET /v1/w3s/user with the supplied Circle session, then GET /v1/w3s/wallets/{id}. It requires an enabled user, matching wallet userId and requested id, ENDUSER custody, LIVE state, SCA account, exact ARC-TESTNET network, and a valid nonzero address. Address and chain from the request cannot override provider results. Missing provider fields fail closed. These are read-only calls.

This explicitly links control of a Circle session to the authenticated Trade account. It does not claim the two providers have matching email identities. Session tokens, email addresses and provider user IDs are not persisted. Each participant selects their own wallet; neither selects the counterparty's wallet.

Selections are immutable per accepted offer. Repeating the same selection recovers it; changing it requires a new offer. Both sides cannot select the same address. A reservation loads both addresses from these persisted records, not from client input or the deployment adapter. Network mismatch rejects reservation creation.

## Race fix and validation

Integration testing reproduced a PostgreSQL deadlock between cold schema initialization and an agreement update. Community transactions now retry only explicit PostgreSQL deadlock-abort code 40P01, with at most three attempts. Connection errors and ambiguous commits are not automatically retried. All callbacks in this transaction boundary must remain DB-only or read-only; provider transaction/challenge submission must be outside it.

Tests cover provider owner/network/custody/state/address checks, missing/oversized credentials, expired session/provider failure, HTTP participant isolation, no provider calls for outsiders, wallet immutability, duplicate-party address denial, server-derived addresses, missing-wallet reservation denial, durable recovery and cancellation races. Synthetic provider fixtures and isolated local PostgreSQL are used; no real wallet was accessed or payment sent.

## Remaining gates

Payments remain disabled. No production deployment adapter is configured. No checkout UI, Circle challenge issuance, provider transaction binding or confirmed funding reconciliation is enabled by this change. The nominated dispute authority and independently reviewed deployment are still required. Revalidate the buyer's current Circle session and exact stored wallet immediately before any future payment submission. Stored verification is an observation, not permanent authority to spend.

Sources checked 2026-09-09:
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-user-by-token
- https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-wallet
- https://developers.circle.com/api-reference/wallets/developer-controlled-wallets/list-transactions (custody/network enum definitions)
