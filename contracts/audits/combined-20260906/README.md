# HashPayStream combined contract review

This package replaces the split scope of the September 1 PersonalSavings and
September 3 hardening follow-ups. PersonalSavings is explicitly included.
Read this document and CONTRACT_INTERACTIONS.md first. Historical documents
are preserved for traceability; their exclusions do not define this combined scope.
This is an external-review submission, not a claim of completed security audit.

## Review scope

| Contract | Role | Source snapshot |
| --- | --- | --- |
| PersonalSavingsVault | Scheduled personal USDC savings and delayed emergency exits | Frozen personal-savings-v1 archive |
| LockedSavingsCohortVault | Fixed-term cohort savings and early-exit penalty accounting | Frozen hardening-v2 archive |
| UpfrontAdvanceEscrowV2 | X Layer advance custody and signed protection release | Frozen hardening-v2 archive |
| ArcRepaymentRouterV4 | Arc signed repayment split, immutable treasury and pause control | Frozen hardening-v2 archive |
| UpfrontAdvanceEscrow | Legacy escrow for compatibility and regression comparison | Committed source recorded in PROVENANCE.json |
| ArcRepaymentRouter | Legacy router for compatibility and regression comparison | Committed source recorded in PROVENANCE.json |

All six contracts, all six existing test suites and their three local token/signature
mocks are present in one Hardhat project. No Solidity or test logic was changed
for packaging. Hashes and precise origins are in PROVENANCE.json. FILE_MANIFEST.json
covers every delivered file other than itself. The ZIP checksum is provided alongside it.

## Reproduce

Use Node 22 and npm. From this folder:

    npm ci --ignore-scripts
    npm run verify:package
    npm test

The dependency lock pins the dependency tree, including OpenZeppelin 5.0.2.
Solidity is 0.8.24, optimizer enabled with 200 runs, viaIR enabled. The harness
uses only Hardhat's local network. Network/key loading and deployment commands
were removed from the harness, without changing compiler settings or dependencies.
Original hardening harness files are retained under historical/ for comparison.
context/deploy-savings-mainnet.ts is an unmodified historical review reference,
not an enabled deployment command. No secrets or environment files are included.

## Audit expectations

Review the whole set together, including ownership/signature boundaries, shared
asset assumptions, replay isolation, accounting and the cross-chain trust boundary.
Treat the two savings vaults as separate custody systems, not as adapters for one
another or as a source of advance liquidity. Test results are regression evidence,
not proof of complete exploit coverage. Report findings against exact contract hashes,
identify affected versions, and say which proof-of-concept tests were executed.

The old exclusion of PersonalSavings is superseded. Backend/wallet integrations,
the upstream Arc agreement/settlement implementation, operational signer security
and deployed-bytecode matching are not reproduced by these six source files.
Their trust assumptions are listed explicitly in CONTRACT_INTERACTIONS.md; this
package must not be described as a complete end-to-end production audit.

No deployment, deposit enablement or on-chain transaction is authorized by this bundle.
See VERIFICATION.md for freshly executed packaging and test results.
