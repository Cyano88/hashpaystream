# Early-pay funder recovery decision - 2026-09-08

## Confirmed limitation

The reviewed V2 X Layer escrow sends the advance to the provider and changes the position to Released. refundAdvance accepts only Funded positions. The reviewed Arc agreement can return the remaining amount to its original payer through payer cancellation, operator cancellation, or expiry. The V4 repayment signer requires a completed Arc agreement; it cannot legitimately manufacture repayment after cancellation/refund. The repayment router has no independently funded principal guarantee.

The isolated reviewed-contract harness now reproduces both relevant failures: refund of a Released advance rejects with PositionNotFunded, and cancelled/refunded Arc state rejects repayment signing. Existing successful split, replay prevention, and recovery tests still pass. The harness also confirms exact unreleased refund after its deadline while the X Layer escrow is paused. All harness funds and keys are synthetic.

Closing the initial payer cancellation window alone is insufficient: operator cancellation and eventual expiry can still return Arc money to the payer. Hiding UI actions does not constrain direct contract calls.

## Containment verified on-chain

On 2026-09-08 the existing owner paused X Layer escrow 0x98A45f994E5fb887a950D20BEd60bA83cB00430c using setPaused(true).

Transaction: 0xc9c2ae0432236a81059de59088d72f082f0a253d39ecbf833bc70411d6b1f5b4
Block: 70079949

New funding and advance releases are blocked at the contract. Arc router 0x78d42Ada91e5121cbe85A50f50436B1Cc3a23999 remains unpaused; automatic settlement flags were not disabled. The existing 0.10 USDC refund-test position remains Funded and unreleased, with refund eligible strictly after 2026-09-09 04:44:19 UTC. No additional advance was funded. Only native gas was spent on the pause transaction.

Do not reapprove funding partners to resume funding inadvertently: authorizeFunderAndActivate can unpause this escrow. The pause must remain until the launch-scope or protection-design decision is explicitly resolved.

## Recommended launch decision

Keep early pay disabled for launch and finish standard agreements and savings. This contains the known exposure without modifying audited contracts or inventing an unfunded guarantee. The audited contracts can be correct at enforcing their rules while the combined product still lacks the intended principal protection.

If protected early pay remains a launch requirement, it requires a separately scoped contract change and fresh audit. Proposed acceptance criteria:

1. Before each advance release, reserve real USDC principal on X Layer from an explicitly authorized collateral or reserve provider. Arc test USDC does not count as real collateral.
2. Lock that coverage to a single position; it cannot be withdrawn, reused, or overcommitted while the obligation remains open.
3. Define cancellation, operator cancellation, expiry, and dispute/default outcomes with explicit evidence, timing, and rights. The protected customer refund must not be silently diverted to repay the funder.
4. Enforce one principal recovery at most. Normal repayment and default recovery must be mutually exclusive, including delayed cross-chain observations and subsequent late repayment.
5. Make any yield conditional unless separately funded and reserved. Track reserve capacity and stop issuing advances when coverage is insufficient.
6. Verify the full cross-chain state machine, then re-audit before deployment or unpausing.

A reserve creates a real capital requirement and an explicit loss-bearing party. No reserve source, amount, deposit, contract deployment, or economic obligation is authorized by this audit. These remain a product/capital decision.
