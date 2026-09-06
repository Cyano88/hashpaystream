# Trade recovery drill - 2026-09-06

Status: isolated logical backup/restore drill PASSED. This is not a disaster failover or load test.

## Scope and isolation

Source: only the dedicated hashpaystream_trade_pilot database, using its restricted Trade role through HASHPAYSTREAM_TRADE_DATABASE_URL on the existing main service. The script rejected unexpected database/role names, tables and non-system schemas. No financial database was exported, restored or modified.

Source reads used a repeatable-read, read-only transaction and an exported snapshot shared with pg_dump. pg_dump also used default_transaction_read_only. The target was a fresh PostgreSQL 18 instance bound to 127.0.0.1:55440 with a generated temporary SCRAM password. No Windows service was installed.

Official PostgreSQL 18.6 binaries were downloaded from EDB, linked by PostgreSQL's Windows download page. Existing PostgreSQL 17 tools were not used against the PostgreSQL 18 source.

## Verification

| Object | Rows restored | Full row contents |
| --- | ---: | --- |
| Listings | 2 | Matched |
| Threads | 1 | Matched |
| Messages | 2 | Matched |
| Reports, including JSON evidence | 1 | Matched |
| Blocks | 0 | Matched |

Every row was compared through sorted content hashes against the same snapshot. Constraint definitions and indexes also matched. Message text, account identifiers, secrets and raw evidence were not printed or committed.

- Dump duration: 36.551 seconds.
- Restore duration: 0.385 seconds.
- Both source and restore server major version: 18.
- Main health and public Trade listings returned 200 during the drill.
- Anonymous Trade conversations, moderation and existing service requests returned 401.
- Temporary PostgreSQL stopped successfully.
- Temporary archive, password file and restored data directory removed after verification, with the cleanup path checked against the dedicated local output directory.
- Only sanitized result evidence remains locally in output/playwright/trade-restore-evidence.json. Local audit helper: output/playwright/trade-restore-audit.mjs.

## Practical limits and remaining work

This proves the current small Trade database can be logically restored, including retained moderation evidence. It does not prove recovery time at larger scale, point-in-time recovery, provider outage failover, or a scheduled backup retention policy.

The dump deliberately omits ownership and grants. A disaster recovery target must recreate the restricted Trade role and its grants, preserve the existing Trade ownership secret and Privy configuration through the operator's secure configuration process, then verify authentication and private ownership before cutover. Do not regenerate the ownership secret during recovery.

Before public testing, define backup schedule/retention, monitoring destination, reviewer coverage and evidence retention/deletion procedures. Signed Android release and remaining account-switch/retry/hide-action live tests are tracked in TRADE_TWO_ACCOUNT_RELEASE_PREP_2026-09-06.md.

## Sources

- [PostgreSQL pg_dump documentation](https://www.postgresql.org/docs/18/app-pgdump.html)
- [PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/)
- [EDB binary archives](https://www.enterprisedb.com/download-postgresql-binaries)
