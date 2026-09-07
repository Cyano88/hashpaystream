# Trade monitoring follow-up - 2026-09-07

## Change

When Trade is enabled, the existing /readyz endpoint now checks Trade authentication configuration and SELECT access to all five Trade tables. The query returns no rows, performs no schema writes and does not retrieve listing photos, messages or reports. It uses a separate pool of at most one connection, coalesces concurrent probes, and sets a two-second connection timeout, one-second server statement timeout and 1.5-second client query timeout. The connection defaults to read-only transactions. Idle connection errors do not crash the shared service; subsequent probes reconnect.

Failure returns the existing generic 503/no-store response and a sanitized TRADE_UNAVAILABLE server diagnostic. Disabled Trade skips the extra check. Missing schema fails closed; initialize the Trade schema before enabling it on a fresh database.

Render already uses /readyz on the existing Starter service. This extends that provider health layer to Trade storage without adding a service or subscription. A sustained Trade readiness failure now participates in the same service-wide traffic removal/restart policy as other readiness failures. GitHub still independently probes the public feed and anonymous private-route boundaries, but its delayed schedule remains unsuitable for a promised five-minute end-to-end detection time.

## Verification

- Supported Node 22: readiness regressions plus Trade configuration, concurrent-query coalescing, rejection/recovery and private-error redaction tests passed.
- A real local TCP server that never answers the PostgreSQL startup packet verifies bounded connection failure.
- The exact table-access query passed against the existing dedicated Trade database with a diagnostic ten-second external connection allowance, taking 4415 ms from the operator PC. The production two-second connection allowance timed out on that external path. It was not relaxed in production code; live deployment readiness must establish operation over Render's internal connection.
- Direct SSH preflight was unavailable because the current SSH key was rejected. No SSH access settings were changed.
- Provider API confirmed main service /readyz, Starter plan, notifyOnFail=notify and Trade enabled. PostgreSQL recoveryStatus remains AVAILABLE, with startsAt=2026-09-03T22:40:53Z at this check. These are configuration/recovery-window checks, not proof of alert receipt or an independent retained backup.

Deployed code commit 4df8c1f12d8ec3d325e3c5f583b6c0428671f0b3 is confirmed live on the existing main Render service. The post-deploy public /readyz returned 200 in 1.328 seconds, confirming the candidate passed the internal Trade probe. Live health/feed checks returned 200; anonymous conversations, moderation and existing service requests returned 401. Hosted workflow run 34114360777 completed successfully against the same commit, including both readiness and Trade boundary checks. TypeScript compilation passed. These verify current healthy behavior; no production fault was injected and alert recipient delivery remains unverified.

## Outstanding operator inputs

An authorized alert recipient and permission for one test alert are pending. There is no configured SMTP/Resend/alert environment in this service; use the existing Render notification destination or an explicitly chosen delivery provider. Do not send messages to a guessed recipient or deliberately fail the production service to test notifications.

Independent encrypted backup destination and retention are pending. The prior isolated PostgreSQL 18 logical restore drill passed, but its temporary unencrypted dump was removed. Do not treat that drill or provider PITR as a retained independent backup. The next backup run must restrict export to the dedicated Trade database/role, encrypt before uploading, verify the uploaded object's checksum, and restore into an isolated target before claiming recovery coverage. Preserve the existing ownership secret through separate secure custody; regenerating it breaks ownership mapping. Keep backup secrets and URLs out of repository files and logs. No production dump, retention deletion or scheduled export was created in this follow-up.

## References

- https://render.com/docs/health-checks
- https://render.com/docs/notifications
- https://render.com/docs/postgresql-backups
