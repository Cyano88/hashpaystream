# Live split target verification - 2026-09-07

Read-only check at 2026-09-07T20:47:06.868Z. X Layer block 70044989; Arc block 60965787. No configuration, pause state, signer, funds or deployed contract was changed.

## Confirmed

- Configured targets match the tracked deployment record.
- RPC networks are X Layer mainnet 196 and Arc testnet 5042002.
- Worker private key derives the configured signer, and the router creditSigner authorizes that signer.
- Escrow points to the configured repayment router; both asset getters match the expected native X Layer USDC and Arc test USDC.
- EIP-712 verifying addresses and chain IDs match the queried targets.
- Worker gas balance is nonzero. This does not prove sufficient gas for a settlement; submission still requires a transaction-specific estimate.
- Worker activation flag is off.

## Blocker

Observed escrow signature version is 1 and repayment router version is 3. The reviewed release requires 2 and 4. Runtime executable-code comparison against frozen artifacts matches legacy UpfrontAdvanceEscrow / ArcRepaymentRouter and does not match V2/V4. That comparison excludes Solidity metadata and immutable values; it is not exact full-bytecode certification.

The current escrow is unpaused. The current router's paused getter is unavailable; the matched legacy source has no Pausable interface. Do not interpret that failed getter as a verified paused or unpaused V4 deployment.

The correct fix is the reviewed deployment/configuration migration. Changing only signature version settings would make signatures incompatible with the live legacy contracts. Keep worker activation off until the intended contracts, production network plan and activation sequence are verified.

## Preflight correction

Previously, preflight checked deployed bytecode presence and whether the private key matched its configured address, then reported signer matched. It did not verify router authorization or contract domain versions.

The revised read-only activation preflight requires reviewed 2/4 domains, expected domain names/chains/verifying addresses, unpaused contracts, escrow/router linkage, router-authorized worker signer, immutable treasury, expected assets and nonzero gas. It explicitly reports that transaction gas estimation and separate reviewed deployment provenance are still required and financialProductionReady remains false. Reviewed contracts initially deployed paused must remain paused until the separately authorized activation sequence; this activation preflight correctly rejects them until then.

Targeted negative tests cover legacy configuration, each domain component mismatch, wrong router/signer/treasury/assets, paused contracts, empty gas and RPC failure. No signatures or chain writes are performed by these checks.
