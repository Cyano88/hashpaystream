# Trade production follow-up - 27 September 2026

## Confirmed deployment interruption cause

Live Render service srv-d7ilg0osfn5c73eaedf0 has one instance and a 10 GB persistent disk mounted at /data. Its configured health check is /api/health. Render explicitly disables zero-downtime deployments for services with attached disks: https://render.com/docs/disks#disk-limitations-and-considerations . Changing health-check timing, adding retries, or increasing instance count does not remove this disk constraint.

Source inventory (potential disk dependencies; live record parity has NOT been inspected):
- api/agent-wallet.ts: provisioning JSON and Circle CLI session directory, file-backed.
- api/agent-profile.ts: local-first write plus Postgres best-effort write; database failures fall back to files.
- api/privy-circle-link.ts: local mutation path exists alongside remote linking behavior; all live callers/configuration must be classified.
- api/event-registry.ts: disk hydration and Postgres hydration/persistence paths coexist.
- recipient wallets, POS, local currency profiles, activity and request stores also contain file adapters or migration fallback paths.

Do not detach/delete the disk or assume DATABASE_URL proves data parity. Before a stateless cutover:
1. Inventory configured store locations and record counts/digests remotely without exporting wallet sessions, credentials, personal data or record bodies.
2. Classify every active write as authoritative Postgres, disk-authoritative or deliberate cache. Migrate disk-authoritative adapters using database transactions and per-record concurrency controls. Financial journals must fail closed on database errors; no silent ephemeral fallback.
3. Back up disk/database and verify every required record and attachment has a recoverable destination. Backups and migration tools must not log contents.
4. Stage a diskless service with readiness and graceful draining, using an isolated database and synthetic records; test restart, database loss, duplicate requests and interrupted writes.
5. Prepare a reviewed cutover with write coordination, reconciliation and rollback. Prefer preserving the original service/disk during transition. Additional service/storage cost and domain routing changes require a concrete reviewed cutover, not an improvised disk deletion.

This pass does not remove the deployment interruption. Existing data is preserved.

## Listing lifecycle boundary

Existing completed Trades stay Published because the hosted checkout read previously returned state without updating the local listing. The new server-only release projection marks a listing sold after state 6 (released), pending=false, and a positive confirmed block. It verifies the authenticated thread, offer and original hosted reservation idempotency key inside a SQL transaction. Repeated/concurrent observations must increment the listing revision only once; removed listings stay removed. The browser cannot supply the payment result.

This projection runs when either participant refreshes the existing hosted checkout. It is not an unattended reconciliation worker. No old funding reservation is deleted or reused, and no escrow transaction is sent.

Remaining lifecycle work: reserved/funded visibility; explicit relisting after confirmed cancellation/refund; disputed/resolved outcome policy; unattended event reconciliation. Refund/dispute/cancel states do not automatically reopen a listing. The unique per-listing funding reservation remains intact until a separately reviewed relisting model exists. Do not equate this release-only improvement with full lifecycle coverage.

## Validation and live storage metadata

TypeScript, authenticated hosted-route tests and the isolated real PostgreSQL harness passed, including existing publication/community/funding tests and the new concurrent release projection test. Browser-injected state is ignored. No production transaction was signed.

A read-only SSH metadata inventory confirmed DATABASE_URL/POSTGRES_URL presence and DATA_PATH configuration. The disk has eight top-level entries: seven recognized store/session names and one still unclassified entry. Existing files include agent-wallet-provisioning.json, agent-profiles.json, circle-pocket-actions.json, event-registry.json, helper-profiles.json and helper-usage.json; circle-web-sessions is an existing directory. No file contents, session material or credentials were read/exported. A second pass used each adapter's exact fallback semantics: wallet-link, recipient-wallet, POS, Paycrest and local-currency JSON paths were not existing disk files; this is not evidence of database record completeness. Live record parity and remaining session migration requirements are still unverified.

## Deployment outcome

Release 9dbc905 deployed live as dep-das61evavr4c7395se10. Verified through the authenticated existing demo: after its confirmed released checkout refreshed, My listings showed Demo trade - NVDAx payment as Sold. Browse showed two items instead of three and omitted that completed listing. The other two listings were unchanged. No new payment, signing, manual Mark sold action or escrow modification was performed.

Deployment availability is NOT fixed by this release; the verified disk dependency and migration requirements above remain open. Reserved/funded/dispute/refund/relisting behavior and unattended reconciliation remain separate work.
