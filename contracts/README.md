# HashPayStream Upfront escrow

This workspace contains the non-upgradeable X Layer advance escrow and the Arc
repayment router. The X Layer contract holds only the advance. The fixed Arc
router is the Hash PayLink project recipient and credits confirmed repayment to
the Arc repayment recipient bound at funding; no asset bridge is assumed.

```text
npm install
npm run compile
npm run test:upfront
```

Every X Layer escrow starts paused, has an empty funder allowlist, and enforces
immutable per-advance and lifetime funding caps. Deploy the Arc router first
with `npm run deploy:arc-testnet` and configure it as Hash PayLink's fixed Arc
recipient. Use `npm run plan:testnet` / `deploy:testnet` for chain 1952 or
`npm run plan:mainnet` / `deploy:mainnet` for chain 196. The mainnet path accepts
only X Layer's approved native USDC address and verifies that it has bytecode.

After deployment, verify the constructor values and ownership before separately
allowlisting a treasury and unpausing. Arc remains testnet: its test USDC has no
financial value and is not collateral for a mainnet advance. Never reuse
application secrets as signer keys and never commit the local `.env`.

The mainnet deployment script additionally refuses protocol-address collisions,
caps above 1 USDC per advance or 5 USDC lifetime, and execution without both
`UPFRONT_OWNER_CONTROL_CONFIRM=CONTROLLED_MAINNET_OWNER` and
`UPFRONT_MAINNET_DEPLOY_CONFIRM=DEPLOY_PAUSED_XLAYER_MAINNET`. These values are
deployment acknowledgements, not secrets; set them only after human review of
the read-only plan.

Use `npm run bootstrap:mainnet-deployer` once to create a dedicated mainnet
deployment identity inside the ignored `contracts/.env`. The command prints
only its public address and refuses to replace an existing key. Do not reuse the
Arc, testnet, underwriting, protection, repayment, or application identities.

The gated proof deployment is recorded in
`deployments/xlayer-mainnet.json`. Run `npm run verify:mainnet` for a read-only
receipt, bytecode, ownership, cap, and pause-state verification. Deployment does
not authorize a funder or enable the application.
