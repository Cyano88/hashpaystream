# Personal Savings Vault v1 - external review package

## Status

This is a review candidate, not an audit report or deployment approval.

- Product: user-controlled scheduled USDC savings
- Network: X Layer mainnet, chain ID 196
- Asset: native USDC at `0xB6CEceAB302E2E4948951eE7843FC24E92933061`
- Contract: `src/PersonalSavingsVault.sol`
- Source LF-normalized SHA-256: `7db6493214742554fa18b252dcf53e4307987f1ec8232bb2879722b9d2b5d186`
- Audit tag: `personal-savings-v1-audit`
- Deployment address: none
- Application enabled: no
- Yield, penalty sharing and platform fees: none

The audit tag must resolve to a commit containing the source digest above. A changed
digest is a different review candidate.

## Scope

Only these files define the review target:

- `src/PersonalSavingsVault.sol`
- OpenZeppelin imports resolved by `package-lock.json`
- `hardhat.config.ts` compiler settings
- `scripts/deploy-savings-mainnet.ts`
- `test/PersonalSavingsVault.test.ts`

`LockedSavingsCohortVault.sol`, Upfront contracts, Arc agreements, the web
application, embedded wallets and backend services are outside this contract
review. The cohort vault must not be treated as an extension of this vault.

## Intended behavior

A wallet approves and deposits an exact amount into a new plan. A plan uses
either a seven-day or 30-day interval. The first release is one full interval
after creation. Each elapsed interval unlocks one `releaseAmount`, capped by the
original deposit. The owner may withdraw any positive amount up to the currently
withdrawable amount.

The owner can request access to the full remainder. Emergency access becomes
executable after 48 hours and can be cancelled before execution. A pending
request cannot be restarted accidentally; it must be cancelled first. There is
no administrator, pause, upgrade, treasury, yield adapter, penalty or third-party
withdrawal path.

Lifetime plan IDs are read through pages of at most 100. The application reads
all pages and plan details at one fixed block snapshot.

## Trust model

- The plan owner controls the wallet key and authorizes every state-changing call.
- The vault trusts the configured token's transfer and balance behavior.
- X Layer provides ordering, timestamps and finality.
- The frontend and RPC are conveniences, not balance authorities.
- HashPayStream has no privileged vault role and cannot release or recover funds.

Use "user-controlled smart-contract savings" rather than claiming funds never
enter custody: USDC is held by the contract until withdrawal.

## Security invariants

1. Only `plan.owner` can withdraw, request, cancel or complete emergency access.
2. `withdrawn <= deposited` for every created plan.
3. `withdrawable(planId) <= remaining(planId)`.
4. Normal withdrawal cannot exceed releases earned by elapsed intervals.
5. Emergency exit cannot execute before its recorded 48-hour deadline.
6. Duplicate emergency requests cannot replace or extend a pending deadline.
7. `totalManaged` equals the sum of remaining balances for created plans.
8. Vault token balance is at least `totalManaged` for native-USDC behavior.
9. Direct token transfers do not create plans or increase `totalManaged`.
10. No plan can spend another plan's accounted principal.
11. Plan IDs do not collide for distinct owner nonces in one deployment.
12. Pagination never hides an ID and never returns more than 100 IDs.
13. Reentrant token callbacks cannot corrupt accounting.
14. No administrator, upgrade, arbitrary call or recovery path exists.

## Threats and limitations

| Risk | Contract response | Residual risk |
| --- | --- | --- |
| Compromised wallet | Only the owner can act | Attacker can use all owner rights |
| Unsupported token behavior | Exact inbound delta required | Deployment must stay pinned to native USDC |
| Token blacklist, pause or upgrade | No bypass | Issuer behavior can stop transfers |
| Stale or dishonest RPC | Wallet confirms simulated writes | User must inspect the request |
| Timestamp movement | Coarse time boundaries only | Small block-time variation accepted |
| Reentrancy | Guarded transfers and effects before outbound calls | Trusted-token assumption remains |
| Large history | Paginated IDs and batched reads | More RPC requests are needed |
| Direct token transfer | Excluded from managed balance | Unsolicited surplus is trapped |
| Defect after launch | No admin, pause or upgrade | UI can stop deposits; contract cannot freeze |
| Lost wallet access | No recovery role | HashPayStream cannot restore access |
| Insufficient gas | Owner supplies network gas | Funds wait until a transaction is possible |

Plans cannot be topped up or transferred. The schedule is not an absolute lock:
the owner can begin a 48-hour emergency exit at any time. There is no promised
return, APY, insurance or loss guarantee.

## Toolchain

- Solidity 0.8.24
- Optimizer enabled with 200 runs
- IR pipeline enabled
- Hardhat EVM target Paris
- OpenZeppelin Contracts exactly 5.0.2
- Package-lock LF-normalized SHA-256:
  `64ab78c1c104bab2818425f57fffe7117e310f9d9f580f761d07ad668c565124`

From `contracts/`:

```text
npm ci
npm run audit:personal-savings
```

Repository-wide Slither commands and triage are in `SLITHER_AUDIT.md`.
Reviewers should run independent static analysis, fuzzing and invariants from a
clean checkout.

## Asset evidence captured on 1 September 2026

Current OKX native-USDC and payment documentation identifies the configured
address as native USDC on X Layer. At block 69,484,978, the official X Layer RPC
returned chain ID 196, contract bytecode, name USDC, symbol USDC and 6 decimals.

Primary references:

- https://web3.okx.com/learn/usdc-cctp-on-xlayer
- https://web3.okx.com/onchainos/dev-docs/payments/supported-networks
- https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information

Older bridge documentation names legacy bridged assets differently. Repeat the
documentation and on-chain verification immediately before deployment.

## Release gate

Deployment is prohibited until:

1. Independent review covers the exact source digest and locked dependencies.
2. No unresolved critical or high-severity finding remains.
3. Other findings have written disposition.
4. Native USDC, chain ID and deployer are independently reverified.
5. Deployment is simulated from the dedicated intended deployer.
6. Expected address, source verification and constant checks are prepared.
7. A tiny-USDC canary and incident owner are approved.
8. Application configuration remains empty until the canary succeeds.

## Canary sequence

1. Deploy with the reviewed script and record chain, block, transaction, deployer,
   contract, asset, source digest and runtime-bytecode digest.
2. Verify source on the official X Layer explorer.
3. Read `asset`, `WEEKLY`, `MONTHLY`, `EMERGENCY_EXIT_DELAY` and
   `MAX_PAGE_SIZE`.
4. Confirm there is no owner, admin, proxy or upgrade control.
5. Create one minimal weekly plan from a dedicated canary wallet.
6. Verify exact deposit and `totalManaged`.
7. Confirm normal withdrawal is unavailable before the first release.
8. Request emergency access, confirm early execution reverts, wait 48 hours and
   withdraw the complete balance.
9. Confirm `remaining == 0`, `totalManaged == 0` and exact receipt.
10. Then, and only then, configure a restricted application beta.

Do not shorten the production emergency delay for a canary. Local time travel is
the fast functional test.

## Incident response

1. Remove the vault address from UI configuration and stop deposit links.
2. Preserve chain, RPC, application and support evidence.
3. Do not claim HashPayStream can freeze the vault.
4. Users take scheduled withdrawals or begin the 48-hour emergency exit.
5. Review any replacement; users migrate using their own withdrawals.
