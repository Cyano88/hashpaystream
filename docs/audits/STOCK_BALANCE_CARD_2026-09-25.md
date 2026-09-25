# Stocks balance card

Home has USDC and xStocks cards. Savings card and Home/Earn entries are hidden; direct /savings navigation returns Home. Savings contracts, data and APIs are preserved. Funding offer sheet uses the app native safe-area insets.

The stock card calls an authenticated Hash PayStream backend. The backend verifies the user's existing embedded stock wallet and forwards it with HASHPAYSTREAM_STOCK_BALANCE_API_KEY to Hash PayLink's scoped POST /api/v2/wallets/stocks/balances endpoint. It reuses Pocket's balance/cache/market-price services. No browser RPC portfolio or duplicate pricing engine is added. Total is an estimated USD value; missing prices and stale/partial holdings leave it unavailable.

API and card behavior tests pass. Hash PayLink API branch: feat/developer-stock-balances-20260925. Owner approval and read-key handoff are required before the card can load production data. Pending deployment and matching APK update.
