# Trade embedded-wallet checkout

Implemented locally on 22 September 2026. This replaces the rendered Trade checkout wallet-confirmation UI with the existing Privy embedded EVM wallet path. Other Circle product flows are unchanged.

## User flow

Each participant uses Continue with trading wallet; the server verifies the authenticated Privy account owns exactly one embedded EVM wallet. The buyer prepares the durable checkout reservation. The seller prepares escrow and confirms its exact terms. The buyer selects Pay into escrow and confirms in the app's existing confirmation sheet. Exact token allowance (including zero reset where necessary) and funding run sequentially with progress text; Privy standard wallet modals are disabled per signing call and globally. Authentication/recovery/MFA requirements are not bypassed.

Later CTAs follow confirmed escrow state and participant role: dispatch, receipt, early release, inspection-end claim, missed-dispatch refund, seller refund and dispute. Amount, asset and arbitration address are available in Payment details. Evidence text is saved privately before its hash is signed. The existing contract arbiter handles disputed resolution; a new arbitrator signing console or mutual-settlement UI is not included in this change.

## Verification and recovery

- Pinned X Layer factory runtime hash and arbiter; factory registry plus every immutable escrow term verified against the durable accepted binding.
- Two-block confirmation lag for state decisions, head-state comparison and block-hash recheck; latest-state simulation before sending calldata.
- Server-derived Privy wallet identity, immutable participant-wallet binding, chain 196, exact accepted token amount and exact allowance.
- First-party payment confirmation, immediate account-change checks, duplicate-click lock and per-account/offer/wallet persisted submission state.
- Three-confirmation receipt checks, sender/recipient/calldata/value validation and replacement detection. Ambiguous submission without a returned hash remains blocked for manual wallet-activity review; it is never silently resent.
- Legacy UUID/Arc-only wallet schema migrates to text IDs and the two explicitly supported chain IDs. Existing Circle bindings are preserved and cannot be silently switched to Privy; old agreements need new terms.

## Activation

Server gate: HASHPAYSTREAM_TRADE_XLAYER_ENABLED=true. Default is disabled. No production flag, database, deployment, or wallet transaction was changed by this implementation session.

Before activation, verify the configured X Layer asset registry, current pinned factory/token approvals, participant wallets, gas availability, and the live authenticated app walkthrough. USDC is offered only if the pinned factory actually approves that token; a USDC quote does not automatically grant factory approval. Existing reservations are retained; closed trades do not automatically release database item holds or become relisted.

The API status and transaction preparation paths do not custody keys or submit transactions. They return transactions only for state-appropriate actions after server verification. Public-funds release still requires the outstanding production review gates; a passing build is not that clearance.

## Validation

- npm.cmd run build: TypeScript and Vite production build passed (existing dependency annotation/eval/chunk warnings).
- npm.cmd run test:trade-xlayer: ownership, runtime pin, role isolation, exact approval/reset, token delisting, lifecycle deadlines, confirmation state; component-level consent, double clicks, hidden wallet UI, account switch and response-loss recovery.
- npm.cmd run test:trade-postgres: existing backend/community/reservation suites plus legacy-schema migration, preserved Circle data, Privy wallet ID, immutable binding and participant-only idempotent evidence.
- Existing escrow-binding and Circle wallet-verification smoke suites passed.
- Browser/device visual and authenticated signing QA remains unverified because the Windows browser controller failed before tab enumeration.

Changes are local and uncommitted. Pocket source and its Pixel install were not touched.
