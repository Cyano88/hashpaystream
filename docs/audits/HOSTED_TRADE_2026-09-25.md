# Hash PayStream hosted Trade cutover

New xStocks Trade offers use the shared Hash PayLink checkout. Each participant connects their verified Hash PayLink account, then the buyer reserves checkout. The server loads the accepted listing and terms itself; browser-provided identities, quantities and checkout URLs are never trusted.

Hosted participant bindings are immutable per offer. The existing funding reservation table and listing/pair locks reserve a single immutable remote request, preventing duplicate checkouts, local-wallet mixing and cancellation races. The remote request happens outside database retries. Recovery first looks up the same project-scoped idempotency reference. Existing local wallet/escrow records keep the original Privy recovery path.

Configuration: a separate draft/read `HASHPAYSTREAM_XSTOCKS_AGREEMENT_API_KEY`, existing wallet-connection key/ownership secret, Hash PayLink authority `HASHPAYSTREAM_HASH_PAYLINK_PRIVY_APP_ID`, `HASHPAYSTREAM_HOSTED_ACCOUNT_ENABLED=true`, and `HASHPAYSTREAM_TRADE_HOSTED_ENABLED=true`. Native `HASHPAYSTREAM_TRADE_XLAYER_ENABLED` remains off for this rollout. Hash PayLink separately gates Trade by project. No financial flags were enabled during implementation.

Passed: application TypeScript, isolated PostgreSQL listing/community/concurrency suites, hosted proxy response-binding/retry tests, account linking tests and legacy X Layer planner suite. No live two-participant funding, dispatch, release or refund was performed. The active CLI grant was expired and did not contain xStocks draft/read scopes; renewed owner authorization is required before key creation and Render handoff. The linked Hash PayLink wallet is a distinct authority from a user's existing Hash PayStream embedded wallet; account connection does not transfer balances.

## Verified deployment

Hash PayStream commit `b3dd98e19134f8f6eea113648694c97d23ee995e`, Render `dep-dar40s7lot8c73ecb510`, is live. Health returns 200 and an unauthenticated hosted-checkout request returns JSON 401. Hash PayLink commit `6b93c679318f6c2de2f5f4e4ed8126975fb10059`, Render `dep-dar40hjtqb8s73fem0f0`, is live. Its unauthenticated draft/assets route returns JSON 403. Both production builds completed; new payments remain disabled.

Pixel `app.hashpaystream.candidate` was updated in place to versionCode 45 / 1.0.44-candidate and launched, preserving data. APK SHA-256 `F6CF87EFCB9472ED3709EDD8FA5BED3AB21E32BC532093871A8E0C494CB4663C`; packaged HTML matches the verified mainnet build. Hosted route tests additionally verify authentication, rejection of client-forged identity, default-off behavior and recovery routing.

Owner CLI authorization was opened in the Chrome profile matching onojacyano. Pending scopes are project:read, xstocks-agreement:read, xstocks-agreement:create, keys:manage. After owner approval: complete CLI auth, verify project capability, create the isolated draft/read key, use the reviewed CLI Render handoff, bind the public hosted wallet authority, then enable only the selected project and run an explicitly approved two-participant stock payment. No key was created and no live payment was signed in this session.
