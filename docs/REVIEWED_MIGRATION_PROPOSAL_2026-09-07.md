# Reviewed migration transaction proposal - 2026-09-07

Status: UNSIGNED, NOT BROADCAST. Estimates observed at 2026-09-07T21:00:38.859Z. The user approved the Arc testnet rehearsal paired with X Layer mainnet after reviewing this proposal. This is not an Arc production launch.

## Proposed sequence

1. From the current X Layer escrow owner 0xA16D33E7B36099F0EF82048fb78b25754Bf49931, call setPaused(true) on old escrow 0xCA4f547527A64a94c9b45306f311D8658d8A3Dbf. Read-only gas estimate succeeded. The owner is different from the configured deployer; possession of the deployer key does not authorize this call.
2. Deploy reviewed ArcRepaymentRouterV4 on Arc testnet 5042002 from existing deployer 0x295177803fd02e1880d661Be3b66F6124787f978. It starts paused. Proposed owner and treasury are the existing 0xF3bE84452e17e9F0656F54884113cD2D7288C2E3; asset is 0x3600000000000000000000000000000000000000; credit signer is 0x83Bd6A645cBE8d04b5F33f2c2c87A1d1FDD71D5b.
3. Verify the actual creation receipt and reviewed identity before deploying UpfrontAdvanceEscrowV2 on X Layer mainnet 196 from existing deployer 0xAeAEA86026c820934EFfC356B94bC3092efA9eb6. It starts paused. Preserve current escrow owner, underwriting signer, protection signer and native USDC asset; use the verified new Arc router address as immutable counterpart.
4. Preserve creation receipts and run the reviewed deployment verifiers. Do not unpause, enable the worker or change the app/signer configuration as an implicit part of deployment. Coordinated activation remains a separate validated step.

## Read-only cost estimates

| Transaction | Estimated gas | Estimated network fee |
| --- | ---: | ---: |
| Old escrow setPaused(true) | 47,302 | 0.000000946040047302 OKB |
| Arc router V4 creation | 1,301,903 | 0.032547575 Arc test USDC |
| X Layer escrow V2 creation | 2,334,828 | 0.000046696562334828 OKB |

These are gas estimates at observed prices, not fee caps or guarantees. Both deployer balances cover their respective creation estimates; owner-wallet pause funding/control is not established by that fact. Recalculate fees and pending nonces immediately before execution.

At the observed nonces, proposed router address is 0x78d42Ada91e5121cbe85A50f50436B1Cc3a23999 and proposed escrow address is 0x98A45f994E5fb887a950D20BEd60bA83cB00430c. They are predictions, not deployed contracts. Any intervening deployment-wallet transaction invalidates the corresponding prediction.

## Evidence and limits

The 15 frozen source/test files still match the reviewed archive. Plan calldata uses frozen V4/V2 artifacts with matching compiler settings and artifact/build-output bytecode. Existing local deployment keys were used only to derive their public addresses; no signature was generated. Current Arc owner has code attached; no multisig classification or owner-control claim is inferred from that alone.

The historical Arc receipt was unavailable from the current RPC, so this proposal uses the independently derived current configured deployer addresses rather than inferring historical deployment control. The correct old escrow admin method was confirmed from source as setPaused(bool), and its read-only estimate succeeded.

The old escrow is unpaused and its current token balance is zero. Complete historical event coverage and legacy retirement are not established. Deleting database records did not change on-chain positions. No pause, deployment, funds transfer, unpause or configuration switch occurred.

Sanitized plan and unsigned calldata are in ignored output/playwright/reviewed-migration-plan.json and reviewed-migration-unsigned.json. No private keys are included. Execution still requires the intended network scope and the owner's concrete pause transaction to be authorized and completed.

## Execution checkpoint after approval

The approved sequence is waiting for the old escrow owner's signature. A fresh read confirms the same owner, the escrow remains unpaused, and that owner has sufficient balance for the current pause gas estimate. All six usable private keys in the existing local contracts environment were checked by deriving their public addresses; none matches the old escrow owner. No private key was printed or exported.

The browser owner-wallet controller failed on two attempts. There is no confirmed usable owner signing session in this checkpoint. The unsigned request is prepared in output/playwright/owner-pause-transaction.json: chain 196, from the verified owner, to the old escrow, value zero, setPaused(true). Gas estimation succeeds; that is not a signature or authorization proof.

No migration transaction was broadcast. Do not bypass the paused-old-escrow deployment guard or substitute a deployer/worker key for the owner. Resume from obtaining the owner signature, verify the pause receipt/state, then refresh deployment estimates/nonces before proceeding with the approved deployment sequence.
