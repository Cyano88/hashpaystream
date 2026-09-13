# Agreement-backed Stock Early Pay checkpoint, 13 September 2026

## Decision

The funded Hash PayStream job remains the only USDC repayment source. A customer must never fund a second stock-specific earnings escrow.

The worker entry point is the funded service request that opted into Early Pay. Its `agreementId`, protected USDC amount, worker wallet, and due dates are authoritative. The worker does not choose separate earnings or type another amount.

X Layer is the delivery and execution chain. A funder escrows the exact approved stock-token quantity. After Hash PayStream verifies the funded Arc agreement, the contract releases those tokens to the worker. At completion, the Arc repayment router distributes the already-protected USDC to the funder, worker remainder, and treasury under the signed terms.

## Weekend policy

X Layer may provide an executable DEX quote while the underlying US market is closed. That quote is indicative only. Offer preparation, publication, and worker acceptance require a fresh independent stock reference, open regular session, participant clearance, liquidity, volatility, deviation, and age checks. Fixed USDC repayment of a previously accepted position does not depend on a weekend stock quote.

## Implemented local contract candidate

`contracts/src/UpfrontAdvanceEscrowV3.sol` extends the existing agreement-backed advance pattern:

- approved stock assets are owner allowlisted;
- approved funders are owner allowlisted;
- signed terms bind stock contract, token quantity, fixed USDC value, repayment, fee, parties, and expiry;
- the funder escrows stock tokens only;
- release requires a matching Arc protection attestation;
- an unreleased stock deposit returns to the funder after the protection deadline;
- one Arc agreement can release only one advance;
- the contract starts paused.

The focused V2, V3, and legacy stock contract suites pass 24 tests. Slither analyzed 42 contracts with 99 detectors and reported no finding in the V3 candidate; its only result was the pre-existing unindexed `PolicyChanged` event in `StockEarlyPayEscrow.sol`.

## Current release boundary

No correct agreement-backed stock contract exists on X Layer mainnet yet. The two previously recorded addresses are paused USDC-only contracts. Sending a stock deposit to either would test the wrong architecture and could strand or misroute funds.

Keep these switches closed:

- `HASHPAYSTREAM_STOCK_EARLY_PAY_ENABLED=false`
- `HASHPAYSTREAM_STOCK_XLAYER_MAINNET_APPROVED=false`
- `VITE_HASHPAYSTREAM_STOCK_AGREEMENT_FLOW_ENABLED=false`

## Next implementation slice

1. Extend the funding-terms API and browser typed data to version 3 with `advanceAsset` and `advanceTokenAmount`.
2. Bind stock offers to the authenticated provider's funded, opted-in `agreementId`; derive the USDC amount and deadlines server-side.
3. Reuse the existing ranked funding-partner picker and remove the separate worker earnings and amount form.
4. Add local end-to-end coverage from service request through stock release and Arc repayment split.
5. Obtain an independent contract review, deploy the candidate paused from the owner multisig, verify runtime and configuration, then perform an allowlisted tiny-value rehearsal during the regular US session.

No mainnet transaction or production feature-gate change occurred in this checkpoint.