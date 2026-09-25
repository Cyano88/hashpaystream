# Hash PayLink hosted account bridge

Local integration, 24 September 2026. Disabled by default; no deployment or wallet migration has been performed.

## Scope and source

Implemented in the clean `integration/arc-agreement-production-20260924` checkout. The newer `hashpaystream-production-20260907` source contains substantial uncommitted UI and xStocks work and was not modified. Reconcile this additive bridge into that newer product source before shipping an app update; do not replace the newer Android build with this older integration checkout.

`api/hosted-account.ts` exposes `/api/hashpaystream/v1/hosted-account`:

- GET returns enabled, connected and pending booleans for the authenticated account.
- POST `{ action: 'start' }` creates or resumes a short-lived Hash PayLink connection.
- POST `{ action: 'complete' }` redeems the approved connection and persists the immutable Hash PayLink identity.

User ID and email come from the server-verified Hash PayStream session. Client-supplied email, subject, connection ID, verifier and wallet IDs are ignored. A different app's Privy user ID is never reused as the Hash PayLink identity.

A dedicated database record per source app/user stores the pending verifier and browser capability encrypted with AES-256-GCM, with the subject as authenticated associated data. Only the hosted link goes to the browser. Redemption checks the exact subject and expected Hash PayLink Privy app. Successful linkage removes pending credentials and cannot be overwritten through these endpoints. Atomic row updates serialize concurrent requests. Never rotate the existing ownership secret as a routine rollout step: it derives the record namespace and encryption key.

The optional Account-page row uses the existing native external-browser handler. Users approve on Hash PayLink, return to Hash PayStream and select Check connection. No automatic native return or payment execution was added. Old Circle and Privy wallet integrations remain available for recovery.

## Server configuration

- `HASHPAYSTREAM_HOSTED_ACCOUNT_ENABLED=true` only after coordinated rollout.
- `HASHPAYSTREAM_WALLET_CONNECTION_API_KEY`: dedicated live scoped `hpl_app_` key with `wallet:connect`. Existing Agreement-only and test keys cannot substitute.
- `HASHPAYSTREAM_HASH_PAYLINK_PRIVY_APP_ID`: public app ID of Hash PayLink's hosted Privy authority, not the Hash PayStream app ID.
- Existing `HASHPAYSTREAM_APP_OWNERSHIP_SECRET`, Privy server authentication and durable database configuration.

Upstream is pinned to `https://app.hashpaylink.com`; redirects are rejected. Upstream credentials, identity IDs and the backend verifier are not returned to the browser or logged. The feature flag hides the UI and blocks mutations until configured. General app sign-in stays unchanged.

## Validation

- `npm run test:hosted-account`: user isolation, encrypted pending proof, retry reuse, response binding, expiry, immutable link, storage failure, test-key rejection and URL pinning.
- `HASHPAYLINK_CONTRACT_TEST_ROOT` points to the reviewed Hash PayLink checkout for `node --import tsx scripts/hosted-account-contract-smoke.mjs`. Runs both real handler implementations with synthetic authentication and storage, including different source/hosted Privy identities.
- Existing account and Agreement gateway regression suites and full TypeScript check.

## Remaining rollout work

Provision the scoped key without exposing it, deploy the corresponding Hash PayLink endpoints, reconcile the newer Hash PayStream product changes, then test real sign-in and native return with a test account. Connect the saved identity to hosted Agreement draft creation and Circle wallet operations before removing any local wallet functionality. Account linkage does not establish a funded wallet or verify a payment. Full hosted payment execution has not been tested by these identity tests.
