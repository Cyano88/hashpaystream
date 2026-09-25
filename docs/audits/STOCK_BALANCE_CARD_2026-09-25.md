# Stocks balance card

Home has USDC and xStocks cards. Savings card and Home/Earn entries are hidden; direct /savings navigation returns Home. Savings contracts, data and APIs are preserved. Funding offer sheet uses the app native safe-area insets.

The stock card calls an authenticated Hash PayStream backend. The backend verifies the user's existing embedded stock wallet and forwards it with HASHPAYSTREAM_STOCK_BALANCE_API_KEY to Hash PayLink's scoped POST /api/v2/wallets/stocks/balances endpoint. It reuses Pocket's balance/cache/market-price services. No browser RPC portfolio or duplicate pricing engine is added. Total is an estimated USD value; missing prices and stale/partial holdings leave it unavailable.

API and card behavior tests pass. Hash PayLink API branch: feat/developer-stock-balances-20260925. Owner approval and read-key handoff are required before the card can load production data. Pending deployment and matching APK update.


## Production handoff

Shared API d275e9e734fc228d6b20a95b9110c0e3691f6d7e is live. Owner approved wallet:stocks:read; a separate key was issued and securely handed to Render with internal readback verification. It expires 25 October 2026. Live public-chain portfolio check returned HTTP 200, chain 196, complete and fresh with complete pricing. No balances or keys were logged. Hash PayStream deployment dep-daqvgpm0tbcc738elimg requested for c53a34294710d3bee111a82b1e2a40e2beb01f12.

Web and mainnet Android builds passed. Prepared APK version 1.0.39-candidate (40), replacing the same package. Confirm deployment live before installation.
