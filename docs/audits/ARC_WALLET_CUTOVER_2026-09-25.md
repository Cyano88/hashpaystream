# Arc wallet cutover preparation - 25 September 2026

## Verified current deployment
The Pixel has candidate 1.0.37 (38), with launch/loading corrections only. The deployed Hash PayStream backend still uses sandbox Agreement credentials and Circle Arc Testnet. No environment was switched by this preparation.

Circle production entity configuration returned HTTP 200 and its app ID matched Hash PayLink's configured user-wallet application. Circle's current supported-blockchains documentation lists ARC for mainnet user-controlled SCA wallets.

The Hash PayStream developer project is active, human, USDC, Arc-only, with arc_agreements and a signed webhook. The owner saved arcMainnetChainId 5042 and completed renewed CLI approval. The same idempotent operation issued Arc Agreement mainnet with agreement:create, agreement:read and project:read scopes, expiring 24 October 2026. Live project and Agreement reads returned 200; an invalid-schema checkout creation probe was denied with 401. A nonexistent checkout status returned 404 because record lookup precedes authorization; this does not establish checkout access. The reviewed CLI handoff wrote HASHPAYSTREAM_ARC_MAINNET_API_KEY to the Hash PayStream Render service and verified the value internally without printing it. No deployment or wallet environment switch was triggered.

## Prepared code, not deployed
- Explicit live/test Circle credential and network profiles; live never falls back to a test key.
- Exact Circle blockchain filtering instead of accepting ARC and ARC-TESTNET together.
- App/backend environment, chain and application ID handshake before opening Circle.
- Network/application-qualified balance cache; no reuse of the prior unqualified 11-USDC cache.
- Independent chain checks on every RPC candidate; mainnet has no testnet fallback.
- Isolated mainnet account and request-history stores. No sandbox records are deleted or relabeled.
- Live account registration requires a Circle-verified ARC wallet and stores its chain/wallet ID.
- Unimplemented live request mutations and the legacy repayment router remain blocked.

## Activation prerequisites
1. Completed: owner saved Arc Mainnet (5042), retaining existing routing details.
2. Completed: renewed owner approval, retried arc_agreement_mainnet_v1, verified the scoped key and handed it to Render. Arrange renewal before 24 October 2026 expiry.
3. Review the shared hosted-wallet architecture before distributing platform-wide Circle credentials. Production key/app correspondence was verified, not copied into the builder service.
4. Complete production transfer tracking/reconciliation and Savings boundaries: existing modules still reference Arc Testnet. Do not enable HASHPAYSTREAM_ARC_ENVIRONMENT=live yet.
5. Complete verified-recipient and payer integration with explicit per-action API permissions. Current Agreement keys cover reads/draft creation only. The mainnet request write gate must stay closed until tested.
6. Deploy the compatible API and client together, preserve sandbox stores and credentials, then verify with a real mainnet wallet session and a separately authorized bounded payment. No financial transaction was initiated.

New backend controls: HASHPAYSTREAM_ARC_ENVIRONMENT, CIRCLE_MAINNET_API_KEY, HASHPAYSTREAM_ARC_MAINNET_RPC_URL. Public client controls: VITE_HASHPAYSTREAM_ARC_ENVIRONMENT, VITE_CIRCLE_USER_WALLET_APP_ID_ARC_MAINNET. Mainnet account namespace: hashpaystream:arc-mainnet:5042:accounts:v1.

Validation: test:arc-wallet-environment, test:circle-wallet, test:stream-accounts, test:service-requests and TypeScript checking. All fixtures use synthetic identities, tokens and keys.

## Transfer and Savings follow-up

Prepared locally, not deployed: Send and approval recovery use the selected Arc chain; transfer API reads, mutations and workers exclude the other Arc network while retaining X Layer. Shared status outbox replay now checks server-visible IDs, preserving sandbox entries and X Layer recovery. Activity links and legacy activity queues select the correct network. Internal confirmed-transfer recording rejects another chain.

Savings uses the selected chain, checks the RPC chain before reading balances and requires dedicated HASHPAYSTREAM_ARC_MAINNET_SAVINGS_VAULT_ADDRESS / HASHPAYSTREAM_ARC_MAINNET_SAVINGS_DEPOSITS_ENABLED for live. The public fallback likewise uses VITE_HASHPAYSTREAM_ARC_MAINNET_SAVINGS_VAULT_ADDRESS. Testnet vault settings cannot activate live deposits. No mainnet vault was provisioned.

Verified Render deployment metadata: Hash PayStream still serves aaa1e32cb47dc891c19687cda31da6a39ec1432d; Hash PayLink serves a296071efebc0bdfdf54a0650951a8627628a59f. That exact Hash PayLink commit has no api/wallet-connections.ts. Its CLI scope router permits Agreement read/draft creation but excludes nested recipient/payer/signing routes. Hosted wallet delivery and explicit Agreement funding permissions remain release prerequisites; do not work around them with a platform-wide Circle key or unrestricted developer key.

Validation passed: transfer receipt and UI suites, live/test transfer API isolation, background mainnet receipt recovery and wrong-chain rejection, Savings configuration/runtime/wallet readiness, stream accounts and TypeScript.

## Hosted transport and funding adapter completion

Live Circle provider calls now route only to https://app.hashpaylink.com/api/v2/wallets/arc with HASHPAYSTREAM_ARC_WALLET_API_KEY. Missing scoped credentials fail closed; CIRCLE_MAINNET_API_KEY is no longer consumed. Sandbox transport is unchanged. The configuration handshake verifies the upstream chain/blockchain/app ID against the build. The actual two-repository handler contract test passed for own-email OTP, wallet creation, Arc-only listing and USDC challenge creation without an app-held Circle key.

Agreement requests now choose separate draft and funding/recipient keys. HASHPAYSTREAM_ARC_MAINNET_FUNDING_API_KEY cannot fall back to sandbox or reuse the draft key. Live acceptance requires provider walletChainId 5042 and a verified Circle wallet ID. The existing negotiation/race suite passed in a mainnet fixture with exact credential-routing assertions. Activation still requires HASHPAYSTREAM_ARC_AGREEMENT_FUNDING_ENABLED=true after credentials and wallet readiness; this flag was not enabled. Funding scope does not grant lifecycle operations.

Pending: deploy the reviewed Hash PayLink follow-up, obtain owner approval for wallet:arc / wallet:connect / agreement:recipient / agreement:fund, provision separate scoped keys via reviewed Render plans, and deploy/install the matching Hash PayStream release. No user transaction or automatic mainnet activation has occurred.


## Scoped key handoff verified - 25 September 2026

Hash PayLink commit 74e4f37111c8c2e664f1112512cb43b55cbbb724 is live. Owner approved the new project grant. Separate Agreement funding (agreement:recipient, agreement:fund), hosted connection (wallet:connect), and Arc wallet (wallet:arc) keys were issued and handed to the Hash PayStream Render service through the CLI. Each single-variable write passed internal readback verification; no key value was printed. These three keys expire 25 October 2026. The existing draft key expires 24 October 2026.

Live scoped wallet configuration returned HTTP 200, ARC, chain 5042. The configured mainnet RPC independently returned chain 5042. Mainnet wallet and Agreement funding flags remain off. Hash PayStream full typecheck and Vite build passed in the prepared source workspace. An isolated release checkout now exists at C:/Users/USER/.audit-tools/hashpaystream-hosted-release-20260925, based on the deployed aaa1e32 commit; it preserves production-only documents and excludes contract and Android changes. Release publication, coordinated live environment activation, and matching APK installation are still pending.


## Live wallet cutover and installed Android update

Render deployment dep-daqv2rk9v7es738sld2g is live on ed113add4f0e18380abb5972ab9f0ca369b561a3. Mainnet wallet and human Agreement read environments are live. Retired stock Early Pay UI is disabled. Agreement funding stays disabled because upstream escrow execution is still disabled. Health and web root returned HTTP 200; unauthenticated wallet access returned 401.

Mainnet public-configuration build passed. Candidate APK 1.0.38, version code 39, SHA-256 1651022548D6745F2FB811C32FF468B8FA9AC58B22365E2347C1A36DF8EF160F, was installed with adb install -r on the existing app.hashpaystream.candidate and launched on the Pixel. Exactly one Hash PayStream package is installed. No data was cleared. Android readiness, OTP, biometric vault, mainnet read isolation and mainnet Agreement request fixture checks passed. The Android readiness assertion now uses the approved Hash PayStream display name.

The user must still complete and verify the real mainnet Circle wallet session. No transfer, escrow activation, or real-money canary was performed. Sandbox data/configuration is retained separately.
