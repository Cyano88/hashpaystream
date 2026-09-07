# Agreement layer audit - 2026-09-07

Scope: finish existing agreement behavior before savings or Trade. No new features.

## Current verdict

NOT COMPLETE. Reviewed V2/V4 contracts and the hardened worker code are deployed. Contracts remain paused and both worker/automatic-settlement flags remain explicitly false. This is an Arc-testnet/X-Layer-mainnet rehearsal, not financial production activation.

## Completed

- Embedded leased worker connects startup, webhook wakeups, periodic catch-up and bounded shutdown in the existing HashPayStream service. No extra paid worker service was created.
- Provider requests and body reads time out after 20 seconds; receipt waits time out after 60 seconds. Existing on-chain settled checks prevent repeat payment on retry.
- Reviewed escrow V2 and router V4 were deployed, creation bytecode and arguments verified, and owner/signers/assets/domains/counterpart checked. Both remain paused.
- App/server/Android contract bindings now agree; the upstream signer uses escrow domain version 2. Android 1.0.17 is installed on the Pixel. Deployment evidence is in contracts/deployments/reviewed-rehearsal-20260907.json; prior records are preserved under deployments/history.
- Service readiness accepts only explicitly disabled worker and automatic-settlement flags as intentional suspension; absent/contradictory flags and dependency failures still reject readiness. The initial cutover rollout failed this old readiness rule; the tested server correction is live. Readiness is operational health, not approval to activate settlement.

## Validation

Prior fourteen targeted agreement checks covered role isolation, immutable acceptance, stale-version rejection, router/domain isolation, arithmetic, verified webhooks and worker retries. Runtime, target-preflight and shutdown tests also passed. Upstream seven tests and TypeScript passed. The final readiness change passed readiness/Trade checks, explicit suspension negative cases and TypeScript. Android release preflight, web compilation, unit tests, lint, existing certificate lineage and all 281 bundled asset comparisons passed. Live health/readiness returned 200 after deployment; contracts were read back paused. These checks do not prove live financial execution.

## Remaining ordered gaps

1. Settlement transaction evidence is implemented and locally verified: durable checkpoint before submission, successful receipt/event verification, atomic status/evidence persistence, bounded recovery and original-network receipt links. Released on web commit 56ecbe02883b6306d7c11b1ca39b5588ec4b36df and installed as Android 1.0.18 (code 19). Live health/readiness pass; matching web/Android assets, signatures, and device launch verified. Live financial execution remains unproven.
2. Complete separately authorized funding, delivery/review, split/refund and retry walkthrough. Verify exact funder/provider/platform amounts, single execution, receipt export and wallet flows.
3. Decide and authorize activation only after target checks, appropriate network readiness and operational recovery evidence. No funder allowlisting, unpause, worker activation, funds movement or real alert delivery occurred in this configuration cutover.

Database history reset does not erase or retire legacy on-chain state. Legacy escrow was paused; full historical on-chain retirement remains unverified.
