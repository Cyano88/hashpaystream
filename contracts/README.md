# HashPayStream Upfront escrow

This workspace contains the non-upgradeable X Layer advance escrow and the Arc
repayment router. The X Layer contract holds only the advance. The fixed Arc
router is the Hash PayLink project recipient and atomically returns the advance
principal to the bound funding wallet while sending the remaining protected
payment to the provider's verified Circle Arc wallet; no asset bridge is assumed.

`PersonalSavingsVault.sol` is a separate, non-upgradeable native-USDC savings
contract. It has no administrator, fees, or yield logic. Each wallet can create
weekly or monthly release plans, withdraw only the amount already released, or
request a full emergency exit after a fixed 48-hour delay. Do not describe vault
deposits as yield-bearing unless a separately reviewed native-USDC market adapter
is deployed and verified.

`LockedSavingsCohortVault.sol` is a second, independent and non-upgradeable
native-USDC design for fixed 30, 90, 180, or 365-day savings terms. Deposits join
the next weekly cohort. A full early exit after the cohort starts pays an exact
5% penalty into that duration's reward pool. A completer's reward is capped at
5% of the principal they kept locked, preventing a tiny second wallet from
capturing a large early-exit penalty. Unused penalties carry only to future
completers of the same duration; they are never refunded to early exiters or
transferred across durations. The contract has no administrator, treasury,
external yield source, or upgrade path. It must receive an independent security
review before deployment or UI enablement.

```text
npm install
npm run compile
npm run test:upfront
npm run test:savings
```

Every X Layer escrow starts paused and has an empty funder allowlist. Funding is
bounded by the protected agreement amount and the advance percentage in each
signed underwriting offer; the production contract has no global spending cap.
Deploy the Arc router first
with `npm run deploy:arc-testnet` and configure it as Hash PayLink's fixed Arc
recipient. Use `npm run plan:testnet` / `deploy:testnet` for chain 1952 or
`npm run plan:mainnet` / `deploy:mainnet` for chain 196. The mainnet path accepts
only X Layer's approved native USDC address and verifies that it has bytecode.

After deployment, verify the constructor values and ownership before separately
allowlisting a treasury and unpausing. Arc remains testnet: its test USDC has no
financial value and is not collateral for a mainnet advance. Never reuse
application secrets as signer keys and never commit the local `.env`.

The mainnet deployment script additionally refuses protocol-address collisions
and execution without both
`UPFRONT_OWNER_CONTROL_CONFIRM=CONTROLLED_MAINNET_OWNER` and
`UPFRONT_MAINNET_DEPLOY_CONFIRM=DEPLOY_PAUSED_XLAYER_MAINNET`. These values are
deployment acknowledgements, not secrets; set them only after human review of
the read-only plan.

Use `npm run bootstrap:mainnet-deployer` once to create a dedicated mainnet
deployment identity inside the ignored `contracts/.env`. The command prints
only its public address and refuses to replace an existing key. Do not reuse the
Arc, testnet, underwriting, protection, repayment, or application identities.

The production deployment is recorded in
`deployments/xlayer-mainnet.json`. Run `npm run verify:mainnet` for a read-only
receipt, bytecode, ownership, signer, and pause-state verification. Deployment does
not authorize a funder or enable the application.
