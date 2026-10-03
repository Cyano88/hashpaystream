# Local Arc Trade Safe rehearsal

Run from `contracts/` after installing the normal contract development dependencies:

```powershell
npm.cmd ci --prefix rehearsal --ignore-scripts --no-audit --no-fund
npm.cmd run test:trade-arc-safe
```

The separate lockfile pins published Safe 1.4.1 artifacts without changing shared
contract dependencies. Tests deploy its actual singleton and proxy factory, a
two-owner Safe with threshold two and no modules, mock six-decimal USDC, and the
existing TradeEscrowFactory on an ephemeral Hardhat chain with ID 5042. The test
refuses any other network. It lives outside the default test directory because
its signatures deliberately require this chain ID.

Coverage includes direct-call rejection, insufficient and duplicate approvals,
wrong-chain and outsider signatures, altered allocations, successful two-signer
execution, exact buyer/seller transfers and settlement events, and replay rejection.

This is local contract evidence only. It does not verify Arc mainnet deployment,
official USDC behavior, Circle execution, production Safe owners, or the separate
XLayer split canary. No live funds or signing credentials are used, and this test
does not enable hosted Arc funding.

Validated on 2026-10-03: all 50 tests passed in the combined run (47 existing
Trade tests and three Safe rehearsal tests):

```powershell
npx.cmd hardhat test --config hardhat.arc-trade.config.ts test/TradeEscrow.test.ts test/TradeEscrowPreflight.test.ts test/TradeEscrowAudit.test.ts rehearsal/test/TradeArcSafeRehearsal.test.ts
```

## Unsigned deployment candidate

From `contracts/`, run `npm.cmd run plan:trade-arc`. This uses the local-only
configuration and reads compilation artifacts; it never obtains a signer or
contacts Arc. With no authority selected it reports build fingerprints and a
missing-Safe blocker, with no creation transaction. A checked-in snapshot is at
`audits/arc-trade-build-candidate.json`.

After selecting the public Arc Trade Safe address, set
`HASHPAYSTREAM_ARC_TRADE_ARBITER_ADDRESS` and rerun to obtain constructor arguments,
unsigned creation data and its hash. An address passing syntax validation is
not Safe verification. The plan always reports `safeVerified: false`,
`productionReady: false`, and `fundingEnabled: false`.

The planner verifies compiler settings, artifact/compiler-output agreement, and
current source contents across the factory's transitive imports. It records
normalized source hashes for review; this is not a security audit or release
approval. `runtimeTemplateHash` contains zeroed immutable slots and must never
be copied into Hash PayLink's deployed `factoryRuntimeHash` registry field.
Verify deployed code and the Safe policy with the existing release preflight.

`npm.cmd run test:trade-arc-plan` passed four checks: missing-authority gating,
exact creation-data construction, rejection of source/artifact/settings drift,
and a local deployment of the prepared bytes with constructor readback. That
last check uses a code stub at the USDC address solely to satisfy the constructor;
it does not validate real USDC or an on-chain Safe.

The plan now also includes `expectedRuntimeHash` when an arbiter is supplied.
It applies the constructor token/arbiter to the compiler's immutable byte ranges.
The local constructor-readback test verifies this hash against the actual deployed
runtime. This is the expected hash for subsequent deployment verification, not
evidence that a mainnet factory already exists.
