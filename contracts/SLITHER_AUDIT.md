# Slither audit notes

Reviewed 1 September 2026 with Slither 0.11.6 against the Hardhat project.
This is an internal automated review, not an independent external audit.

```text
slither . --filter-paths "node_modules"
slither . --filter-paths "node_modules|src/test" --exclude reentrancy-balance,timestamp,cyclomatic-complexity
```

The second command analyzed 29 contracts with 99 detectors and returned zero
results. The three excluded detector categories were individually reviewed:

- `reentrancy-balance`: the native-USDC deposit paths compare the vault balance
  before and after `safeTransferFrom` to reject fee-on-transfer tokens. Every
  mutable entry point is protected by `nonReentrant`, state effects occur before
  the transfer, and a malicious callback regression confirms accounting remains
  unchanged by a blocked callback.
- `timestamp`: agreement deadlines and savings start, maturity, scheduled
  release, and emergency-access boundaries intentionally depend on block time.
- `cyclomatic-complexity`: the existing `UpfrontAdvanceEscrow.fundAdvance`
  validation path is reported at complexity 14. It is unrelated to Savings and
  remains covered by the complete Upfront regression suite.

Changes made from the full detector run:

- moved Savings accounting effects before token transfers;
- made the locked-vault carry local explicitly initialized;
- added a malicious ERC-20 callback regression.

The savings contracts remain deployment-gated. External review is still required
before a production vault address is configured or deposits are enabled.
