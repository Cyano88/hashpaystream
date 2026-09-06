# Trade operations - 2026-09-06

## Verified configuration

- Trade runs inside the existing main HashPayStream service. Its Render health check is /readyz and notifyOnFail is notify.
- The existing Production readiness monitor workflow is enabled on the public GitHub repository. The same job now probes Trade listings and the anonymous conversations/moderation boundaries. No new service, schedule, credentials or paid plan was added.
- Trade checks require a valid enabled feed and 401 JSON errors for private routes. Three attempts run with bounded timeouts; response bodies and credentials are never logged. Transport failure, disabled feed and invalid authentication responses fail closed in fixture tests; transient failure recovers.
- Local execution against production passed all Trade probes. Hosted workflow execution is recorded below after dispatch.
- Render's recovery API reports AVAILABLE, with the earliest recovery point 2026-09-03T22:40:53Z at audit time. This is a moving window, not a retained export.
- Existing paid database is available on PostgreSQL 18, without high availability. The separate logical Trade database passed the isolated restore drill in TRADE_RECOVERY_DRILL_2026-09-06.md.
- One configured moderator has successfully reviewed, dismissed and hidden labelled test reports from the Pixel.

## Monitoring limits

The workflow requests a five-minute schedule, but the latest three observed scheduled runs started at 18:22, 20:33 and 22:17 UTC. Do not claim a guaranteed five-minute detection time. Render service health checking provides a separate layer; neither layer proves that an email or Slack alert reached a person.

Render notification configuration is enabled. Recipient delivery and operator acknowledgement remain unverified; no test message was sent to an unrelated recipient. GitHub notification preferences also affect receipt of failed-workflow notifications.

## Incident procedure

1. Open the failed Production readiness monitor run. Read only status, path and timing; use workflow_dispatch to confirm recovery when appropriate.
2. If only Trade fails, check the existing main service deployment and Trade configuration. Preserve the dedicated database URL and ownership secret. Do not point Trade at the financial database or create a second Trade service.
3. For an abusive listing, open Trade enquiries, Review reports, select the report, inspect evidence, then Hide listing through its confirmation sheet. Verify the item and public photo no longer resolve. Dismiss reports that need no listing action.
4. Hide/block are not global account suspension. Trade currently has no account-wide ban control; escalation to the operator is required for recurring abuse. Do not represent a client-side block as an account ban.
5. For suspected data loss, preserve the current instance and validate an isolated recovery before changing any service connection. Use the dedicated logical Trade database for Trade-only restores. The shared host also contains financial data, so a host-level PITR operation is broader in scope.
6. For an application regression, compare the candidate rollback commit against current financial changes before reverting. The current known working shared-sheet web commit is 4778ee8; this is evidence, not permission to discard later unrelated changes.
7. Record incident time, affected route, deployed commit, action and verification. Exclude tokens, connection strings, private messages and account identifiers.

## Backup and evidence policy still needed

Render point-in-time recovery is verified available, and the small-dataset logical restore drill passed. Independent encrypted backup destination, export schedule/retention and ownership-secret recovery custody still need an operator decision. No unencrypted long-term export was retained from the drill.

Report evidence persists after listing removal; hide and dismiss resolve reports without purging evidence. No automatic evidence purge or retention period was introduced. A documented retention/deletion policy and reviewer coverage are required before widening the beta.

Release signing configuration and a real Privy login-switch test remain outstanding. Do not describe the installed debug APK as a signed public release.

## References

- [Render recovery and backups](https://render.com/docs/postgresql-backups)
- [Render notification behavior](https://render.com/docs/notifications)
- [Render health checks](https://render.com/docs/health-checks)
- [Recovery status API](https://api-docs.render.com/reference/retrieve-postgres-recovery-info)
