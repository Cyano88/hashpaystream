# Reviewed-contract integration - 2026-09-07

Status: IN PROGRESS. No financial deployment, signing-key changes, activation, or production configuration changes.

## External network evidence

Arc's official August 5 announcement schedules public mainnet for September 16, 2026: https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026 . The current official RPC reference documents testnet chain 5042002 and says mainnet parameters are published separately when available: https://docs.arc.io/arc/references/rpc-endpoints . The original arc.network homepage redirects to arc.io. This is a planned launch, not proof of mainnet availability or HashPayStream's private-mainnet access. No mainnet chain ID, RPC, USDC address or Circle blockchain identifier has been guessed.

## Verified compatibility gap

- Reviewed UpfrontAdvanceEscrowV2 uses EIP-712 name HashPayStream Upfront, version 2. Deployed application funding/protection signing and verification use version 1.
- Reviewed ArcRepaymentRouterV4 uses EIP-712 name HashPayStream Upfront Repayment, version 4. Deployed signing and client verification use version 3.
- Current deploy-mainnet.ts instantiates legacy UpfrontAdvanceEscrow; deploy-arc.ts instantiates legacy ArcRepaymentRouter. Do not use those existing commands as a reviewed-stack deployment plan.
- V4 additionally requires an immutable platform treasury constructor value and starts paused. Both contract interfaces, signature domains and configured counterpart/treasury must be checked before activation.
- The upstream underwriting service is polydesk-upfront.onrender.com, backed by the separate polydesk-upfront-service repository. Its inspected main commit is 4b695d0 and its signing domain is version 1. A coordinated signer/API/client change is required; changing only addresses will fail.

## Read-only migration inventory

Production Upfront and the fee-settlement V3 flag are enabled. A read-only PostgreSQL transaction found 18 assessment records: 10 with no funding request, 4 pending, and 4 settled. The transaction was rolled back; no records or customer data were exported.

For funding requests with usable stored offer hashes, fixed-block RPC reads found 1 available position, 0 funded, 0 released-but-unsettled, 4 settled, 0 refunded. Three older records lacked usable offer hashes. Resolved funding terms were expired. Escrow and router token balances were zero at the observed blocks; only zero/nonzero was reported.

These results do NOT establish an empty migration-safe stack: the three unresolved records and any positions absent from the database still need disposition. Existing signing/funding remains enabled, so this is a point-in-time observation, not a frozen cutover state. Settled receipt history must remain readable after any change of contract/network.

## Fixed integration work

1. Bind supported signature versions to operator-controlled target configuration in the upstream signer and HashPayStream verifier; reject unsupported versions and request-supplied overrides. Maintain the current configuration until coordinated activation.
2. Carry the reviewed domain through provider funding terms, protection attestations, repayment attestations, browser verification and settlement worker. Keep fee-agreement schema version separate from EIP-712 domain versions.
3. Prove the complete funding/release/split/refund flow with synthetic local contracts, including wrong-version replay rejection and immutable-treasury mismatch.
4. Preserve legacy position/receipt reads and resolve the three incomplete records plus on-chain event coverage before a cutover decision.
5. Prepare reviewed deployment commands that verify exact source hashes, constructor targets, initial pause state and real published network/provider parameters. Existing legacy deployment commands are not sufficient.
6. Complete the Render recovery and observed-alert checks under the existing operator constraints. Production restore/cutover and real message delivery require their concrete authorized execution steps.

Upstream preparation branch: release/hashpaystream-v2 in C:/Users/USER/polydesk-upfront-production-20260907. It adds explicit POLYDESK_UPFRONT_EIP712_VERSION (1 or 2; absent retains legacy 1) and rejects unknown/blank values. It is not deployed and does not make the HashPayStream side version-2 compatible by itself. Tests/build results are recorded when complete.

The existing signed Android 1.0.15 remains the UI/consolidation checkpoint. Do not rebuild it for each isolated integration edit; produce the next final candidate after this fixed integration set passes together.

Upstream preparation completed at commit 73685fc7d326af5d7e541d0acc2af9a4819e34c1: all 7 tests and TypeScript build passed under Node 22. Original upstream checkout and deployed configuration remain unchanged.

## Application integration checkpoint

HashPayStream now supports the operator-controlled HASHPAYSTREAM_UPFRONT_ESCROW_VERSION and VITE_HASHPAYSTREAM_UPFRONT_ESCROW_VERSION settings. Only 1 and 2 are accepted; absent retains legacy behavior. Escrow 1 maps to repayment signature 3; escrow 2 maps to repayment signature 4. The fee-agreement schema remains version 3. All three services/build configurations must agree before activation. These settings have not been activated in production.

The version is bound through underwriting verification, funding terms, protection and repayment signing, settlement worker, funding CLI and browser validation. Unsupported values and cross-version signatures fail closed. This does not yet support historical contract routing or Arc mainnet: both remain explicit gates, not implied by version 2 support.

Validation: TypeScript, assessment/funding/protection smoke, reviewed-version opportunities smoke, review smoke and settlement-worker smoke passed. The local integration harness uses the actual upstream handler and HashPayStream request verification/signing functions with frozen compiled V2/V4 contracts on two owned loopback Hardhat nodes (196 and 5042002). Funding consent, protected release, three-party repayment, refund timing, paused state, treasury binding and replay/version rejection are checked against contract execution.

Run from the candidate using Node 22:

```powershell
node --import tsx scripts/upfront-reviewed-contracts-local.mjs C:\Users\USER\hashpaystream-contract-verification-20260907 C:\Users\USER\polydesk-upfront-production-20260907
```

The harness uses synthetic keys and mock USDC only; no production environment is loaded into its nodes. Intelligence evidence, authoritative agreement state and the repayment source are simulated. Passing proves signature/contract compatibility, not real cross-chain delivery, provider operation, migration safety or financial production readiness. No reviewed contract source was changed.

## Historical receipt continuity checkpoint

The candidate supports HASHPAYSTREAM_UPFRONT_HISTORY_TARGETS as an explicit JSON array (at most eight targets). Each entry requires escrowVersion (1 or 2), chainId (196 or 1952), escrow, rpcUrl, arcRouter and arcRpcUrl. RPC URLs must be HTTPS without embedded credentials. Duplicate chain/escrow targets, including the active target, are rejected. Configuration is server-owned; neither request parameters nor stored offers may supply RPC/router destinations.

GET provider status, funding-partner history and existing partner selections can read matching historical targets. Historical offers are marked readOnly and never live, including offers whose timestamps have not expired. New partner assignment, signing and funding remain active-target-only. The app retains receipt access and omits transaction controls for historical records. Receipt explorer links and shared receipt network metadata use the record's funding chain, not the current app network. Operator RPC URLs are not returned to the client.

Verification covers preserved settled economics/status, exact old position/target selection, provider and funding-partner ownership isolation, no historical capacity/signing/store writes, rejection of new assignments, request-injected targets, malformed/duplicate configuration, and rendered receipt explorer/share metadata. Both legacy and reviewed-version opportunities suites pass.

No production history configuration or record was changed. This closes the candidate read-routing gap for structurally valid records, not migration safety: the three incomplete records still require individual disposition, and complete on-chain event inventory plus controlled cutover remain outstanding. Historical unfinished positions must be resolved before switching; this history list is not an alternative execution route for their release/refund/settlement.
