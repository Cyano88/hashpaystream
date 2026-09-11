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


## Authenticated adapter checkpoint (next local build)

Implemented in the same isolated feature worktree after eba004d:

- Authenticated API at /api/hashpaystream/v1/stock-early-pay. Privy access tokens are verified server-side; an email and exactly one embedded Ethereum wallet are required. Every actor must also belong to the explicit pilot participant list.
- Employer registration verifies the on-chain funding wallet. Approval preparation is restricted to that employer; only the employer wallet can perform the actual contract approval. Worker requests bind the authenticated account to the on-chain worker and already approved, funded earnings.
- Approved funder profiles bind the verified email ownership key and wallet to an on-chain funder allowlist. Preparation, publication and worker acceptance recheck current eligibility, available USDC, token inventory, fees and fresh pricing.
- The server pins chain ID, deployed escrow runtime hash, USDC, asset decimals, fee ceiling and risk age. Risk signatures remain server-side and bind the exact offer hash and on-chain policy version. No production default asset, price source, volatility limit or fee ceiling is supplied.
- Existing early-pay and funding routes select the new components only when the build flag is explicitly enabled. Funders can deposit and withdraw unused inventory, review exact token and USDC terms, sign/publish, and claim repayment. Workers select approved earnings, use the existing funder selector, explicitly consent and sign acceptance.
- Browser acceptance recomputes and checks the exact displayed quote before simulating and sending. Pending submissions are stored by account, wallet, chain and escrow; uncertain submissions require verification before another acceptance. Recovery with an unknown transaction hash clears only after a confirmed claim exists.
- Receipt reconciliation checks successful canonical confirmed transactions, escrow emitter, offer hash, participants and exact economics. Completed funding counts require both delivery and repayment receipts plus an explicit independent-participation review. Reorged evidence is excluded.

Configuration:
- Browser: VITE_HASHPAYSTREAM_STOCK_EARLY_PAY_ENABLED (default false), VITE_HASHPAYSTREAM_STOCK_ESCROW_ADDRESS.
- Server: HASHPAYSTREAM_STOCK_EARLY_PAY_ENABLED (default false), HASHPAYSTREAM_STOCK_CONFIG (JSON), HASHPAYSTREAM_STOCK_RISK_SIGNER_KEY; existing Privy authentication, ownership secret and durable database configuration remain required.
- JSON requires chainId, escrow, usdc, asset, assetSymbol, assetDecimals, rpcUrl, runtimeHash, riskUrl, maxFeeBps, maxRiskAge, quoteTtlSeconds, confirmations, participantIds and policy. The policy requires maxVolatilityBps, maxPriceAgeSeconds, maxQuoteDeviationBps and minExecutableLiquidityUsdcUnits. reviewedEarningsIds is optional and defaults to no credited history.
- Only localhost chain 31337 in a non-production process or X Layer testnet 1952 with HTTPS endpoints is accepted. Mainnet 196 is explicitly rejected. Flags alone cannot enable a mainnet stock flow.

Validation:
- npm run test:stock-integration deploys synthetic contracts to a temporary loopback Hardhat node, generates ephemeral test accounts, and exercises the actual HTTP handler, RPC adapter, funder EIP-712 signature and server risk signature through on-chain acceptance and settlement.
- Verified employer/worker/funder isolation; fee cap and volatility/trading gates; publication revalidation; exact stock delivery; fixed USDC reservation and repayment; receipt confirmations; unknown-hash recovery; duplicate receipt idempotency; reviewed completion counts; reorganisation invalidation; runtime-code pinning; and mainnet rejection.
- The local scenario is 100 USDC principal, 1% fee, 2 synthetic TESTx tokens, and 101 USDC paid to the funder at maturity. Its 3% ceiling is a test fixture, not a product decision.
- Stock policy, selector, worker checkout, funder quote-review interaction, and standalone route/browser-secret tests passed.
- Node 22 TypeScript validation and the Vite production build passed; existing dependency annotation and bundle-size warnings remain.
- No external-chain deployment, real-token transaction, production configuration change or push was performed.

Remaining before supervised public testing:
1. Finish employer-facing funding/approval onboarding and remaining-earnings withdrawal in the same minimal UI. This checkpoint exercises those contract operations through the local harness and provides authenticated employer registration/approval preparation, but does not yet expose a complete employer browser journey.
2. Choose an actually supported test asset and reviewed risk adapter. The present interface consumes a configured trusted pricing/eligibility endpoint; it does not implement a real issuer or market-data provider. Per-participant issuer eligibility, jurisdiction rules and market-hours behaviour need verified integration before public participation.
3. Rehearse real Privy sign-in, wallet switching and signing on the pinned X Layer test deployment. Local tests inject synthetic authenticated identities; they do not prove live Privy credentials or a deployed browser session.
4. Add automatic settlement/event ingestion and complete failure recovery. Current reconciliation is invoked by the participant UI; missing receipt hashes and confirmed reverted worker submissions can require manual verification. Funder settlement is contract-idempotent but its browser does not yet persist an interrupted settlement hash.
5. Review and harden the contract and signing operations before enabling real assets. Approved earnings are irrevocable; the pilot UI must explain this clearly before employer approval. Assets, fee ceiling, risk policy and operational controls remain unset for production.

Next implementation: complete the employer browser journey and reconciliation/recovery gaps, then perform a pinned X Layer testnet rehearsal. Keep the stock flags disabled until that rehearsal has explicit configuration and passes.


## Employer lifecycle checkpoint — 2026-09-11

Resumed from clean commit 8aefc44 in the isolated stock-early-pay worktree.

- Added a compact "Fund worker earnings" section inside the stock early-pay screen. Employer input is saved as a durable draft before wallet activity; repeated preparation with the same reference is idempotent and changed terms are rejected.
- Funding review shows the worker wallet, exact USDC amount and payment date. Funding, irrevocable approval and return of unapproved funds are separate actions. Approval requires an explicit acknowledgement bound to the displayed worker, amount and date.
- Employer actions and worker collection of remaining earnings validate the displayed terms, pinned network/escrow/USDC, exact transaction data and on-chain simulation before sending. USDC approval is limited to the funding amount.
- Added authenticated employer listing, action preparation and confirmed status recovery. Drafts and earnings are scoped to the authenticated employer and wallet; other users cannot approve or cancel them. Remaining-earnings payout is available only for approved due earnings and always pays the contract's worker.
- Browser pending actions survive reload under account/wallet/network/escrow keys. Known hashes are checked against confirmed canonical receipts, sender, escrow and exact call data. Unknown-hash recovery uses confirmed earnings state and does not automatically broadcast.
- Confirmed reverted worker acceptance can now clear its pending marker after matching the wallet and offer. Unconfirmed or unrelated transactions cannot clear it. Funder settlement hashes are persisted and can be reconciled after interruption without another broadcast.
- No contract source changes, external-chain transactions, live configuration changes, deployment or push.

Validation:
- Node 22 TypeScript and Vite production build passed. Existing dependency and bundle-size warnings remain.
- Extended HTTP/RPC integration test passed using synthetic local accounts and tokens. It exercises the real employer browser transaction client for funding, cancellation and worker payout, plus approval consent/ownership, durable draft idempotency, confirmed revert recovery and settlement recovery without rebroadcast.
- Employer UI tests passed for review without payment, irrevocable approval consent, changed-amount consent invalidation and duplicate-click protection.
- Existing stock policy, selector, worker checkout, funder review and standalone/browser-secret regression checks passed.
- Playwright mobile review at 390 x 844 verified the employer layout and disabled-until-consent approval. Local fixture only; screenshot output/playwright/stock-employer-mobile.png. Preview's missing favicon was unrelated to app behavior.

Remaining:
- Automatic settlement scheduling and event ingestion are still not implemented for this escrow. Missing transaction hashes can recover confirmed state, but complete historical receipt discovery still needs an event indexer.
- Choose and verify the test asset, live risk/issuer eligibility adapter and risk policy, then deploy a pinned X Layer testnet candidate and rehearse real Privy authentication/signing.
- Keep all stock enable flags false by default. Public or real-asset readiness is not established by these local tests.
