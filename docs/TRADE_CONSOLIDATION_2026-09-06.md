# Consolidate Trade into HashPayStream - 2026-09-06

Trade is served by the existing paid main service at /api/hashpaystream/v1/trade. The feature keeps its existing restricted database connection and ownership key through HASHPAYSTREAM_TRADE_DATABASE_URL and HASHPAYSTREAM_TRADE_OWNERSHIP_SECRET. There is no fallback to the financial database or financial ownership key.

The old pilot database is retained in place. No record copy, schema merge, identity rehash or financial migration is needed. The initial read-only inventory found one listing row and zero threads, messages, blocks or reports; the restricted Trade role has no membership in the production role. Both services use the same Privy application, while ownership keys are distinct.

This production branch starts at main 510d7f0. It adds Trade handlers, UI and required dependencies without importing the feature branch's unrelated receipt-staging changes. Android is built separately with its existing verified receipt and native functionality and a single main API origin.

Rollout order: pass storage/auth/routing tests and production build; configure only the three Trade environment keys on main; deploy the focused commit; verify main health, Trade reads/auth denial and existing financial read-only boundaries; install and verify Android; then suspend the old Trade service. Preserve its database and configuration for recovery.

Rollback: disable HASHPAYSTREAM_TRADE_ENABLED and redeploy a known-good main release if the integration affects existing routes. The retained Trade database and original ownership key allow the old pilot to resume without data migration. Do not delete the database or change financial environment keys.

Validation before cutover: complete production `npm run test:smoke` passed, including financial, wallet, ownership, webhook, readiness, savings and browser-secret checks. Trade storage isolation, listing/community PostgreSQL tests, cache tests and the production-source browser fixture passed. The shared Pocket selector's existing keyboard/focus/accessibility improvements are included so Trade matches the verified Android UI.

Android 1.0.11 (code 12) built with unit tests and lint passing. All 280 packaged web files matched dist, and no bundled JavaScript contained the old pilot origin. Artifact SHA-256: 42c27ae7086732897fa6d388275a2ecdcaffbc7127717dcf30adc894fb801f62. Installation follows successful main-service deployment.
