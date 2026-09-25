# Stocks balance card

Home has USDC and xStocks cards. Savings card and Home/Earn entries are hidden; direct /savings navigation returns Home. Savings contracts, data and APIs are preserved. Funding offer sheet uses the app native safe-area insets.

The stock card calls an authenticated Hash PayStream backend. The backend verifies the user's existing embedded stock wallet and forwards it with HASHPAYSTREAM_STOCK_BALANCE_API_KEY to Hash PayLink's scoped POST /api/v2/wallets/stocks/balances endpoint. It reuses Pocket's balance/cache/market-price services. No browser RPC portfolio or duplicate pricing engine is added. Total is an estimated USD value; missing prices and stale/partial holdings leave it unavailable.

API and card behavior tests pass. Hash PayLink API branch: feat/developer-stock-balances-20260925. Owner approval and read-key handoff are required before the card can load production data. Pending deployment and matching APK update.


## Production handoff

Shared API d275e9e734fc228d6b20a95b9110c0e3691f6d7e is live. Owner approved wallet:stocks:read; a separate key was issued and securely handed to Render with internal readback verification. It expires 25 October 2026. Live public-chain portfolio check returned HTTP 200, chain 196, complete and fresh with complete pricing. No balances or keys were logged. Hash PayStream deployment dep-daqvgpm0tbcc738elimg requested for c53a34294710d3bee111a82b1e2a40e2beb01f12.

Web and mainnet Android builds passed. Prepared APK version 1.0.39-candidate (40), replacing the same package. Confirm deployment live before installation.


## Completed deployment

Hash PayStream c53a34294710d3bee111a82b1e2a40e2beb01f12 is live under deployment dep-daqvgpm0tbcc738elimg. Health returned 200 and unauthenticated stocks endpoint returned 401. APK 1.0.39-candidate (40), SHA-256 BE8B8B5C7E773B5B3FE10EB2CCD633495E8A64D838C1310DF429EE14939657EA, installed with adb install -r and launched on Pixel 5A160DLCH006VM. Existing app data was preserved. User-specific authenticated card rendering still needs physical-session confirmation; no payment was performed.


## Freshness correction

Hash PayStream previously fetched only at mount/manual refresh and never aged out the displayed value. The card now refreshes every 30 seconds while visible, on focus/reconnection/visibility/native resume, skips overlapping reads, and expires the estimated total at the earliest balance or provider-price timestamp plus 60 seconds. Failed refreshes retain labeled last-known holdings, not an expired total. Controlled-clock tests cover expiry, background pause, native resume, failures, account switches and timer cleanup. Pocket code is unchanged. Candidate version 1.0.40 (41).

Freshness correction deployed: 155ced18f519e4a1234ab47ac82685b6ce87e88c, Render dep-dar0vcg473hc739e7p9g, live. Web health and served bundle confirm the expiry notice and native resume event. Android 1.0.40-candidate (41) installed in-place and launched. APK SHA-256 328134F237D75BE2FA2D757F49684D7CA02C5A69D01474ECF7C57681EE434094. Mainnet build, typecheck, controlled-clock refresh tests and Gradle passed. No Pocket source changes or money movements.
