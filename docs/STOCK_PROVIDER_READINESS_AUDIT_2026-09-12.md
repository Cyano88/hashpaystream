# Provider readiness audit and implementation checkpoint

Starting commit: b2ce622. Mainnet target remains X Layer 196.

## Findings

| Finding | Severity / effect | Action |
| --- | --- | --- |
| A single asset-level issuerEligible boolean can stand in for both participants | High: the adapter cannot bind its decision to the actual parties | Added mandatory participant clearance, exact scope checks and expiry clipping before offer preparation, publication, listing and acceptance |
| Public metadata access is being conflated with authenticated provider readiness | Release blocker | No Backed/xStocks-named credential was present in the current process environment; account/approval status remains unknown, not disproved |
| Provider account alone does not establish distribution eligibility | Release blocker | Prepared a request separating partner review, issuer account/API access and participant requirements |
| Price freshness, wrapper units, USD/USDC conversion and executable exit liquidity | Release blocker | Still require verified provider integration; no public indicative quote promoted to an acceptance price |
| Current wrapper implementation/audit review, production owner/signers, risk limits | Release blocker | Existing blocked deployment packet remains in force |

The [official partner page](https://xstocks.com/partner) distinguishes freely transferable tokens from partner onboarding/compliance responsibilities. Do not require every worker to have a Backed issuer account merely because the authenticated RFQ API uses registered wallets.

The [API quickstart](https://docs.xstocks.fi/developers/quickstart) documents public metadata separately from authenticated account/wallet/trading endpoints. No authenticated account request was made. No production env file or secret value was printed.

## Risk adapter contract change

HASHPAYSTREAM_STOCK_CONFIG.riskUrl now receives POST JSON rather than GET. This is HashPayStream's trusted risk-adapter interface, not a claimed Backed API endpoint.

Request fields:
- chainId, asset, worker, funder
- earningsId, principalUsdcUnits, policyVersion

Existing normalized market fields remain required. The response must additionally contain participantClearance with those exact scope fields and:
- checkedAt, expiresAt (Unix seconds)
- workerEligible, funderEligible (both explicitly true)
- workerJurisdiction, funderJurisdiction (two-letter codes)
- reviewReference (opaque reviewed-evidence reference)

The service must obtain actual identity/eligibility decisions and bind them to the authenticated wallets and reviewed policy. Echoing the request is not sufficient. The codes are format-checked, not a country allowlist. A reference is not cryptographic proof of issuer approval; this boundary relies on the trusted server-side adapter, whose production authentication and provider integration remain to be implemented.

Missing, denied, stale, future-dated, wrong-party, wrong-chain, wrong-asset, wrong-earnings, wrong-amount or wrong-policy clearance is rejected. Market/quote validity is clipped to participant expiry, so the signed risk approval cannot outlive that clearance. Every acceptance requests fresh evidence. Receipt recovery and already-due repayments do not depend on renewed participant approval.

No participant jurisdiction or review reference is returned in the browser's normalized market evidence. Requests carry wallet and funding scope only, not emails, identity documents or API keys.

Deployment impact: existing custom/local risk adapters must implement the POST request and clearance response. There is no compatibility fallback to the old asset-wide boolean. Stock mainnet remains gated.

## External request

[Prepared integration request](XSTOCKS_INTEGRATION_REQUEST_2026-09-12.md) describes the actual fixed-deduction flow and asks for a suitable partner/account route, jurisdiction requirements, X Layer quotes, wrapper confirmation and pilot support. It makes no claim of licensing, launch, approvals or real-money testing.

Submission needs the user's chosen reply contact, entity status and pilot-country intent. No message or registration was sent.

## Remaining production work

1. Confirm provider/partner path and jurisdiction responsibilities for this specific model.
2. Implement the trusted adapter with real eligibility evidence, authenticated pricing and executable liquidity verification.
3. Calibrate and implement approved pilot limits, session/corporate-action handling and token implementation monitoring.
4. Rehearse the full actual-token flow with approved participants, complete security review, then finalize the paused deployment.

This audit implements the participant-validation boundary; it does not claim to implement KYC, grant eligibility, provide live market data or establish production readiness.

## Validation

Passed: participant-clearance rejection tests; full synthetic HTTP/RPC payment flow and isolated PostgreSQL workers, including wrong-party/denied-policy checks before preparation and revoked worker eligibility before acceptance; TypeScript validation; existing stock policy, selection, checkout and funder UI tests; standalone route/browser-secret checks. These tests use synthetic eligibility evidence, not provider-issued approval.
