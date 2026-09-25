# Multi-asset Trade release checkpoint - 2026-09-22

Baseline: f4d61ca, release/production checkout. This checkpoint adds a regression test only; contract logic and production configuration are unchanged.

## Verified this session

- Live health and public Trade listings returned 200. Unauthenticated conversations, moderation and service requests returned 401, as expected.
- X Layer RPC reports chain 196. Factory 0x9f41a14Af230AaaF7fEfdB69ad5962828ca68dd7 has 928 approved assets and arbiter 0xf80E88df7D4570FC8eb6eAaC7AED0b93a413bBbA.
- Deployment receipt 0xf756e2db269fe334b1fddf40d9bbf24d049c5c406ec34c6f2e15198f63bac5ab is successful at block 71296810, with the expected factory address.
- Observed factory runtime hash: 0xcc80a2e8e46179070a0a664636e29fa5a83f62eed9d97139aacca5d95c14ec26. This records deployed code; it is not an independent audit or artifact-to-runtime equivalence proof.
- Targeted Hardhat run: 20 passing across MultiAssetTradeEscrowFactory, TradeEscrow, and TradeEscrowPreflight.
- New regression funds two distinct synthetic assets through the factory, verifies exact balances and duplicate-funding rejection, delists one asset, rejects new creation for that asset, releases its existing escrow to the seller, refunds the other escrow after missed dispatch, and rejects repeated payouts. Settlement in one asset leaves the other funded position untouched.
- Isolated PostgreSQL/HTTP harness passed backend and community checks: ownership, concurrency, reservations, immutable binding, retry/restart recovery, cancellation holds, racing buyers, moderation, and participant isolation.
- Trade configuration/storage isolation, escrow binding, wallet ownership verification, and service/Trade readiness smoke checks passed. Readiness test 503 logs are deliberate failure scenarios, not observations of production failure.
- git diff --check passed (Windows line-ending warning only).

## Commands

From contracts: npm.cmd test -- --network hardhat test/MultiAssetTradeEscrowFactory.test.ts test/TradeEscrow.test.ts test/TradeEscrowPreflight.test.ts

From repository root:
- node scripts/trade-service-readiness.mjs
- npm.cmd run test:trade-postgres
- node --import tsx scripts/trade-config-smoke.mjs
- npm.cmd run test:trade-escrow-binding
- npm.cmd run test:trade-wallet
- npm.cmd run test:readiness

## Remaining release evidence

This is a local funded rehearsal using synthetic tokens and a test contract-wallet arbiter, not a funded mainnet/app test, real Safe signing rehearsal, issuer-control test, or confirmation that all 928 assets are appropriate for public trading.

Next concrete milestone: an authenticated two-party app walkthrough, with exact participant wallets, asset, amount and transaction actions established before any mainnet funding. Verify creation, acceptance, wallet confirmation, reconciliation, dispatch, receipt, release/refund, recovery and final balances in the actual app.

Reconcile the older production checklist with current evidence before public launch: exact deployed artifact provenance, independent review disposition, real dispute-Safe operations, issuer/token eligibility, monitoring/recovery, and final client walkthrough. Older September 12 blockers are not proof that each remains unresolved today; this session did not close or re-audit all of them.

No mainnet transaction, deployment, funding enablement, Pocket edit, or customer-funds movement was performed in this checkpoint. No web rebuild is needed for this test-only change.

## Continuation: app walkthrough gate

Fetched origin/main at a8877ba. Its tracked application tree matches the local baseline; this is not merely an outdated checkout finding.

The actual-app funded walkthrough could not proceed:
- Browser control failed twice before tab enumeration with a Windows sandbox token error (SetTokenInformation TokenDefaultDacl 1344).
- Source inspection independently confirms TradeCheckout.tsx only offers Circle/Arc testnet settlement-wallet confirmation. It explicitly says payments are unavailable and requires USDC terms. There are no connected X Layer funding/dispatch/receipt/release actions in this component. The factory deployment and scripted escrow smoke do not establish app integration.
- The next implementation milestone is connecting the authenticated X Layer wallet and escrow lifecycle to the existing Trade checkout, with immutable binding, receipt reconciliation and recovery. Do not enable a funding flag as a substitute for this work.

A concrete build gate was fixed locally: both frozen-manifest readers now tolerate the UTF-8 BOM already present in IMPORTED_FILES.json. All 17 frozen source hashes pass after this parsing fix; syntax and diff checks pass.

Remaining artifact gate: reviewed-deployment-commands-smoke.mjs fails with "Artifact includes an unreviewed source dependency." The installed UpfrontAdvanceEscrowV2 build input includes src/test/PolicyUSDC.sol, src/test/ShortTransferUSDC.sol, src/test/TradeTestWallet.sol and src/TradeEscrowFactory.sol outside the manifest. The MultiAssetTradeEscrowFactory input has no such extra paths. A direct combined Trade factory/escrow artifact check also fails the unreviewed-input guard; do not claim full artifact provenance is verified. Prepare isolated reviewed compilation artifacts and rerun the unchanged guard, rather than adding unreviewed inputs to the allowlist blindly.

No authenticated session was inspected, no wallet selected, and no transaction submitted. The parsing fixes and prior regression test remain local, uncommitted, and undeployed.
