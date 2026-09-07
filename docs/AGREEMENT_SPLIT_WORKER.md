# Embedded agreement split worker

Implemented locally in the existing HashPayStream server. No additional Render service is required or created. Not deployed or activated by this change.

The server starts the runtime after it begins listening. A verified Upfront agreement.completed webhook requests a pass; periodic passes catch completed agreements missed during downtime. The existing daemon coalesces wakeups, backs off deferred passes and uses the same PostgreSQL advisory lock as the standalone worker, so both paths coordinate during replacement or rolling deployment. On-chain settledAgreements remains the final duplicate-payment guard.

## Activation

Both HASHPAYSTREAM_SETTLEMENT_WORKER_ENABLED and HASHPAYSTREAM_UPFRONT_AUTO_SETTLEMENT_ENABLED must be true. The worker flag defaults off; auto-settlement alone does not activate signing. An enabled runtime validates its configuration before creating the lease pool. Invalid enabled configuration prevents startup rather than silently presenting a running worker.

Before activating, verify the exact deployed escrow/router versions, configured authorized repayment signer, router pause state, relayer gas, provider project and database connectivity. Use the existing settlement:preflight plus reviewed deployment verification as applicable. The current Arc implementation remains testnet-only. No deployment or enablement is implied by a local test pass.

The interval defaults to 30 seconds and is bounded to 10 seconds through 5 minutes. Provider reads have a 20-second deadline and receipt confirmation a 60-second deadline. Database lease acquisition and queries are bounded. A failed unlock destroys that connection so a potentially held session lock is not returned to the pool.

## Shutdown and rollback

Shutdown stops new worker scheduling and waits for the active pass alongside HTTP draining. The existing 25-second service shutdown limit remains authoritative; a longer transaction wait can be interrupted by process exit. A subsequent worker pass must reconcile on-chain settled state before submitting again. Settlement evidence now preserves the transaction hash, original chain/router, agreement hash, block identity, timestamp and emitted split amounts. A durable block checkpoint is written before submission. Retries read settled state first and recover proof from the router event instead of paying again.

To deactivate, set the worker flag false and restart the service through the normal deployment process. Do not change keys, delete records or operate a second uncoordinated worker as a rollback.

## Verification

Node 22 checks passed for runtime activation, competing lock holders, startup idempotence, webhook wakeups, daemon scheduling/backoff, stopping during an active pass, no post-stop work, failed unlock cleanup, provider timeout continuation, and HTTP/worker drain with a bounded forced exit. Surface checks confirm actual server startup/webhook/shutdown wiring. TypeScript validation passed.

Runtime concurrency tests use a controlled pool; they do not certify live PostgreSQL failover, a deployed worker or a real split. No production secrets, signing, funds movement or notification delivery were used in tests.

## Transaction evidence recovery

Only a successful receipt with exactly one matching router/agreement event is accepted. Two confirmations and a matching canonical block hash are required before persistence; this is not an absolute finality guarantee. Status and evidence are committed together. Existing conflicting evidence is rejected. A missing checkpoint for an externally completed settlement can be seeded only from the matching checked-in router deployment record, never an invented block or another router. Unknown historical targets require a verified deployment record.

Recovery scans at most 100 blocks per agreement per pass, preserving progress with a two-block overlap. RPC errors and incomplete evidence defer the record; they cannot mark it settled or authorize another submission when the router already reports it settled. A historical scan can therefore require multiple passes. Existing records and signer secrets are never deleted or exported by recovery.

The funding receipt uses this proof for its Arc transaction link and shared image/PDF transaction hash and timestamp. Older settled records without recovered proof do not receive a fabricated transaction link. Full live financial execution remains gated on separate activation and an authorized walkthrough.
