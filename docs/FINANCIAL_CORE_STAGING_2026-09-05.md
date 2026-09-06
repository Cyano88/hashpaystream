# Financial core staging record - 2026-09-05

This record covers the additive Phase 1 financial-core foundation only. It is
not a production approval, route cutover, or claim that legacy balances have
been reconciled.

## Production boundary audit

The production release gate failed closed on the following conditions:

- dirty development worktree;
- legacy X Layer deployment traceability and settlement version;
- Arc Testnet and legacy router deployment;
- incomplete independent V2/V4 approval and deployment record;
- raw signer declarations in the Render specification;
- legacy key-value lifecycle state remaining authoritative.

Savings remains isolated and the Arc/X Layer hybrid remains a public pilot.

## Read-only legacy inventory

The production legacy inventory ran inside a read-only transaction and emitted
only aggregate counts:

- 7 of 11 configured stores currently exist;
- 3 account records;
- 16 service requests across 27 request versions;
- 12 human and Upfront agreement references;
- 27 lifecycle events;
- 20 money-related events requiring authoritative evidence;
- 0 ledger postings ready for migration.

No identity, wallet address, agreement identifier, transaction hash, or payload
was emitted. The result means no balance should be backfilled or displayed from
the new ledger until Hash PayLink and on-chain evidence reconciliation exists.

## Isolated staging database

A separate logical database named `hashpaystream_staging_phase1` was created on
the existing HashPayStream PostgreSQL cluster. No production schema or table was
created, changed, or deleted.

Before migration, the rollback-only harness applied both migrations in a random
schema, exercised 11 invariants across 12 tables and 26 triggers, and rolled the
entire transaction back successfully.

The additive migrations then applied successfully to staging:

- `001_financial_core`
- `002_workflow_projections`

The migration runner rejects remote databases unless the caller provides the
remote-staging flag, attests the environment as staging, and targets a database
whose name explicitly contains `staging`.

## Remaining Phase 1 gate

The legacy key-value store remains the system of record. Before any route
cutover, implement a replayable backfill that requires authoritative evidence,
run it in staging, reconcile every posting to zero difference, and prove repeat
runs are idempotent.

## Receipt-index continuation

The receipt backfill has now been implemented, audited and run in staging.
All 32 verified observations were inserted once; a second pass inserted zero
and reported 32 duplicates. All three escrow/router balance comparisons matched.
See [the receipt audit record](./RECEIPT_BACKFILL_AUDIT_2026-09-05.md) for the
corrected recovery issues, evidence coverage and remaining ledger/cutover gates.
## Receipt-ledger continuation

The next bounded staging gate has passed: the 32 independently reverified
observations now map to 32 balanced postings and 80 entries. Both idempotency
passes and all 13 controlled-account on-chain comparisons matched. A separate
read-only check confirmed persistence. Migration 003 also protects posted
entries from being moved into draft transactions.

See [the receipt-ledger audit](./RECEIPT_LEDGER_AUDIT_2026-09-05.md) for the
mapping, exact checks, receipt UI fixes and remaining production gates. These
system-domain token-movement accounts do not establish user available balances;
legacy reads remain authoritative until ownership/projections and ongoing
shadow reconciliation are validated.


## Ownership and workflow continuation - 2026-09-06

The next historical staging gate passed: 11 agreement projections, 22 financial
request versions and 32 receipt bindings are persisted. Customer/provider
ownership records, accepted terms and wallet bindings matched the authoritative
evidence. All 22 allowed reads and 22 denied reads behaved as expected; legacy
lifecycle states matched. Replays, altered projections, binding mutations and
reorg evidence were checked. Five requests without confirmed receipts were
excluded, including one linked but unactivated draft.

See [the workflow audit](./RECEIPT_WORKFLOW_AUDIT_2026-09-06.md) for exact evidence,
limitations and remaining incremental-ingestion/authentication/cutover gates.
No production route was switched, and no available balance was inferred.


## Incremental sync and authenticated reads - 2026-09-06

Migration 005 and the one-shot receipt sync are now verified in staging. The
complete cycle reached ready after a transient provider receipt failure first
left it blocked. Receipt, ledger and ownership replay checks passed without
new financial entries. The opt-in reader uses server-verified Privy identity
and requires fresh successful sync health.

See [the incremental audit](./RECEIPT_INCREMENTAL_AUDIT_2026-09-06.md) for the
PostgreSQL and HTTP checks, failure/recovery evidence and operation commands.
A valid real user login, scheduled staging operation and a financial reorg
reversal policy remain unverified or unimplemented. Production remains unchanged.
