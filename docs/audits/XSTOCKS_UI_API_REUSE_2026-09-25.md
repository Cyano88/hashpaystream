# xStocks UI and developer API reuse

## Delivered in this change

- Home action row: Send, Receive, xStocks. Bottom navigation remains Home, Agreements, Trade, Account.
- Authenticated /xstocks route, mobile shell, Pocket catalogue/ranking and Pocket asset-row layout, search by name/symbol/contract and token details.
- Catalogue source images are used because Hash PayStream has no local /pocket-stocks assets.
- Balance reads use the authenticated account linked embedded Ethereum wallet, without waiting for an initialized Privy transaction signer. Backend ownership verification remains mandatory.
- Wallet initialization has a 10-second terminal fallback. Token acquisition, HTTP and response decoding share a 50-second deadline. Retries and account-change cancellation remain isolated.
- This screen is browsing only. No buy/sell/bridge action is advertised as working.

## Verified reusable provider code

Hash PayLink checkout: .audit-tools/hashpaylink-stock-api-20260925 at d275e9e.
No Pocket source was modified by this change.

- api/pocket/xstocks-swap-provider.ts: quoteStockSwap, sealStockQuote, openStockQuote. Shared X Layer asset allowlist, fixed router/spender, exact amount and owner checks, maximum 0.5% slippage, 3% impact limit, 45-second quote expiry.
- src/pocket/hooks/usePocketStockWallet.ts: explicit payment approval, current-account checks, network validation, allowance/transaction simulation, gas sufficiency, ambiguous-submission recovery and receipt polling. These must accompany UI reuse; copying rows does not provide transaction behavior.
- api/pocket/bridge.ts: linked Circle wallet checks, source proof verification, destination-completion verification and activity recording.
- api/pocket/cctp.ts: USDC bridge networks are Base, Arbitrum, Arc, Solana, Ethereum and Polygon. X Layer is absent. This is not an xStocks bridge service.
- api/v2/wallets/stocks/balances already exposes shared Pocket holdings and prices. Existing wallet:stocks:read keys must not acquire signing/swap/bridge rights implicitly.

## Remaining implementation scope

Builders should be able to render their own screens using the shared API; the Pocket-style UI is the first-party reference client.

1. Publish asset and route capabilities from shared allowlists, including asset/network eligibility, rather than letting clients infer support from a catalogue.
2. Add separately scoped swap quote/verification APIs with project, end-user and wallet binding; reuse the existing provider validator and signed expiry. Cross-project or cross-wallet quote replay must fail.
3. Adapt hosted signing/approval and pending transaction recovery to Hash PayStream. Preserve explicit user approval and chain receipt truth. A project API key must not silently authorize a wallet signature.
4. Expose eligible USDC bridge quote/status/proof/activity functions through developer authorization, preserving Pocket's recipient and source-wallet checks. Do not expose X Layer or xStocks as CCTP bridge routes.
5. Reuse Pocket trade/transfer UI through adapters for identity, routes, API client and approval. Do not copy Pocket-specific identity endpoints into another project's session.
6. Test account changes, expired quotes, permission boundaries, source/destination confirmation, retries and ambiguous submissions before enabling transaction CTAs.

## Validation

Stocks card regression script passes freshness, focus/resume refresh, overlap prevention, account isolation, stalled wallet readiness, stalled access token and timer cleanup. TypeScript check passed before release. Authenticated Pixel end-to-end stock read is not yet visually verified.

## Release record

- App source commit: 24f37275e005a41cca8880e150dabfa2153a10d9.
- Android mainnet build and Gradle assembleDebug passed.
- Installed app.hashpaystream.candidate in place on Pixel, versionCode 42, versionName 1.0.41-candidate.
- APK SHA256: 3A45C25DB0864C259252B177EA3181B70C6AD1D22AB34696CDF1F7C37CFB046D.
- Built entry bundle verified to contain the searchable list, source icons, mobile navigation and request deadline.
- Web deployment: dep-dar1aek9v7es7394oqog.
- Render deployment verified live at the exact app source commit; public health returned 200 and served bundle contains the final xStocks list, mobile navigation and bounded loading.
