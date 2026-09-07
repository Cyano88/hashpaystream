# Legacy migration disposition - 2026-09-07

Status: FINANCIAL RELEASE NO-GO. Read-only audit; no records, contracts or provider agreements were changed.

## Three previously incomplete records

At X Layer block 70032676, the three records missing fundingTerms.message.offerHash were traced through their stored underwriting offers. Each offer used the tracked predecessor escrow, its signature matched that contract's current underwriting signer, and its underwriting deadline had expired. Hashes were reconstructed only in memory, not written back or exported.

The predecessor returns the eleven-field Position layout found in UpfrontAdvanceEscrow before commit db71d95, rather than the current sixteen-field fee-settlement layout. The stored Arc recipient matches that escrow's immutable original repayment router.

- One position is all zero: the expired offer was never funded on that predecessor. Leave the source record intact; it is not a settled payment.
- Two positions have Released status. Neither agreement is credited on the original router. The router's totalClaimable and the repayment wallet's claimable balance were zero, which does not prove repayment.
- The provider's authenticated read endpoint returned HTTP 200 for both released positions. Both authoritative Arc testnet chain IDs and agreement IDs matched their X Layer positions.
- One provider agreement is expired with remaining funds; the other is refunded with no remaining funds. Neither reports the full protected amount released as repayment.

Operator clarification on 2026-09-07: the user described these as testnet transactions, then explicitly requested migration. Preserve the two actual Released states and the expired/refunded provider evidence; this instruction does not prove on-chain settlement. The recorded architecture is mixed-network: the audited escrow offers and RPC checks use X Layer mainnet 196, while the associated Arc agreements use testnet 5042002. Do not relabel the X Layer side as testnet. The requested migration destination is being clarified: carrying forward legacy history and deploying/switching to reviewed contracts require different actions. No record deletion, settlement rewrite or transaction has been performed.

## Historical-read scope correction

Commit 0748b5e preserves structurally valid fee-settlement records across explicit target switches. It does not yet cover these older eleven-field positions or their pre-fee economics. Do not put this predecessor into the sixteen-field history configuration and claim it is supported. Decide the legacy obligation/archive treatment before activation; the current production configuration remains unchanged.

## Event coverage remains incomplete

Repository history identifies earlier X Layer deployments and replacement references beyond the current escrow. The earliest tracked deployment block is 68555546. Read-only pre-start code checks found no code at the inspected tracked addresses before that block.

The broader event inventory did not complete. Both officially documented public endpoints rejected ranges larger than 100 blocks. JSON-RPC batching was not accepted by the tested response path; paced single requests then returned over-rate-limit errors. No successful full-range coverage or empty-stack claim follows from these attempts. All failed scan processes terminated; no background scan remains running at this checkpoint.

The documented endpoint list and nominal public rate guidance are at https://web3.okx.com/onchainos/dev-docs/xlayer/developer/rpc-endpoints/rpc-endpoints . The actual method errors above take precedence over assuming that nominal limit guarantees log throughput.

A complete fixed-block inventory still needs a suitable existing archive/indexed data connection or a resumable scan at the method's accepted rate. It must cover every tracked escrow from before deployment, reconcile all funded/released/refunded event IDs with contract state, inspect the corresponding router's actual repayment model, and repeat the final delta after an authorized funding freeze. Indexer truncation/pagination must be checked. No new paid service was created.

## Remaining activation conditions

1. Resolve and record the disposition of the two released predecessor advances; preserve their actual status and evidence.
2. Complete event coverage and legacy history treatment, with no unidentified funded or released obligation.
3. Prepare and verify the reviewed V2/V4 deployment and production network parameters. The commands now select reviewed V2/V4 artifacts with frozen-source and paused-state guards (commit ba7fa02); offline verification passed. No reviewed deployment or production network activation has occurred. See REVIEWED_DEPLOYMENT_PREPARATION_2026-09-07.md.
4. Finish recovery/alert evidence and final candidate validation. No change to the frozen product scope.
