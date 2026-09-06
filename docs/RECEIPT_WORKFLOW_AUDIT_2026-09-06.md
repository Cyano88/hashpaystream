# Receipt ownership and workflow staging audit - 2026-09-06

## Scope and evidence

This continuation binds the verified receipt ledger to customer/provider request
ownership and financial agreement projections in the isolated staging database.
Production sources are read in read-only transactions; no production route,
contract transaction, signer setting or available balance is changed.

The read-only source audit found 16 requests, of which 12 reference agreements.
All 12 have matching accepted versions and customer/provider ownership records.
Three participant account references match their server HMAC identities. Eleven
agreements have activated, receipt-backed evidence. The remaining linked request
is awaiting funding without an activation attempt; its draft is excluded. Four
requests have no agreement. No agent-owned historical agreement was present.

All 32 confirmed observations map unambiguously to the 11 agreements, including
X Layer position receipts mapped through their assessed funding terms:

| Projected lifecycle | Agreements |
| --- | --- |
| Completed | 4 |
| Refunded | 5 |
| Expired | 2 |

The planner verifies account HMACs, request/owner references, both accepted terms
versions, Hash PayLink resource/project references, protected amounts, on-chain
terms commitments, escrow identities, and payer/provider wallet bindings. Current
account wallet bindings must agree with the relevant source contract/position
fields. This is verification of stored authenticated bindings against evidence;
it does not perform a new Circle/Privy user login or prove fresh key possession.

The existing service request, version, agreement and agreement-projection tables
hold the financial subset. Normalized financial version hashes are distinct from
the accepted on-chain agreement terms hash. Work descriptions, emails, credentials
and payer capabilities are not copied into the projections or audit output.

## Replay and read boundaries

Migration 004 adds append-only receipt-to-agreement bindings. A binding requires
a confirmed observation with a posted ledger transaction. It also rejects changes
to a projection payload or observation timestamp that reuse the same source
version, and prevents changing the projection's agreement identity.

The backfill requires a staging database name, staging attestation and explicit
mode. It rejects source/target aliases, validates source collection shapes,
reverifies the canonical receipts and all ledger balances, checks source stability,
and writes atomically under a serializable transaction and advisory lock. Replays
must match stored request participants, financial terms, agreement fields and
projection content exactly. A changed snapshot requires a separately reconciled
update path; it is not silently overwritten.

An early dry run correctly stopped on source drift. The only changed field was
an activation record's polling timestamp. The projection now uses the verified
ledger receipt block times for its evidence timestamp, so identical evidence does
not change when the authoritative service polls again. A regression test covers
this. The receipt block watermark is not an ongoing workflow event sequence.

The internal staging read adapter permits the request's human customer/provider
principal and denies other accounts or an agent principal reusing a human key.
It returns receipt evidence and financial lifecycle amounts with
`availableBalance: null`. Arc and X Layer transfers remain network-labelled.
Conflicting blocks or explicit reorg observations stop the read. Production HTTP
routes do not mount this adapter; a future integration must supply the principal
from server-verified authentication, never from caller-provided ownership fields.
Funder-specific access and agent-owned projections are outside this historical
customer/provider batch and are not claimed as implemented.

## Validation completed before the write

- Four migrations passed the rollback-only PostgreSQL harness: 14 checks,
  13 tables and 29 triggers.
- Full smoke suite and TypeScript checks passed. Targeted workflow tests also
  passed after the stable-timestamp fix.
- Forged owner/payer HMACs, account conflicts, wallet mismatches, unaccepted terms,
  altered evidence, ambiguous bindings, duplicate observations and human/agent
  domain confusion were rejected.
- Six unsafe workflow invocations were rejected before any database operation.
- The live rollback-only backfill inserted 11 projections and 32 bindings inside
  the transaction; its second pass inserted zero and returned 11 duplicates.
- All 22 customer/provider reads matched their projected evidence. All 22
  unrelated-account and cross-domain reads were denied. Legacy lifecycle reads
  independently matched the 11 projected statuses.
- Changed replay content was rejected. A synthetic reorg observation inside a
  savepoint blocked reads, and the synthetic record was rolled back.
- The outer rollback left zero projections persisted. Existing 32 ledger
  postings and 80 entries remained intact and matched fresh chain evidence.

## Verified staging write

The guarded write committed successfully. Its first pass inserted 11 projections;
its second inserted zero and identified all 11 as duplicates. All 32 receipt
bindings matched, 22 participant reads passed, and 22 unrelated/cross-domain
reads were denied. Legacy lifecycle states matched. Changed replay content,
reorged evidence reads and deletion of an immutable binding were rejected.
Every synthetic negative test was rolled back to its savepoint before commit.

A separate read-only connection then confirmed:

- 11 persisted agreement projections and 22 financial request versions;
- 32 receipt bindings and 32 confirmed observations;
- 32 ledger postings, 80 entries and 19 accounts;
- zero synthetic reorg rows;
- migrations 001 through 004 applied.

Production writes, route switches and funds movements: zero.

## Remaining production gates

This is a bounded historical staging projection and read comparison, not a
continuous ingestion service or production authorization/cutover approval.

Next implement and exercise incremental ingestion, overlapping deliveries,
source-version progression and reorg recovery in staging. Extend verified
principal binding to funder/agent access where required, integrate the staging
adapter through real authentication, and compare the full intended read surface.
Resolve the deployment, signer and network gates in the financial-core staging
record before preparing an exact production migration, monitoring and rollback
proposal. Legacy production reads remain authoritative.
