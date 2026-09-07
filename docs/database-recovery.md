# Database recovery runbook

Status: Render-only recovery is the accepted production approach. Recovery metadata is available; a provider restore drill and measured recovery time are still unverified. Do not require a Pixel backup, an external download, or a new backup service.

Database credentials, exports and record contents are sensitive. Keep them out of source control, release artifacts and command output.

## Verify recovery availability

Use the database Recovery page or the read-only Render recovery endpoint. Record the database identity, recoveryStatus, startsAt and observation time. AVAILABLE proves that recovery is offered, not that a restore has succeeded. Verify the currently selectable recovery window before choosing a point.

## Prepare a comparable baseline

The existing `npm run audit:database-recovery` command runs a read-only transaction and emits a fingerprint, row count, schema check and store-count checks. It reads only `public.render_durable_kv` and expects ten named stores. It does not verify Trade listings, community tables, other database schemas, externally stored assets, provider state or blockchain state. Inventory the actual database before claiming full recovery coverage; repository migrations alone do not prove which tables are deployed.

A baseline taken now cannot certify a restore to an earlier time while writes continued. For an exact comparison, use an explicitly authorized, observed write-quiescent interval that covers both the baseline snapshot and selected recovery point. Include all writers, not just the web service. Alternatively, use historical evidence tied to the selected point and document its coverage. Do not stop production writers under this runbook's authority alone.

Keep the baseline fingerprint, row count and validation booleans in private operations evidence. Do not print records or credentials. Run audits with credentials held in the process environment through the existing protected operations tooling.

## Perform an isolated Render restore drill

1. Confirm the concrete target, recovery point, expected baseline, coverage and cost before creating a recovery instance. The current release scope does not authorize an additional paid service.
2. Create only an isolated recovery database through Render once applicable authorization is present. Follow the provider's current minimum recovery-point age and selectable window.
3. Do not connect production services, workers, webhooks or notification senders to the restored database.
4. Wait for availability and run the read-only audit with `HASHPAYSTREAM_RECOVERY_EXPECTED_FINGERPRINT` set to the matching baseline. Require `ok`, `schemaValid` and `fingerprintMatches` to be true for the command's stated coverage, with zero missing or unexpected stores.
5. Independently validate every other deployed application table and required external asset reference identified in the inventory. A durable-store fingerprint alone cannot certify the full application.
6. Record the selected recovery point, request/availability/validation times, observed recovery duration and all coverage limitations. Do not claim a recovery time before measuring it.
7. Retain or remove the isolated instance only under applicable authorization after verifying its exact identity and that no service references it. Never delete the production database or change its service bindings as part of this drill.

No recovery instance, export, production write freeze or cutover has been performed by documenting this procedure. Financial public release remains NO-GO until the required recovery evidence is obtained.
