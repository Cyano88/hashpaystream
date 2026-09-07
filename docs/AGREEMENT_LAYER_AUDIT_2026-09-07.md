# Agreement layer audit - 2026-09-07

Scope frozen to existing agreement behavior: creation/acceptance, funding, delivery/review, automatic repayment split, cancellation/refund, receipt evidence and retries. Finish this layer before moving to savings or Trade. No new agreement products are proposed.

## Current verdict

NOT COMPLETE. Component checks pass, but live automated settlement is not connected to an executing HashPayStream settlement runtime. Do not describe automatic splits as production-ready.

## Verified checks

Fourteen targeted scripts passed under Node 22: agreement gateway, Upfront gateway, agent gateway, service requests, Upfront service requests, operator reviews, protection/repayment attestations, protection handler, fee calculation, standard/Upfront/agent webhook handling, settlement worker and settlement daemon. These exercise role isolation, immutable acceptance, stale-version rejection, router isolation, signature versions, fee arithmetic, webhook verification, retries and daemon leasing. They use controlled dependencies; they do not prove live end-to-end payment execution.

## Ordered gaps

1. **Connect the automatic split runtime.** `server.ts` creates the Upfront webhook handler without a settlement trigger and does not start a worker. Render's service inventory has no dedicated HashPayStream settlement worker. The main service starts `npm run start`; AUTO_SETTLEMENT_ENABLED is true while SETTLEMENT_WORKER_ENABLED is unset. Existing cron services are staging receipt jobs, not the split worker. Integrate the existing leased daemon into the existing service with periodic catch-up, webhook wake-up, bounded shutdown and explicit activation control. Do not create another paid service. Validate startup, duplicate webhook/process coordination, retries and drain before activation.
2. **Bound stalled work.** Fixed locally: provider requests now abort after 20 seconds, including response-body reads; a timeout defers the affected agreement and processing continues. Receipt confirmation explicitly times out after 60 seconds; existing on-chain settled checks remain the retry recovery path. A regression test stalls the real provider adapter and verifies that the following agreement still settles through mocked signing/submission. No live transaction was sent.
3. **Verify target deployment and switch coherently.** Current configured signature defaults remain legacy escrow 1 / repayment 3, and Arc integration is testnet-only. Reviewed V2/V4 support is prepared locally, not deployed. Existing contract identity, configuration and network gates in REVIEWED_DEPLOYMENT_PREPARATION_2026-09-07.md remain. Database history deletion is not migration of contract state.
4. **Preserve settlement transaction evidence.** The submit adapter currently returns void, and markSettled persists only status. FundingPositionReceipt supplies an empty transaction hash and uses a contract-address explorer link. A status badge is not a transaction-linked split receipt. Bind the actual settlement transaction and original network to durable settlement evidence and receipts, including recovery when the chain succeeds before a database write.
5. **Complete live agreement walkthrough.** Local gateway/worker checks do not certify the upstream provider's actual delivery review, cancellation/refund, wallet confirmation, receipt export or final light/dark presentation. Verify those existing flows on the intended deployment after target/runtime readiness, with separately authorized financial actions where needed.

## Completion criteria for automatic splits

A completed eligible agreement must pay exactly the accepted funder repayment, provider remainder and platform fee once; a refund, incomplete repayment, wrong agreement/router/domain or invalid funding terms must not split. Restart, duplicate notification, RPC timeout and a database-write failure after chain success must recover without an extra payment. Show a verifiable transaction receipt. Prove the deployed service actually runs this path; flags and unit tests alone are insufficient.

No production deployment, worker activation, configuration change, contract signing, funds movement or real alert delivery was performed during this audit. The timeout fix is newer than the 1.0.16 built source and is not included in the installed APK or live service.
