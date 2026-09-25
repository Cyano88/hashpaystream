# Receiving and gas balance release

## Product flow

Receive opens two existing-style rows: USDC (Arc), then xStocks (X Layer). Each selection shows the account ID and a locally rendered QR with the checksum wallet address below it. Deposit and gas notices come from the shared API. Existing font, back control and mobile shell are retained.

The stock Home card replaces the xStocks / X Layer subtitle with OKB and the exact balance returned by the API. Gas is not part of the stock USD valuation. Missing/stale gas is shown as unknown, never fabricated as zero. Initial stock value, gas and Arc balance reads use matching reduced-motion-aware shimmers; later refreshes remain quiet.

## API changes

Hash PayLink commit 17bae40eed6ee3bbe27e1c153f4957a65420de4c includes the latest Pocket changes through ecf321555. No Pocket UI source was modified for this release.

- POST /api/v2/wallets/stocks/balances adds gas and receive fields from Pocket's existing block-pinned snapshot.
- POST /api/v2/wallets/stocks/receive returns receiving metadata without reading holdings/prices. Both use the existing wallet:stocks:read scope.
- POST /api/v2/wallets/arc with path /receive and method GET returns only live ARC SCA wallets owned by the supplied Circle user session, using the existing wallet:arc scope.
- Hash PayStream proxies the stock receive request after independently verifying its Privy user's embedded wallet. Arc receive uses its authenticated Circle request wrapper.
- The UI rejects wrong-network or wrong-address QR payloads, bounds initial loading, and discards previous-account responses.

## Identity limitation

Hash PayStream's current ID resolver is a separate Arc-oriented directory. Cross-app Pocket ID lookup and stock ID routing are not yet connected. The requested claim that any Pocket or Hash PayStream user can send stocks using this ID is therefore not shown as live functionality. Stock receiving points to the verified X Layer address; Arc ID copy states Hash PayStream support only. Shared identity integration remains required before changing that claim.

## Validation

Shared stock API and Arc API regression checks passed (exact OKB units, network metadata, no portfolio dependency for QR, authenticated ownership, sandbox exclusion, unchanged transfer scope). HPS Circle regression, stock refresh tests, Receive QR/account-switch/wrong-network tests and TypeScript passed. Tests use synthetic wallet fixtures; no transfer, signature or key rotation was performed.

## Rollout

Hash PayLink deployment: dep-dar28fflot8c73e6dhpg.
Hash PayStream app commit: 6b85f9f (1.0.43-candidate / versionCode 44).

## Verified release outcome

- Shared API 17bae40eed6ee3bbe27e1c153f4957a65420de4c is live. Scoped stock receive and stock balance calls returned 200 with matching chain/address/QR fields and valid OKB response shape. Arc receive without a Circle user session returned 401.
- Final app commit 59f0a6367aa7d495ec805a607a26e6ec43aeded1 is live in dep-dar2jtu0tbcc738pdrog. The final follow-up corrects the Arc total shimmer missed by the first bundle check.
- Health 200. Refreshed public and origin bundles both contain Receive xStocks, Loading USDC balance and Loading OKB balance. An initial request during traffic switching still saw the prior bundle; the refreshed /assets/index-BxaI1ETT.js was verified on both domains.
- Android 1.0.43-candidate (versionCode 44) installed in place on the existing Pixel app.hashpaystream.candidate and launched. Data was preserved.
- Final APK SHA256: FF7B392F807BD69651858FBAF1A464A51A0A07375D9C521B498450031C56E3A3.
- Authenticated receiving screens on the physical Pixel were not visually inspected; actual QR generation and account isolation were checked with React rendering tests and production API checks.
