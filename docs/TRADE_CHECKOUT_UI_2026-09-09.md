# Trade checkout UI audit and implementation

## Completed locally

The accepted agreement now contains a compact checkout section using the existing Circle wallet context and Stream confirmation sheet. Exact price, handover, returns and inspection terms remain visible above it. Only current-policy USDC offers expose wallet confirmation. The connected wallet address and Arc testnet network are disclosed before selection. Selecting a wallet does not request a signature, token approval or payment.

The authenticated GET /checkout route supplies a single SQL snapshot of own wallet, buyer/seller readiness and reservation reference. Counterparty wallet IDs, ownership hashes and full escrow bindings are not exposed. The UI refreshes on entry, after selection and every 15 seconds while visible. It retains known reservation details during network failures. It never labels a reservation as a confirmed payment and contains no funding action.

If a wallet-selection response is lost, the UI reads persisted status before offering another action. Reload recovers the same status. Current Circle session is checked both after confirmation and after asynchronous Privy token retrieval, blocking stale wallet selection if the session changes.

Cancellation stays disabled until checkout status is known and no reservation exists. The click handler rechecks the server before opening the existing confirmation sheet; the backend remains the final atomic guard. Removed the unverified assertion that no payment had been collected. Failed status reads do not enable cancellation.

## Verification

- TypeScript and production build.
- Existing real PostgreSQL/HTTP Trade community suite, extended with checkout authentication, participant privacy, own-wallet mapping, readiness and reservation recovery checks.
- Real browser at 390 x 844 with the actual components and synthetic local API fixtures: confirmation sheet, response loss after persistence (one POST), reload recovery without resubmission, reservation cancellation denial, retained reservation during 503, retry recovery, no payment buttons, no horizontal overflow, light and dark screenshots.
- Browser wallet-session switch during delayed access-token retrieval: blocked with zero wallet-selection POSTs.
- Visual audit corrected disabled-button appearance and dark checkout text contrast.

Fixtures and screenshots are under output/playwright/trade-checkout-*. No production conversation, wallet selection, challenge or transfer was created. The browser was restored to its original live activity page after testing.

## Still gated

Checkout recovery and wallet preparation are implemented. Escrow creation/acceptance, Circle payment submission, confirmed on-chain funding status and settlement UI remain separate integration work. No deployment adapter is enabled; dispute authority and independent escrow review/deployment approval remain required. Nothing in this change deploys the service or updates the Android package.
