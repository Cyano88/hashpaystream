# Receipt ledger staging audit - 2026-09-05

## Verified result

The 32 previously indexed observations were independently reverified against
transaction receipts, canonical block hashes, confirmation depth, event fields,
and USDC transfers before posting. The audit ran against the isolated logical
`hashpaystream_staging_phase1` database. Production writes: zero.

| Check | Result |
| --- | --- |
| Receipt observations | 32: 24 Arc Testnet, 8 X Layer mainnet |
| Ledger postings | 32 |
| Ledger entries | 80 |
| Ledger accounts | 19 |
| Controlled contract accounts reconciled | 13 |
| First staging pass | 32 posted, 0 duplicates |
| Second staging pass | 0 posted, 32 duplicates |
| Altered duplicate | Rejected with LEDGER_IDEMPOTENCY_CONFLICT |
| Stored entries versus receipt plan | Exact match |
| Account balances versus receipt transfers | Exact match |
| Controlled balances versus chain at captured audit blocks | Exact match |

Before the write, the same batch passed inside a transaction that rolled back;
its persistence check returned zero postings. After the write, a separate
read-only database connection confirmed 32 postings, 80 entries, 19 accounts,
32 observations, and migrations 001 through 003.

## Mapping and safety

Each verified transfer debits its sender and credits its recipient, using
credit-normal token-movement accounts. Arc and X Layer have distinct account
identities even when the address is identical. Agreement escrows and the Arc
repayment router use `agreement_protected`; the X Layer advance escrow uses
`advance_deployed`. External addresses use `external_clearing`. All belong to
the system identity domain. This does not infer human/agent ownership, a user's
wallet balance, or an available application balance.

RepaymentSettled produces six entries for the three independently verified
funder, provider and treasury transfers. Posting keys use network, chain,
transaction and log index. Duplicate/reorg source identities and changed replay
content fail closed. This bounded historical backfill requires supported,
positive-value transfer shapes; unsupported or incomplete evidence stops it.
It is not a continuously running indexer or a reorg reversal engine.

The runner verifies its actual database name, requires an explicit staging
attestation and remote-staging flag, rejects source/target database aliases,
rechecks the observation set inside a serializable transaction, and posts the
whole batch atomically. It reconciles the complete staging ledger, so unrelated
or additional postings stop the audit rather than being silently ignored.
On-chain reconciliation is a snapshot at the captured heads, not a claim about
balances after later transactions.

Migration 003 closes a posted-entry immutability gap: an UPDATE cannot move an
entry out of a posted transaction into a draft transaction. Row locks serialize
entry changes with posting finalization and account changes. The rollback-only
PostgreSQL harness passed all 12 checks across 12 tables and 26 triggers using
all three migrations.

## Receipt UI audit

Customer and worker receipt details and exports now include the authoritative
early-pay split. Pending repayments are explicitly labelled as agreed amounts.
Refunded early funding shows returned principal, zero partner profit and zero
platform fee; the signed quote's projected earnings are not presented as paid.
Submitted-work HTTPS links remain available on both workflows and inside their
transaction details.

Funder receipts use the same details, image and PDF actions. They distinguish
X Layer funding from Arc repayment and retain the position proof. The source
currently supplies no receipt timestamp or settlement transaction hash, so the
receipt leaves the date unknown and does not invent a transaction explorer link.
The existing funding escrow link follows the configured X Layer network.

The share preview scrolls independently while retaining visible action buttons.
The exported canvas/PDF height grows with the split rows, and its explorer link
annotation follows the reference row.

Validation:

- Full smoke suite passed, including new transfer-ledger, six unsafe staging
  invocation, split/refund, pending-state and integer-precision checks.
- TypeScript and production build passed. Vite emitted dependency annotation
  and large-chunk warnings; these did not fail the build.
- Playwright exercised actual customer/worker/funder receipt components with
  synthetic inputs at 390x640 and 320x568, including dark mode and refund states.
- Customer JPEG and PDF downloads and funder PDF download succeeded. A mocked
  native-share API received nonempty image/PDF Files. An actual OS/mobile share
  destination was not tested; an initial native-share download expectation
  timed out, so fallback and native API handoff were tested separately.
- The customer PDF was rendered and visually inspected: all split rows, the
  reference, explorer link and footer fit. The funder PDF was also rendered.
- The synthetic browser fixture's only console error was its missing favicon.
  This was component QA, not an authenticated production workflow test.

Synthetic fixtures, screenshots and exports remain ignored under
`output/playwright/`; they are not production routes or committed customer data.

## Production rollout preparation and remaining gates

Legacy lifecycle storage remains authoritative. The following work is required
before a production cutover proposal is ready:

1. Bind reconciled observations to validated agreement/position projections and
   explicitly verified human/agent ownership; test authorized receipt and
   balance reads without presenting clearing balances as user funds.
2. Exercise ongoing ingestion, overlapping retries, reorg/conflict handling and
   old/new read comparison in staging. Reconcile the fresh source set again.
3. Resolve the deployment, signer and network gates recorded in
   FINANCIAL_CORE_STAGING_2026-09-05.md and validate authenticated role flows.
4. Prepare the exact additive production migration, backups/recovery evidence,
   shadow-read monitoring and route rollback plan for approval. Do not execute
   the staging-only backfill against production or switch live reads as part of
   this audit.

No production deployment, route switch, contract transaction or funds movement
was performed by this continuation.
