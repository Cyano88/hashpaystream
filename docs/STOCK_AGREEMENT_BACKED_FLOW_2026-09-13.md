# Agreement-backed Stock Early Pay checkpoint, 13 September 2026

## Product boundary

A funded HashPayStream job that opted into Stock Early Pay is the only entry point. The job agreement supplies the protected USDC amount, worker identity, and due date. Opening Early Pay without that job now produces an empty state, and the assessment API rejects agreements that are not bound to an opted-in service request.

The worker chooses from ranked eligible offers. Ranking continues to prefer verified completed funding, then lower percentage fees. The contract caps the funder fee at 3%.

## Asset custody

Approved stock tokens stay in the funder's wallet until the worker accepts a fully authorized offer. AgreementBackedStockDelivery then transfers the exact token quantity directly from the approved funder to the worker's verified Privy wallet on X Layer and records the agreement-bound delivery.

The delivery contract does not accept stock deposits, does not hold inventory, and does not receive the agreement's USDC. The funded Arc agreement remains the only USDC repayment source. Arc savings remain separate and use their savings vault.

## Price and session policy

X Layer can provide an executable DEX quote while the underlying US market is closed, but that quote is indicative. Creating or accepting a new offer requires an open regular US session plus a fresh independent stock price, verified token identity, participant clearance, liquidity, volatility, deviation, and quote-age checks. The signed evidence commitment and five-minute on-chain authorization limit bind those checks to delivery.

## Candidate controls

The local contract candidate:

- starts paused;
- allowlists funders and stock-token contracts;
- binds the funded agreement, worker, funder, stock contract, exact token amount, fixed USDC amounts, fee recipients, price evidence, and expiry through EIP-712 signatures;
- requires separate underwriting, worker-consent, risk, and Arc-protection signatures;
- enforces a 3% funder-fee ceiling and an 80% maximum advance;
- blocks delivery and Arc-agreement replay;
- rejects transfer-tax or otherwise non-exact stock tokens;
- leaves its stock-token balance unchanged during delivery.

The focused contract suite passes three scenarios covering direct delivery, pause and allowlists, signed-field tampering, fee limits, stale evidence, and replay.

Slither analyzed 42 contracts with 102 detectors. For this candidate it reported the expected balance-around-token-call warning despite the nonReentrant guard and checks-effects-interactions ordering, intentional deadline comparisons, and high cyclomatic complexity in the fail-closed delivery validator. A second run excluding those acknowledged detector classes and the unrelated legacy event warning analyzed 98 detectors with zero additional findings. These results support continued testing but do not replace independent review.

## Issuer and distribution boundary

Backed's current product documentation lists xStocks as ERC-20 tokens supported on X Layer without technical transfer restrictions, but it also states that direct purchase is limited to qualified investors, distribution is restricted by jurisdiction, and the products are not available to US persons or ordinary UK retail clients. Technical wallet compatibility is therefore not permission for an unrestricted public launch. HashPayStream needs a licensed distribution partner and enforceable participant eligibility before a real-token pilot.

Official source: https://assets.backed.fi/legal-documentation

## Repayment lifecycle

The shared settlement runtime now includes a dedicated agreement-backed stock pass. It re-verifies the recorded X Layer delivery against the pinned contract runtime, waits for the authoritative Arc agreement to complete, signs the fixed USDC split from the immutable assessment snapshot, verifies the confirmed Arc repayment event, and only then marks the stock request settled. Durable block checkpoints recover a repayment submitted by another relayer or interrupted after broadcast. Stock requests fail closed unless the shared settlement runtime and this stock pass are both enabled.

The legacy inventory escrow receipt and settlement workers are not package entry points for this flow.

Before pilot activation, 
pm run stock:delivery-settlement-preflight performs read-only checks for the database and shared lease, the exact X Layer runtime and EIP-712 domain, pause state, asset allowlist, independent delivery signers, Arc router configuration, repayment signer, treasury, and relayer gas. It reports inancialProductionReady: false because external review and issuer/distribution approval remain separate release requirements.

## Release boundary

No agreement-backed stock-delivery contract is deployed on X Layer mainnet. The previously recorded contracts implement USDC escrow or legacy stock inventory and must not be used for this flow. Both legacy stock screens are disconnected from runtime feature flags so a configuration mistake cannot expose their deposit form.

Keep production stock execution closed until all of these are complete:

1. obtain independent review of the final AgreementBackedStockDelivery contract, API receipt verifier, and browser execution adapter;
2. verify the exact X Layer stock-token issuer, contract, redemption and transfer restrictions;
3. connect Twelve Data or another independent licensed reference source and prove regular-session freshness;
4. complete participant eligibility, jurisdiction, per-user, per-token and global exposure limits;
5. approve the owner multisig, separate production signers, and pilot exposure limits;
6. deploy from the owner multisig while paused, verify source/runtime/configuration, then rehearse one allowlisted tiny delivery during the regular US session.

No mainnet transaction, deployment, stock deposit, or production feature-gate change occurred in this checkpoint.
