# X Layer stock owner Safe runbook

Status: planning ready; owner addresses unset; creation not authorized

This runbook covers the administrative owner for `AgreementBackedStockDelivery`. The Safe does not custody worker stock or Arc agreement USDC. It controls paused configuration and emergency administration after the reviewed contract is deployed.

## Required owner setup

Choose three long-lived owner addresses controlled through separate people or devices. Do not reuse the stock underwriting, risk, protection, Arc router, production deployer or service hot-wallet addresses. Never copy private keys into the repository or review packet.

The enforced configuration is:

- X Layer mainnet, chain ID 196;
- canonical SafeL2 v1.5.0 singleton and proxy factory;
- exactly three distinct owners and a 2-of-3 threshold;
- no initialization delegate call;
- no modules, transaction guard or module guard;
- canonical Safe v1.5.0 compatibility fallback handler;
- no setup payment.

## Read-only plan

Set these values only in the local `contracts/.env` or process environment:

```text
HASHPAYSTREAM_STOCK_OWNER_SAFE_OWNER_1=
HASHPAYSTREAM_STOCK_OWNER_SAFE_OWNER_2=
HASHPAYSTREAM_STOCK_OWNER_SAFE_OWNER_3=
HASHPAYSTREAM_STOCK_OWNER_SAFE_SALT_NONCE=
```

Use a fresh non-zero decimal uint256 salt. The salt is public and only needs to be unique.

Run:

```text
cd contracts
npm run plan:stock-owner-safe
```

The planner verifies the live Safe singleton, proxy factory and fallback-handler runtime hashes, simulates the factory call, computes the CREATE2 address, and prints the exact calldata and its `planId`. It never loads a private key or broadcasts a transaction.

Two people must independently compare the printed owners, threshold, chain, factory, singleton, predicted address and plan ID with the approved owner record.

## Creation gate

Do not proceed until the owner devices can all sign on X Layer and the team has selected and rehearsed a Safe-compatible transaction client. Do not assume a hosted interface supports X Layer.

Creation requires the normal X Layer deployer environment plus two values copied from the reviewed plan:

```text
HASHPAYSTREAM_STOCK_OWNER_SAFE_CREATE_PLAN_ID=<exact planId>
HASHPAYSTREAM_STOCK_OWNER_SAFE_CREATE_CONFIRM=CREATE_PINNED_XLAYER_SAFE_2_OF_3
```

Only after a final transaction review and explicit authorization, run:

```text
npm run create:stock-owner-safe
```

The command recomputes the plan, refuses a mismatched plan ID or occupied predicted address, sends the canonical chain-specific Safe factory call, and then verifies the deployed Safe shape from X Layer state.

## Operational acceptance

Before setting `HASHPAYSTREAM_STOCK_OWNER_MULTISIG` or deploying the stock-delivery contract:

1. Record the creation transaction, block, address, owners, threshold and plan ID.
2. Run `npm run verify:stock-owner-safe` using the created address.
3. Complete a harmless proposal with one owner, approval by a second owner, and execution.
4. Confirm every owner can independently recover access.
5. Document signer loss, signer rotation, emergency pause, incident escalation and transaction review.
6. Recheck that no module or guard was introduced.
7. Keep the stock-delivery contract paused until external review and the separate pilot authorization are complete.

No Safe creation, ownership transfer, stock movement, contract deployment or feature activation is authorized by this runbook.
