# Staging receipt scheduling - 2026-09-06

The separate `render.receipts-staging.yaml` defines a receipt sync every 15
minutes and an independent monitor at minutes 3, 8, 13 and every five minutes
thereafter. Both use the isolated financial-core branch with automatic deploys
disabled. The production Blueprint is unchanged.

The monitor shares the receipt API's 15-minute freshness rule. It exits nonzero
for missing, blocked, stale, invalid, orphaned or overdue sync state. A syncing
state is operationally healthy only while the actual sync advisory lock is held
and the cycle started within 15 minutes. Reads remain unavailable during that
cycle. The monitor releases its probe lock at read-only transaction rollback.
Its output contains status and age only, with no customer or receipt data.

The monitor receives only a staging database connection. Placeholder source
URLs satisfy the existing boundary validator; they are never connected to.
The sync receives source database connections and the ownership HMAC secret,
plus allowlisted contract/store configuration. No wallet, signer or Privy
credentials are needed by either scheduled job.

Render's API validated the Blueprint: exactly two cron services, no new database
or production-service change. TypeScript and workflow/freshness tests passed.
A direct read-only monitor invocation returned READY with the actual staging
verification age. The PostgreSQL/HTTP harness passed with all five migrations, 12 HTTP cases,
replay and immutability checks, and no temporary schema persisted.

Operation: `npm run monitor:receipts:staging -- --allow-remote-staging-database`.
A monitor failure is available in Render run status/logs; no external message
or notification destination is configured by this change. Render schedules use
UTC and serialize overlapping runs. Cron jobs incur runtime charges with a
minimum monthly charge per job; see https://render.com/docs/cronjobs.

Real login remains a separate gate. The browser-control runtime failed to start
twice; the Playwright CLI reported no existing browsers. No valid user token
has been obtained or simulated as a real login. Financial reorg reversal and
production cutover remain outside this phase.


## Deployment evidence

Both cron services built and deployed commit
`bfa0bba4da5d34672e798a80eb62e4087762547d` successfully:

- Sync: `crn-daef9cv40ujc73f0hclg`, schedule `*/15 * * * *`.
- Monitor: `crn-daef9df40ujc73f0heqg`, schedule `3-58/5 * * * *`.

Both report automatic deploy disabled and branch
`infra/financial-core-phase1`. The production web service still tracks `main`.
The monitor's scheduled 05:08 UTC run exited 1 with STALE, correctly detecting
that no sync had refreshed the 04:48 snapshot. An independent local read-only
check also returned STALE. The first cloud sync was then triggered after
checking that no existing sync run would be interrupted.


## Cloud recovery correction

The first cloud sync verified 30 receipts and failed closed on one activation
and one completion with CONTRACT_EVENT_MISSING. Inspection found that event
lookup stopped on an empty successful RPC result, which does not activate the
transport's error fallback. Event lookup now tries the configured providers
on empty results, preserving unique-event, transaction-receipt and canonical
block checks. Ambiguous results still fail immediately. Explicit regression
tests passed for empty fallback, all-missing/all-unavailable providers,
ambiguity and bounded historical scans. This is a handling gap discovered from
the failure; cloud verification of the correction follows deployment.
