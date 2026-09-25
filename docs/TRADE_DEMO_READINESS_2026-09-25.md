# Trade demo readiness - 25 September 2026

## Scope
Hash PayStream web Trade and its Hash PayLink hosted xStocks checkout. Pocket product work is owned by another session and is not part of this release. No contract, wallet authority, fee policy, or payment amount changes in this cleanup.

## Completed real-money happy path
A controlled two-account test used 0.00222 NVDAx on X Layer mainnet, with no physical item and no delivery charge. Verified listing, seller offer, buyer acceptance, both hosted account connections, share-based escrow creation, seller acceptance, token approval, funding, simulated pickup, buyer receipt confirmation, voluntary release, and final settlement.
Settlement transaction: `0xdac67e35a005527cef1e00fc1fcfd24d5a4a0eb42a74cd5efe2ae3032ed3a794`, successful in block 71596025. All 2216229757026900 funded share units were allocated to the seller; buyer allocation and final escrow token balance were zero. The issuer's stock equivalent was 0.002219999999999999 NVDAx. This is one successful path, not complete production certification.

## Cleanup
- App confirmations and hosted checkout confirmations: centered 448px desktop dialogs, bottom-aligned animated phone sheets, close button, focus containment/restoration, Escape/native back, safe-area padding, scrolling for long content, reduced-motion support.
- Stock picker uses the same responsive entrance pattern. Search leads with asset names, not contract terminology.
- Readable payment outcomes and six-decimal display rounding. Nonzero amounts smaller than display precision are not shown as zero. Exact stock quantities, share units and verification block remain under Transaction details. No rounding is used for signing or API quantities.
- Zero refund rows are omitted from the normal successful-payment receipt.
- Pickup-specific status and action wording, simpler confirmation descriptions, and a buyer waiting message instead of the false escrow-unavailable message while the seller prepares payment.
- API re-plans up to three times when overlapping confirmed-block reads lose a race. It never returns the rejected signing plan, rolls back saved observations, or broadcasts a transaction. Persistent stale observations still fail closed.
- Hash PayStream queues the user's connection action behind an in-flight status refresh instead of dropping the click.
- A deliberate manual refresh clears an old action error after status is verified.

## Verification
API regression: stale observation retry, bounded failure, unchanged identity checks, immutable consent, evidence, pause/recovery and project isolation.
UI regression: unavailable status blocks actions, cancelled review restores actions, processing hides CTAs, funded state removes unpaid actions, final receipt hides technical data by default.
Display tests: exact and rounded amounts, carry to one unit, tiny nonzero quantities, large integers.
App regression: connection click during background refresh runs once and gives immediate progress.
Browser component checks: both actual confirmation components at 1440x900, 390x844 and 320x568, viewport containment, desktop center, mobile base alignment, keyboard focus loop and Escape; screenshots saved locally under output/playwright. Long payment content fits at 320x568, and reduced-motion disables the entrance animation. Deployed-page checks are recorded below.

## Explicitly deferred live coverage
At the user's request, document these now and execute after programme selection, before claiming broad production readiness. Local contract/fork tests do not count as these live tests.

| Scenario | Required verification |
| --- | --- |
| Seller refund | Buyer receives exact escrow shares; refund receipt and both app views agree |
| Missed handover deadline | Buyer refund is unavailable before and available after the deadline |
| Inspection expiry | Seller claim respects exact deadline and dispute state |
| Dispute and arbitration | Authorized actors only, correct split shares and remainder, final receipts |
| Mutual resolution | Both parties' approvals, replay prevention, exact allocation |
| Wallet rejection, insufficient gas | No duplicate transfer; clear recovery and retry behavior |
| Dropped/replaced transaction | Receipt identity verified; no blind resubmission |
| Disconnect, app restart, expired login | Pending action recovers for the same owner; no cross-account leakage |
| Concurrent tabs/devices | Repeated live stress and state progression under polling |
| Issuer adjustments/donations | Live asset accounting matches audited share model without consuming donations |
| Other stocks and networks | Separate allowlist/provider validation; no inference from NVDAx success |
| Arc Agreement and wider app flows | Separate live end-to-end coverage, outside this stock Trade test |
| Android native parity | Signed APK refresh, keyboard/safe-area/back gestures, auth return and pending recovery |

## Recorded demo plan
Do not record or move additional funds until the user funds the necessary wallets and explicitly starts the demo.
1. Verify deployed builds, both accounts, stock balance and OKB gas without exposing secrets.
2. Start actual screen recording and confirm it is running. Keep OTPs, email inboxes, wallet secrets and other sessions out of the capture.
3. Fresh clearly labelled demo listing and offer; same controlled amount or a newly agreed amount. Never reuse a settled reservation.
4. Buyer accepts; both accounts connect; seller sets up and confirms payment; buyer pays.
5. Show payment held, simulated pickup, receipt review, voluntary release and final seller receipt.
6. Verify successful chain settlement and empty escrow, stop recording, replay the file and check duration/audio/cropping before delivery.

A full-app polished demo also needs a screen-by-screen walkthrough of Home, Agreements, Trade and Account. Do not label this Trade rehearsal as testing all app products.

## Release verification follow-up
- Hash PayStream release `f897b62d6f411dcf8aa5f7736cbf05c66b30622f` is live.
- Hosted checkout cleanup `2f7225efe` was included in live Hash PayLink merge `b8dc529a38dfd816ef847d9bf57dc9e216708f34`, preserving the other session's Pocket changes.
- Buyer receipt verified in the deployed browser: Payment released, Paid to seller, About 0.00222 NVIDIA (NVDAx); technical details collapsed and no unpaid payment buttons.
- Hash PayStream typecheck and production build passed. Targeted API, hosted UI, display math, share routing, and app interaction tests passed. Hash PayLink Vite build completed; its repository-wide typecheck was stopped without completion and is not reported as passed.
- During the next shared-service deployment, live health and asset requests returned HTTP 502, blocking seller receipt and app wallet-session restoration checks. Recheck after deployment recovery before recording or requesting demo funds.

- Shared service recovered on release `6e270f2fc45555c577e7b514a3451319c369a321`; health returned 200. Seller browser now shows Payment released and You received, About 0.00222 NVDAx. Buyer app restored its saved Circle session on retry without a new OTP and shows Payment released in the Trade conversation.
- Full-app walkthrough found a wallet-source mismatch: Home stock balance, stock Receive and stock Send use the original app Privy wallet; hosted Trade and Swap use the separately connected Hash PayLink wallet. The zero Home balance is therefore not evidence that the hosted wallet is empty. Full-app demo readiness remains blocked on deciding and implementing a consistent wallet experience; no funds were moved to correct this.
- Follow-up copy correction: zero delivery fees display No charge; one-day terms use singular day.

- Agreements audit found its dashboard fetching the sandbox-only upfront route in live mode and treating that 403 as failure of the whole list. The live dashboard now reads standard agreements only; sandbox retains the legacy fetch. Typecheck passed. The older standalone surface smoke test fails on its pre-existing expectation that Home has a Savings action, which conflicts with the current xStocks navigation; it is not counted as passed.
- Read-only browser walkthrough reached Home, Agreements, Trade, Account and the xStocks list. No new financial actions were submitted.
