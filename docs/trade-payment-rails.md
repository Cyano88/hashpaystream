# Trade payment selection

The Trade agreement editor offers USDC on Arc mainnet (5042) and xStocks on XLayer (196). Availability comes from the Stream backend and Hash PayLink project checks. Switching payment networks clears the price and delivery fee; participants must accept the new terms. Historical fiat and unscoped USDC quotes are preserved and require an explicit payment selection for new hosted checkout.

Arc uses `HASHPAYSTREAM_ARC_TRADE_API_KEY`, a dedicated server-only Hash PayLink developer key. It never falls back to the xStocks key. New Arc checkout requires both `HASHPAYSTREAM_TRADE_HOSTED_ENABLED=true` and `HASHPAYSTREAM_TRADE_ARC_ENABLED=true`, plus confirmed availability from Hash PayLink. Keep Arc disabled until the separate Trade factory, two-signer authority and Circle execution policy are reviewed and enabled in Hash PayLink. Its release gate currently prevents production activation.

Arc reservations use `hosted-trade-arc-v1` and `hashpaystream-arc-trade-<offerId>` with `/api/v2/trade-agreements`. Existing xStocks reservations retain their original kind, key and payload. The database reserves the accepted snapshot before the remote request. Retries first reconcile the same reservation; paused creation does not disable recovery. Returned checkout terms, network, token and exact USDC units must match the reservation.

Validation: `npm run typecheck`; `node --import tsx scripts/trade-arc-hosted-smoke.mjs`; `node --import tsx scripts/trade-payment-picker-smoke.mjs`; existing hosted checkout, hosted route and checkout interaction smoke tests; `node scripts/trade-postgres-harness.mjs` for isolated local PostgreSQL tests.
