# Reviewed deployment preparation - 2026-09-07

Status: PREPARED LOCALLY; NOT EXECUTED. Financial production remains NO-GO.

The existing plan/deploy commands now select UpfrontAdvanceEscrowV2 on X Layer 196 and ArcRepaymentRouterV4 on Arc testnet 5042002. Router V4 includes the immutable treasury constructor argument. This is not Arc mainnet support: published production network/token/provider parameters and the associated integration remain external prerequisites.

## Mandatory checks in the prepared commands

- Frozen combined source/test verifier passes before plan/deployment preparation.
- Solidity 0.8.24, optimizer enabled with 200 runs, viaIR enabled, OpenZeppelin 5.0.2.
- The selected artifact's compiler inputs match the frozen contract hashes and installed pinned dependency contents. Bytecode and ABI match compiler output.
- Deployment uses the reviewed constructor order; both contracts must remain paused afterwards. Router treasury is read back and compared.
- Old deployment confirmation values do not authorize the reviewed deployments.
- The prior empty-but-unpaused retirement bypass is removed. An existing unpaused X Layer escrow causes refusal, even when its token balance is zero.
- Deployment output explicitly reports financialProductionReady=false and does not certify legacy retirement. An empty paused stack check is not a substitute for resolving the known released obligations.

## Commands and order

Run commands from the contracts directory with the pinned contracts dependencies installed. Do not run a deployment until its exact transaction, configuration and cost are reviewed and authorized. No private values belong in a plan document or source control.

1. Resolve the legacy inventory/obligation gates and establish the production Arc network configuration. The commands below currently support only an Arc testnet rehearsal.
2. Set the reviewed Arc asset, credit signer, owner and HASHPAYSTREAM_PLATFORM_TREASURY_ADDRESS. Run npm run plan:arc-testnet to inspect constructor ordering, predicted address, collision check and gas estimate.
3. Only under applicable authorization, npm run deploy:arc-testnet requires UPFRONT_ARC_DEPLOY_CONFIRM=DEPLOY_REVIEWED_V4_PAUSED_ARC_TESTNET.
4. Set ARC_REPAYMENT_ROUTER_ADDRESS and UPFRONT_VERIFY_DEPLOY_TX_HASH to the resulting creation. Run npm run verify:reviewed-arc-testnet.
5. Use that verified router address in X Layer configuration; verify the cross-network owner, signer, asset and treasury relationships before approving an X Layer deployment. Run npm run plan:mainnet. Current production's unpaused escrow and unresolved legacy obligations remain blocking conditions.
6. Only under applicable authorization, npm run deploy:mainnet requires UPFRONT_MAINNET_DEPLOY_CONFIRM=DEPLOY_REVIEWED_V2_PAUSED_XLAYER_MAINNET and the existing owner-control confirmation. This command does not pause, migrate, retire or settle the old contracts.
7. Set POLYDESK_UPFRONT_MAINNET_ESCROW_CONTRACT_ADDRESS and UPFRONT_VERIFY_DEPLOY_TX_HASH to the new creation. Run npm run verify:reviewed-mainnet. Preserve both verification outputs with source/artifact hashes and transaction receipts.
8. Keep both reviewed contracts paused. Coordinated signer/API/browser configuration, history disposition, recovery/alerts and final release validation must pass before a separately authorized activation.

The new read-only verification commands require a successful direct-creation receipt for the configured contract, exact reviewed creation bytecode plus constructor arguments, matching chain/domain, current owner and empty pending owner, paused state and signer/counterpart/treasury getters. Existing legacy verification commands are retained for historical inspection; they are not reviewed V2/V4 certification.

## Validation and limitations

The offline command suite uses actual frozen artifacts and compiler inputs, with mocked Hardhat network/deployment calls. It tests contract selection and treasury ordering, rejects compiler/dependency/source/artifact mismatches, wrong chains, old or missing confirmations, unpaused output, wrong treasury, wrong creation data/receipt/owner/domain, and the former empty-unpaused bypass. No network deployment or financial signature occurs in this suite.

From the app root:

    node scripts/reviewed-deployment-commands-smoke.mjs <frozen-contract-harness-directory>

The separate local lifecycle harness already proved application/upstream-generated signatures against actual reviewed contracts using synthetic funds. Neither test proves live deployment, real Arc mainnet operation, legacy debt resolution, provider recovery or permission to activate.
