# Receipt backfill audit - 2026-09-05

This work continues `infra/financial-core-phase1` from commit `f4d2b93`.
The existing staging database was verified live with both Phase 1 migrations
applied and an empty receipt index before execution. It was not recreated.

## Findings corrected

- Receipt block hashes were syntactically checked but not compared with the
  canonical block header. Recovery now fetches that header and rejects a mismatch.
- Balance reads used latest state while receipt recovery used captured heads.
  Balance comparison now uses the captured audit block for each chain.
- A provider could return historical logs while returning no transaction receipt.
  Receipt lookup now explicitly tries alternate providers and rejects an unexpected
  transaction hash. All contract, event and transfer checks remain required.
- Refund history searches were unnecessarily broad. Confirmed Hash PayLink payer
  actions now supply candidate transaction hashes, bound to the same agreement,
  partner, escrow and action. The actual receipt, event and token transfer are
  still verified against chain evidence.
- The X Layer public RPC returned HTTP 400 / JSON-RPC -32602 for a 9,999-block
  log query: `block range greater than 100 max`. Recovery now locates the first
  funded/terminal position block using monotonic historical contract state and
  queries the corresponding single-block event. Repayment uses the equivalent
  monotonic `settledAgreements` state.
- The old backfill incorrectly equated the assessed X Layer terms commitment
  with the distinct Arc agreement terms hash. Each commitment is now checked
  separately, matching the existing protection and split-settlement signing code.
  The Arc escrow's agreement, terms, protected amount, token and router recipient
  are also verified on-chain.

Historical fallback scans have a time budget and optional aggregate-only progress
output. Production sources remain inside read-only SQL transactions. Staging
indexing remains gated on complete evidence and matching balances, followed by
an idempotency pass.

## Production boundary

This audit does not approve a production cutover. The legacy store remains the
system of record. Receipt indexing does not itself create ledger postings or
prove that every historical workflow has been migrated.
## Verified staging execution

The final guarded staging run completed successfully:

- 32 verified receipts: 24 on Arc Testnet and 8 on X Layer mainnet.
- 11 agreement activations, 5 refunds, 4 releases of completed work,
  4 advance fundings, 4 advance releases, and 4 split repayments.
- 11 authoritative agreements queried; 5 position references examined.
- No blocked evidence.
- Agreement escrow, X Layer advance escrow, and Arc repayment router balances
  all matched their independently reconstructed receipt totals at the audit blocks.
- First staging pass: 32 inserted, 0 duplicates.
- Second staging pass: 0 inserted, 32 duplicates.
- Production writes: 0.

Two of four configured legacy stores existed. The report distinguishes configured
stores from observed stores; it does not claim coverage of nonexistent stores.

Validation passed: full smoke suite, TypeScript checks, receipt block-hash and
terms-hash regression fixtures, alternate-provider/transaction-identity tests,
monotonic history boundary tests, staging safety checks, and git diff validation.

The next financial-core step is an independently audited projection/ledger-posting
backfill from these verified observations. That must reconcile separately before
any production route cutover.