# Trade-only retirement preparation

The owner retired non-trade offerings on 2026-10-31. Trade remains the retained product; final production deployment versus service suspension awaits the owner choice.

The active App only renders Trade sign-in, Trade and policy links. The active Express server mounts Trade, the authenticated wallet/session actions required by Trade, account wallet linking and hosted checkout connection. General transfers, work agreements, upfront funding, savings, stock-early-pay, agent jobs and their workers are absent. The API fallback rejects retired routes with 410; Circle send/router-control actions are explicitly excluded. Trade tables, participant ownership, accepted snapshots, checkout records and dispute/recovery behavior are retained.

140 unreachable source files were archived with SHA-256 preservation checks in `hash paystream roll downs/manifest.json`; replaced entrypoints, legacy policy text, server wiring and package metadata are also preserved. Archived source is not mounted or included as a browser entrypoint. Original paths are recorded for deliberate restoration. This does not disable deployed immutable contracts or establish that all assets are withdrawable.

Validation: typecheck and build passed; actual local HTTP retirement boundary passed with provider credentials absent; Trade hosted proxy passed; isolated PostgreSQL backend/community/hosted release harness passed. An initial direct backend test failed because its disposable Postgres server was not running; the full harness started its own database and all checks passed. Playwright checked the signed-out Trade page using the existing public Privy app ID, without signing in or requesting OTP. No real payment was made. Current live service remains on c8f58363733edf0f51c67a94c81853fd59dff7f9 until a deliberate release decision.

Historical read-only observations and asset-reconciliation limits are recorded in the companion Hash PayLink retirement audit. The configured Trade API key currently receives 403 on hosted reconciliation; resolve that access issue before claiming live end-to-end Trade readiness. No account funds were moved.
