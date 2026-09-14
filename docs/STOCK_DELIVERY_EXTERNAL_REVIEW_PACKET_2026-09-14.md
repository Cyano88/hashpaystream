# Stock delivery external review packet

Status: release candidate; external review required; financial production disabled

Pull request: https://github.com/Cyano88/hashpaystream/pull/7

## System boundary

The funder transfers the exact signed stock-token amount on X Layer directly to the worker's verified Privy wallet. `AgreementBackedStockDelivery` verifies the authorization and records the delivery link but holds no stock or USDC. The existing protected Arc agreement is the only USDC repayment source. Arc savings remain a separate product.

An Early Pay offer can only be created for an existing funded job whose worker selected stock payment and whose assessment was approved. The worker selects a ranked eligible offer; there is no separate job form or public marketplace flow.

## Review scope

The complete source inventory and canonical-LF SHA-256 hashes are in `docs/evidence/stock-delivery-release-manifest.json`. The boundary includes the guarded deployment and read-only verification commands. CI rejects a changed file until the manifest is intentionally regenerated and its diff reviewed. Contract compiler settings and bytecode hashes are separately pinned in `docs/evidence/stock-paused-deployment-plan.json`.

Review these trust boundaries together:

1. EIP-712 underwriting, worker acceptance, risk and Arc-protection signatures.
2. Direct ERC-20 delivery, exact-balance enforcement, replay protection and event commitments.
3. Authenticated offer selection and funder-only delivery confirmation.
4. Historical X Layer receipt/runtime verification and immutable assessment binding.
5. Fixed-USDC Arc split signing, settlement receipt verification, checkpoints and recovery.
6. Exposure caps, participant limits, request expiry, feature gates and shared worker lease.
7. Browser verification of wallet, chain, runtime, signers, allowlists, terms, allowance and simulation.

Legacy `StockEarlyPayEscrow` inventory custody is outside this release path and must remain disabled.

## Reproduction

Use Node.js 22.12.0 from a clean checkout of the exact reviewed PR commit.

```text
npm ci
npm run test:stock-review-manifest
npm run typecheck
npm run test:stock-delivery-terms
npm run test:upfront-settlement
npm run build

cd contracts
npm ci
npm run test:stock-deployment
```

To refresh the manifest after an intentional scoped change, run `npm run stock:review-manifest` and review every changed hash before accepting it.

## Guarded deployment commands

Safe setup follows `docs/STOCK_OWNER_SAFE_RUNBOOK_2026-09-14.md`. `npm run plan:stock-owner-safe` is read-only and binds chain, factory, singleton, owners, threshold, initializer and salt into a deterministic address and plan ID. `npm run create:stock-owner-safe` requires that exact plan ID and a separate explicit confirmation; running it still requires final transaction authorization.

Before deployment, set `HASHPAYSTREAM_STOCK_OWNER_MULTISIG` and run `npm run verify:stock-owner-safe` from `contracts`. The read-only check requires a canonical Safe v1.5.0 proxy on X Layer mainnet with exactly three distinct owners, a 2-of-3 threshold, no modules, no transaction or module guard, and the pinned canonical compatibility fallback handler. It also pins the live singleton, factory and handler runtime hashes from the official Safe deployment registry. The source commits, dependency addresses, hashes and remaining operational checks are recorded in `docs/evidence/stock-owner-safe-policy.json`. The owners must be operationally confirmed as separately controlled; bytecode cannot prove control of their keys.

After the external review, multisig and signer gates are complete, `npm run deploy:stock-mainnet` from `contracts` is the only reviewed deployment entry point. It repeats the Safe verification, requires three exact operator confirmations and always deploys paused. It refuses the wrong chain, an invalid Safe, overlapping Safe owners or protocol roles, an existing configured contract, or a changed artifact.

After a successful paused deployment, `npm run verify:stock-mainnet` performs read-only verification against the creation receipt and frozen packet. Its output supplies the runtime hash for the application configuration. Neither command allowlists an asset or funder, unpauses the contract, changes application feature gates, or moves stock.

## Required reviewer output

Record the exact Git commit, reviewed manifest hash, compiler/tool versions, findings with severity and disposition, assumptions about the Arc router and token behavior, and a clear decision for paused deployment and for a tiny allowlisted pilot. A paused deployment approval does not approve allowlisting or unpausing.

## Open production gates

- Independent review of this exact contract, API, worker and browser boundary.
- Verified X Layer owner multisig and separately controlled underwriting, risk and protection signers.
- Final issuer token, wrapper upgrade-control and participant/distribution approval.
- Approved independent regular-session price source, live X Layer executable quote checks and risk limits.
- Paused deployment with verified source, constructor values and runtime hash.
- One allowlisted tiny-value direct delivery and complete Arc repayment rehearsal before wider access.

No deployment, unpause, production configuration change, token movement or Android update is authorized by this packet.
