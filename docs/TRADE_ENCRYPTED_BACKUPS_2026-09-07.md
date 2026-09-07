# Encrypted Trade backups

Status: export tooling and an isolated synthetic PostgreSQL 18 restore drill are complete. Production exports, off-site upload, scheduling, retention deletion and production recovery-key custody are not enabled.

## Scope

The command accepts only the dedicated `hashpaystream_trade_pilot` database and `hashpaystream_trade_pilot_user` role. It rejects superuser/role-creation/database-creation privileges and unexpected non-system tables. The five Trade tables are explicitly selected for export; financial databases are outside this command's scope.

A read-only repeatable-read transaction supplies the snapshot to PostgreSQL 18 `pg_dump`. The custom-format archive streams directly to age encryption. Only encrypted bytes are written to the chosen destination. A completed export is flushed, published without overwriting an existing file, and accompanied by a SHA-256 file. Failed exports remove their artifacts. A hard interruption can leave a uniquely named `.partial` file; do not treat it as a completed backup.

The backup process needs only an age public recipient. Keep the corresponding private recovery key separately, outside the repository and backup destination. Do not reuse the Android release-signing key. Child tools receive only the necessary system environment and, for pg_dump, the dedicated Trade connection settings; unrelated service secrets are not forwarded. Database passwords are passed in the short-lived dump process environment, never command arguments or logs. Run on a trusted, access-controlled host.

## Activation inputs

Choose the independent private storage destination, retention period, schedule and recovery-key custodian before activation. A local export directory is staging, not proof of an independent retained copy. No storage provider or cost was chosen by this implementation.

Supply these variables securely to `npm run backup:trade`:

| Variable | Required value |
| --- | --- |
| HASHPAYSTREAM_TRADE_DATABASE_URL | Dedicated Trade database connection |
| HASHPAYSTREAM_TRADE_BACKUP_RECIPIENT | Public age1 recipient from the separately held recovery key |
| HASHPAYSTREAM_TRADE_BACKUP_DIRECTORY | Existing absolute private directory outside a Git repository |
| HASHPAYSTREAM_PG_DUMP_PATH | Absolute path to PostgreSQL 18 pg_dump |
| HASHPAYSTREAM_AGE_PATH | Absolute path to age |
| HASHPAYSTREAM_TRADE_BACKUP_CA_FILE | Optional trusted CA file for the dump client's external TLS connection |

External database connections require certificate and hostname verification. Without an explicit CA file, libpq uses `PGSSLROOTCERT=system`; verify the host's trust setup during the production preflight. The existing internal/local database connection policy is preserved. Both the Node connection and pg_dump must trust the server; a missing trust root must be fixed without weakening verification.

The command prints only the completed encrypted file path, ciphertext hash and size, or a generic failure. A nonzero exit means no successful export should be reported.

## Retention and recovery procedure

1. Create the encrypted export on a private staging filesystem.
2. Upload it and its checksum to the chosen independent private destination. Verify the uploaded bytes against the checksum before reporting success. This upload step is not implemented until a destination is selected.
3. Keep failed or missing runs visible to the operator. Do not use an unreliable scheduler as a guaranteed backup interval.
4. For a drill, download the encrypted archive into a private isolated workspace and verify its ciphertext checksum.
5. Decrypt with the separately held recovery identity. Wait for age to exit successfully before using any decrypted output; authentication failure must abort restoration. A partial plaintext output from a failed decryption must be removed.
6. Restore with PostgreSQL 18 pg_restore using `--exit-on-error --single-transaction --no-owner --no-acl` into a fresh isolated database. Never point a verification restore at the production connection.
7. Compare all tables, constraints and indexes; recreate the restricted role and grants through the recovery procedure. Preserve the existing Trade ownership secret and authentication configuration separately. These secrets are not part of the database export.
8. Verify private ownership and authentication before considering cutover. Remove temporary plaintext and test data after the drill. Apply retention deletion only after an explicit policy is selected and the replacement backup is verified.

The .sha256 file helps detect transfer damage; successful authenticated decryption and a restore drill are still necessary.

## Verification on 2026-09-07

The committed `npm run test:trade-backup` test initializes a disposable local PostgreSQL 18 instance and disposable age identities. It uses synthetic records only. It tests:

- Wrong database, missing recipient, unexpected tables and repository destinations are rejected.
- Export, decryption and restore preserve all five tables, foreign-key/other constraints and indexes; the source remains unchanged.
- A wrong recovery identity and modified ciphertext cannot be successfully decrypted.
- Failed producers and timed-out producers leave no completed or partial backup artifacts.
- Unrelated secrets are excluded from the child-tool environment.

The fixture database, plaintext and encrypted archives, and disposable recovery keys are removed afterward. Windows pg_ctl startup uses uncaptured handles so inherited daemon pipes cannot stall the test.

Run tests with `HASHPAYSTREAM_POSTGRES_TEST_BIN` pointing to the PostgreSQL 18 binary directory and `HASHPAYSTREAM_AGE_PATH` pointing to age; age-keygen must be alongside age. Node 22 is the supported project runtime.

Local validation used PostgreSQL 18.6 and age 1.3.2. The Windows age archive matched the publisher's GitHub release SHA-256 digest `f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7`. No production data was exported by this drill.

## References

- [age usage and key separation](https://github.com/FiloSottile/age)
- [PostgreSQL 18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)
- [PostgreSQL TLS verification](https://www.postgresql.org/docs/18/libpq-ssl.html)
