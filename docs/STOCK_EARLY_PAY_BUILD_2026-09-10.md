# Stock early pay: audit and first implementation

Base: release/production-20260907 at 98b485e. Work is isolated on feat/stock-early-pay-20260910. No deployment, live configuration change or asset approval is authorized by this document.

## Agreed product

The existing worker funder box shows the best eligible offer. A savings-style sheet lets the worker choose another offer without signing or submitting. A separate confirmation accepts exact terms. Ranking prioritizes verified completed settlements, then percentage fee. No separate marketplace screen.

Workers voluntarily receive tokenized stocks against fully funded, approved earnings. The funder receives a fixed USDC amount including the disclosed fee at maturity. Price changes after acceptance never change that deduction. Arc personal savings remains separate; this work does not migrate existing savings.

## Audit findings

- FundingPartnerPicker currently calls wallet signing and POST select_partner directly from each offer row. Selection must become a reversible local choice.
- api/upfront-fees.ts currently sets fees by duration and includes a separate completion charge. Funder-defined stock fees need a separate versioned model, not a change to signed historical terms.
- Existing UpfrontAdvanceEscrowV2 is a single-asset advance linked to Arc agreements. It does not reserve irrevocable same-chain USDC for a stock exchange. Do not enable it for this product.
- Existing partner data does not provide an abuse-reviewed, confirmed stock-settlement count. Never invent reputation from application age or submitted requests.
- No supported stock contract, price feed, volatility limits, liquidity threshold or fee ceiling has yet been approved. There must be no default production asset or permissive fallback.

## First build boundary

Implement the compact selection experience in the existing checkout, a pure stock-offer eligibility/ranking module, and a new locally tested escrow prototype. Keep the stock module disconnected from live money until an authenticated adapter can verify the new onchain earnings and risk evidence. Existing USDC quotes retain their existing fee and signature rules.

The new escrow owns same-chain USDC earnings and deposited stock inventory. Acceptance atomically reserves USDC and delivers an exact stock quantity. EIP-712 funder authorization and a short-lived risk approval bind the complete offer. Worker acceptance comes from the earnings owner. One offer can be filled once; new quotes are required for subsequent fills. The fee ceiling is constructor configuration, not an invented launch value. Approved earnings cannot be cancelled. Repayment and unused inventory withdrawal remain callable when new activity is paused.

## Release gates

1. Verify a real X Layer token, issuer eligibility, token accounting behavior and available pricing/liquidity sources.
2. Agree the all-in percentage ceiling and risk thresholds. Risk service must fail closed and publish expiring approvals. Price validation must limit hidden markups as well as explicit fees.
3. Build authenticated employer approval, funder deposit/offer signing, worker quote refresh/acceptance and receipt reconciliation adapters for the new deployment. Never route stock quotes through the legacy FundingTerms domain.
4. Confirm successful token delivery plus fixed USDC settlement from chain events; deduplicate and review independent employer/worker participation before awarding ranking credit.
5. Review contract and signed-quote security independently, test cancellation/replay/concurrency/paused settlement and interrupted-wallet recovery, then rehearse with labelled test assets.
6. Complete the existing production audit recovery tasks separately. Preserve legacy claims and deployed savings positions.

## Risk wording

Worker: Your tokens can lose value. Your scheduled USDC deduction stays fixed, even if their value falls. Selling may not always be available.

Funder: You send the worker your stock tokens now. On the payment date, you receive the agreed USDC amount plus your fee from the money reserved in escrow. That amount stays the same whether the stock price rises or falls. A problem with the escrow contract could delay or prevent payment, and USDC could lose value.

Warnings accompany eligible assets; they do not override an asset restriction. A new restriction prevents new acceptance but must not rewrite already accepted claims.

## Completed in this checkpoint

- Existing FundingPartnerPicker now uses FundingOfferSelector: a savings-style bottom sheet, a local selected offer and a separate confirmation action. Only unexpired offers covering the full requested amount are shown. Changing authenticated account or request remounts the checkout. Duplicate submit clicks are guarded.
- StockFundingCheckout is an optional mode of that same funder slot. It displays exact token units, exact USDC value, fixed deduction, payment date and worker consent. Changed terms require new consent; expiry is checked again immediately before the adapter callback. No production caller supplies this mode yet.
- StockFunderOfferTerms provides the percentage field, explicit ceiling and plain-language funder acknowledgement for the future existing-desk integration. It is not yet a live publish-offer endpoint.
- stockFundingOffers contains fail-closed eligibility, ranking and confirmed-settlement count helpers. External evidence must come from a reviewed backend adapter. It does not fetch a price feed or assert that a real stock is eligible.
- StockEarlyPayEscrow is a separate non-upgradeable review candidate using Ownable2Step, a configurable risk signer, allowlists and short-lived EIP-712 approvals. Constructor fee ceiling and risk-age limit are required inputs. It starts paused. No owner sweep or arbitrary repayment-recipient override is present. Token eligibility and risk-signer policy changes invalidate outstanding approvals, not accepted claims.
- Stock fees round DOWN to USDC base units so rounding never exceeds the configured percentage ceiling. The prototype sends the entire disclosed fee to the funder. Adding a platform share later must come from that same capped fee and requires explicit reviewed terms.
- Reputation counts are not invented for the legacy API. Missing verified history is displayed as unverified. Wallet-address separation alone is not proof of independent participation.

## Verification

- Supported Node 22.23.2 used.
- Complete Hardhat suite: 103 passing, including 14 new stock escrow cases.
- New checks: stock-offer policy, selection sheet interaction and stock checkout consent/expiry/duplicate submission all passed.
- Existing upfront opportunity API checks passed, including historical receipt continuity, ownership isolation and explicit deployment binding.
- Existing standalone surface checks passed with expectations updated for the new selection-and-confirmation UI.
- TypeScript and Vite production build passed. Existing third-party annotation, vm-browserify eval and large-bundle warnings remain.
- Real browser review at 390 x 844 passed for the local fixture: sheet opens, choice updates the original box from 101 to 100.5 USDC, and confirmation remains disabled until consent. Worker and funder screenshots inspected. Preview-only font errors were fixed; fresh reload had no new application errors.
- Preview artifacts: output/playwright/stock-offers-mobile.png, stock-selected-mobile.png, stock-funder-mobile.png. All offers, token addresses, history counts and the 3% ceiling in that fixture are fictional test inputs, not production policy.
- Production checkout remains clean. No keys or .env files copied, no transactions sent, no deployment or push performed.

## Exact next implementation step

Build the authenticated same-chain earnings and quote adapter against the new escrow on a local/test network: verified employer funding/approval, funder inventory and signed offers, risk attestation generation, worker acceptance and confirmed event reconciliation. Wire its response into the existing FundingPartnerPicker stock prop and its publish action into the current funding desk. First pin the supported token metadata, pricing source, fee ceiling and risk policy; do not fabricate production defaults to make the UI appear live.
