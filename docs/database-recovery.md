# Database recovery runbook

HashPayStream stores its ownership journal, signed webhook history, and agent
credential registry in the paid Render Postgres database. Treat database URLs,
exports, record contents, and agent credentials as sensitive.

## Recovery objectives

- Use Render point-in-time recovery for the smallest available recovery point.
- Keep a downloaded logical export in approved encrypted storage outside Render.
- Restore only into a new isolated database. Never test a restore against production.
- Measure the restore time during every drill; do not claim an RTO until measured.

## Establish the production baseline

Run the audit inside a Render one-off job so `DATABASE_URL` remains private:

```text
npm run audit:database-recovery
```

Record only the emitted fingerprint, row count, and validation booleans in the
private operations record. The command intentionally never prints store keys,
JSON values, connection strings, or credentials.

## Create the independent export

1. Open the HashPayStream database in Render and select **Recovery**.
2. Confirm point-in-time recovery is available and record the earliest and latest selectable times.
3. Select **Create export** and wait until the export is ready.
4. Download the `.dir.tar.gz` archive to approved encrypted storage outside Render.
5. Record its creation time, byte size, and SHA-256 digest without committing the archive.

Render retains dashboard exports for only its documented retention period, so
the downloaded copy is the long-term artifact.

## Perform an isolated restore drill

1. Choose a recovery time at least ten minutes old and create a new recovery database.
2. Copy existing settings, but do not point HashPayStream or any other service at it.
3. Wait for the recovery database to become available.
4. Run the audit against the recovery database with the production baseline:

```text
HASHPAYSTREAM_RECOVERY_EXPECTED_FINGERPRINT=<baseline> npm run audit:database-recovery
```

5. Require `ok`, `schemaValid`, and `fingerprintMatches` to be `true`, with zero missing or unexpected stores.
6. Record the elapsed restore time as the observed drill RTO.
7. Delete the isolated recovery database only after recording the result and verifying that no service references it.

Deleting a database also deletes its Render-held recovery material. Confirm the
database ID and service references before deleting any recovery instance.
