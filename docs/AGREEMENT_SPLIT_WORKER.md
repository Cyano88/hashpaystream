# Embedded agreement split worker

Implemented locally in the existing HashPayStream server. No additional Render service is required or created. Not deployed or activated by this change.

The server starts the runtime after it begins listening. A verified Upfront agreement.completed webhook requests a pass; periodic passes catch completed agreements missed during downtime. The existing daemon coalesces wakeups, backs off deferred passes and uses the same PostgreSQL advisory lock as the standalone worker, so both paths coordinate during replacement or rolling deployment. On-chain settledAgreements remains the final duplicate-payment guard.

## Activation

Both HASHPAYSTREAM_SETTLEMENT_WORKER_ENABLED and HASHPAYSTREAM_UPFRONT_AUTO_SETTLEMENT_ENABLED must be true. The worker flag defaults off; auto-settlement alone does not activate signing. An enabled runtime validates its configuration before creating the lease pool. Invalid enabled configuration prevents startup rather than silently presenting a running worker.

Before activating, verify the exact deployed escrow/router versions, configured authorized repayment signer, router pause state, relayer gas, provider project and database connectivity. Use the existing settlement:preflight plus reviewed deployment verification as applicable. The current Arc implementation remains testnet-only. No deployment or enablement is implied by a local test pass.

The interval defaults to 30 seconds and is bounded to 10 seconds through 5 minutes. Provider reads have a 20-second deadline and receipt confirmation a 60-second deadline. Database lease acquisition and queries are bounded. A failed unlock destroys that connection so a potentially held session lock is not returned to the pool.

## Shutdown and rollback

Shutdown stops new worker scheduling and waits for the active pass alongside HTTP draining. The existing 25-second service shutdown limit remains authoritative; a longer transaction wait can be interrupted by process exit. A subsequent worker pass must reconcile on-chain settled state before submitting again. This change does not yet add durable transaction hashes; transaction-linked receipt recovery remains the next agreement-layer task.

To deactivate, set the worker flag false and restart the service through the normal deployment process. Do not change keys, delete records or operate a second uncoordinated worker as a rollback.

## Verification

Node 22 checks passed for runtime activation, competing lock holders, startup idempotence, webhook wakeups, daemon scheduling/backoff, stopping during an active pass, no post-stop work, failed unlock cleanup, provider timeout continuation, and HTTP/worker drain with a bounded forced exit. Surface checks confirm actual server startup/webhook/shutdown wiring. TypeScript validation passed.

Runtime concurrency tests use a controlled pool; they do not certify live PostgreSQL failover, a deployed worker or a real split. No production secrets, signing, funds movement or notification delivery were used in tests.
