# AgreementBackedStockDelivery internal release review

Date: 14 September 2026
Status: candidate passes internal checks; mainnet deployment and unpause are not approved

## Reviewed boundary

This review covers `contracts/src/AgreementBackedStockDelivery.sol`, its browser execution adapter, the authenticated stock-delivery endpoint, and the generated paused deployment packet. The contract transfers an exact approved stock-token amount from the funder directly to the worker and records the signed agreement link. It does not custody stock inventory or USDC.

## Controls verified

- The constructor starts paused and rejects zero addresses or duplicated underwriting, risk, and protection signer roles.
- Signer rotations cannot collapse those three authorization roles into one address.
- Only the owner can rotate signers, allow funders or assets, and change pause state.
- The funder, worker, stock asset, token quantity, protected amount, fixed USDC split, Arc agreement, evidence commitment, recipients, and deadlines are signature-bound.
- Delivery and Arc-agreement replay are rejected.
- Token transfers are protected by `nonReentrant`; state is written before the external token call and the whole transaction rolls back on failure.
- Balance checks reject short, taxed, rebasing-during-transfer, or otherwise non-exact token behavior and require the delivery contract's token balance to remain unchanged.
- The browser independently checks the pinned contract and asset, current onchain signer roles, allowlists, pause state, Arc route, worker acceptance signature, exact allowance, token balance, and gas before simulation.
- The backend accepts only the assigned approved funder and verifies every recipient and economic field in the confirmed `StockDelivered` event.
- A locally checkpointed transaction hash allows receipt recording after a browser reload or release pause without sending the tokens twice.
- The shared Arc worker re-verifies the X Layer delivery and pinned runtime, binds repayment to the immutable assessed request and signed delivery amounts, persists recovery checkpoints, and records only a verified Arc settlement event.
- Stock requests cannot be enabled unless the shared settlement runtime and stock settlement pass are enabled together.

## Verification evidence

The focused Hardhat suite passes five scenarios: direct no-custody delivery; pause and allowlists; independent signer roles; short-transfer rollback and reentrancy blocking; signed-field tampering, fee limits, stale evidence, and replay.

Slither analyzed the project with 102 detectors. For this candidate it reports the expected balance-around-token-call warning, deliberate timestamp comparisons, and high complexity in the single fail-closed delivery validator. The entry point is `nonReentrant`, records state before the token call, and reverts atomically when exact balance changes fail. A second run excluding those acknowledged classes and an unrelated legacy event warning analyzed 98 detectors with zero additional results.

The reproducible source, artifact, creation-bytecode and runtime-bytecode hashes are recorded in `docs/evidence/stock-paused-deployment-plan.json`.

## Remaining release blockers

An independent smart-contract review is still required before public value is allowed. The owner multisig and three separately controlled production signer addresses are not configured. The issuer token, wrapper upgrade controls, distribution permission, jurisdiction enforcement, exposure limits, production data entitlement, and live regular-session quote path still require final approval. After those close, deploy paused, verify the source and runtime, allow only the tiny pilot asset and funder, rehearse the full Arc repayment, and unpause through the multisig release process.

No deployment transaction, mainnet transaction, token movement, feature-gate change, or APK update occurred during this review.
