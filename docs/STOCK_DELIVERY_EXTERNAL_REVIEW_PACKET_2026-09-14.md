# Stock delivery external review packet

Status: release candidate; external review required; financial production disabled

Pull request: https://github.com/Cyano88/hashpaystream/pull/7

## System boundary

The funder transfers the exact signed stock-token amount on X Layer directly to the worker's verified Privy wallet. `AgreementBackedStockDelivery` verifies the authorization and records the delivery link but holds no stock or USDC. The existing protected Arc agreement is the only USDC repayment source. Arc savings remain a separate product.

An Early Pay offer can only be created for an existing funded job whose worker selected stock payment and whose assessment was approved. The worker selects a ranked eligible offer; there is no separate job form or public marketplace flow.

## Review scope

The complete source inventory and SHA-256 hashes are in `docs/evidence/stock-delivery-release-manifest.json`. CI rejects a changed file until the manifest is intentionally regenerated and its diff reviewed. Contract compiler settings and bytecode hashes are separately pinned in `docs/evidence/stock-paused-deployment-plan.json`.

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
npm test -- --network hardhat test/AgreementBackedStockDelivery.test.ts
```

To refresh the manifest after an intentional scoped change, run `npm run stock:review-manifest` and review every changed hash before accepting it.

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
