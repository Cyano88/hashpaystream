# Incremental receipt ingestion and staging reads - 2026-09-06

## Scope

This phase adds a one-shot staging sync job and an authenticated receipt reader.
The legacy production store remains authoritative. No production route was
switched, no funds moved, and no signing configuration changed.

## Implementation

- Migration 005 adds append-only projection revision history and singleton sync health.
- The sync job holds a session advisory lock across receipt indexing, independent
  ledger reconciliation and workflow verification. An overlapping invocation
  exits with `already-running`. Each stage retains its staging database boundary.
- Projection updates require a strict superset of verified observation IDs.
  Removed evidence, same-evidence edits, terminal status regressions and amount
  regressions fail closed. Existing immutable ownership, terms and receipt
  binding checks remain in the transaction.
- The projection source hash fingerprints evidence. The stored source version is
  now a monotonic revision: it advances for new evidence even when the Arc block
  watermark does not change, including same-block or X Layer additions.
- GET `/api/hashpaystream/staging/agreements/:agreementId/receipts` uses the
  existing server-side Privy verification adapter. Account ownership derives
  from the verified email and the server HMAC secret; caller-supplied ownership
  fields have no effect. Responses are non-cacheable.
- Reads require the staging environment, explicit opt-in, an actual staging
  database, and successful sync verification within 15 minutes. Syncing,
  blocked, stale or conflicting/reorg evidence returns unavailable. Unauthorized
  agreement access returns 404. Available balance remains null.

## Checks completed

TypeScript and the complete smoke suite passed. The rollback-only PostgreSQL
harness applied all five migrations in a temporary schema and demonstrated:

- activation followed by two incremental releases, including a same-block
  revision advance to 201;
- duplicate replay without additional history, stale replay rejection and
  immutable history;
- exclusion of concurrent database sessions;
- 12 HTTP cases covering permitted ownership, invalid authentication, forged
  ownership, method restrictions, unavailable/stale health, recovery,
  production disablement and reorg rejection.

The temporary schema was confirmed absent after rollback. Positive HTTP tests
used synthetic server identities. A separate check using the real Privy adapter
and server configuration rejected missing and malformed tokens with 401.
A valid real user session was not tested.

Migration 005 was applied to the isolated staging database. A real overlapping
sync invocation returned `already-running`. The first full cycle completed
indexing and ledger reconciliation but failed during the workflow's independent
chain re-verification with `TRANSACTION_RECEIPT_UNAVAILABLE_ALL_PROVIDERS`.
An independent database read confirmed health `blocked`, no new history, and
unchanged counts: 32 observations, 32 postings, 80 entries, 19 accounts,
11 projections, 32 bindings and 22 request versions. The verification cycle
was retried without bypassing evidence checks. The retry completed successfully
and marked health ready. Both workflow passes returned inserted 0, updated 0,
duplicate 11. All 22 allowed and 22 denied reads passed, lifecycle and shadow
comparisons matched, and altered replay, binding mutation and reorg checks
were rejected as expected. The historical dataset contained no new receipts;
actual projection advancement was exercised with the rollback-only fixtures.

An independent read after completion confirmed ready at
`2026-09-06T04:48:48.431Z`, 11 history rows, 11 projections, 32 bindings,
22 versions, 32 observations, 32 postings, 80 entries and 19 accounts.
No reorg audit rows remained. All five migrations were recorded.

## Operation and remaining gates

Run `npm run sync:receipts:staging -- --allow-remote-staging-database` with the
established staging/source environment. The job is one-shot; no scheduler or
continuous service has been deployed. A killed cycle leaves reads unavailable
until another complete verified cycle succeeds.

`npm run staging:receipt-server` starts the optional loopback-only reader on
port 5180 (configurable). It requires the staging flags, database, ownership
secret and existing Privy server configuration. The main server also registers
the same route, disabled by default.

Before production consideration: verify a valid real user login, deploy and
observe a staging schedule with freshness monitoring, and define an audited
financial reorg reversal/replacement policy. This phase quarantines orphaned
receipt evidence; it does not automatically reverse or replace ledger postings.
Transient failure recovery is distinct from financial reorg recovery. Historical
agent-owned and funder-specific access remains outside the proven scope.
