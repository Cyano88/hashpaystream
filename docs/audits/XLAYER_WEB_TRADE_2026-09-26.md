# X Layer web Trade: current audit and completion scope

Date: 26 September 2026
Scope: Hash PayStream desktop web Trade and its shared Hash PayLink xStocks hosted checkout. Work Agreements, Android/mobile changes, Pocket changes, new assets/chains and new bridge routes are outside this phase.

## Current source baseline

- Hash PayStream worktree: .audit-tools/hashpaystream-hosted-release-20260925, HEAD 15f3046. Tracked application source clean at audit start; pre-existing .codex-temp and contracts/deployment-plans left untouched.
- Hash PayLink worktree: .audit-tools/hashpaylink-stock-api-20260925, HEAD 8153191af. Tracked src/api/scripts/packages clean at audit start; pre-existing dist changes were not staged, reset or overwritten.
- This is a source audit plus focused local tests and public HTTP checks. It is not a security certification, contract re-audit, deployment comparison or new funded production E2E.

## Ownership and path

Hash PayStream owns listing, enquiry, proposed/accepted terms and immutable offer snapshots. Both people link verified Hash PayLink identities; the buyer reserves the checkout. Server-side terms, participant identities, token and exact quantity are bound to one idempotency reference. New stock Trade uses Hash PayLink hosted checkout on X Layer 196, Privy wallet signing and xstocks-shares-v2 custody. Existing legacy reservations retain recovery access; do not replace funded records.

Hash PayLink owns participant consent, escrow transaction planning, signing UI, receipt reconciliation and stock settlement receipts. A developer key creates/reads drafts; it does not sign for users. Arc/Circle authentication exists in the HPS app shell but is not the X Layer stock settlement rail.

Sources: api/trade-community-store.ts hostedCheckout; api/trade-hosted-checkout.ts; src/components/TradeCheckout.tsx; HPL api/xstocks-agreement/http.ts and src/components/xstocksAgreement/HostedWorkCheckout.tsx.

## Verified in this audit

- HPS npm run typecheck: passed.
- HPS trade-hosted-route-smoke: passed authentication, server-derived identity, gating and existing recovery.
- HPS trade-hosted-checkout-smoke: passed pinned origin, exact response binding and read-before-create recovery.
- HPS trade-checkout-interaction-smoke: passed user action waiting for background read, executed once.
- HPL xstocks-trade-hosted-smoke: passed exact totals, deadlines, project isolation, idempotency, consent and paused recovery.
- HPL xstocks-hosted-checkout-ui-smoke: passed stale status blocking actions, retry recovery, processing CTA hiding and funded-state removal of unpaid actions. Initial run lacked react-test-renderer; rerun passed using the test's CHECKOUT_UI_TEST_MODULE_ROOT option pointed to HPS's installed test modules. No dependency versions changed.
- Public HPS /healthz: 200 JSON. /trade: 200 app HTML. Hosted checkout route: 200 app HTML (does not establish a valid agreement). Unauthenticated xStocks assets API: 403 JSON, as expected.
- Receipt UI shows rounded user-facing amounts, hides zero settlement rows and keeps exact quantities/share data inside details.
- Shared confirmation sheet already uses centered desktop layout, mobile bottom-sheet layout, close control, focus management and Escape dismissal. Source verified; fresh authenticated geometry not verified.

## Gaps and completion order

1. Payment status freshness and Trade completion: HPS's hosted proxy reads HPL's saved observed state. HPL developer GET returns view(record); onchain observations are updated by participant prepare/reconcile. HPS polling alone is not independent chain reconciliation. Add/reuse a verified status reconciliation path and project-bound completion propagation. Keep pending, stale and confirmed terminal states distinct; decide listing availability from explicit verified outcomes, not a locally accepted offer alone.
2. Bounded loading and quiet refresh: XStocksAgreementPage awaits token/fetch without a time deadline (only unmount abort). HostedWorkCheckout background polling has no in-flight overlap guard or visibility/focus coordination. It always shows Refresh agreement. Add bounded requests, deduplication, focus recovery and quiet background refresh; reserve visible retry for errors. Preserve fail-closed action gating.
3. Checkout-to-Trade handoff: HPS currently opens hosted checkout in a new tab, with no explicit contextual return in the hosted page. Add a validated return destination and clear continuation/result CTA; never trust arbitrary caller redirect URLs or query-string payment-success claims.
4. Recovery: browser storage retains pending tx and verifies matching chain, sender, target, calldata, value and receipt. Missing-hash ambiguous submissions intentionally block resending. Provide a clear recovery/help path and test reload, timeout, account switch and storage failure without weakening duplicate-payment prevention.
5. Desktop finish: browser verification of listing rows, search/filter, listing composer, offer thread, terms, account linking, checkout, confirmations and receipts at desktop/tablet widths. Reuse existing font, list/CTA patterns and centered modals. No new parallel wallet UI. Replace confusing terms only where the exact financial meaning remains visible in details.
6. Lifecycle completion matrix: two-account released payment; unpaid cancellation; seller refund; missed-dispatch refund; receipt/inspection flow; dispute and resolution; issuer/share precision; insufficient OKB/token balance; stale/expired request; disconnected session; repeated clicks; RPC failure and new-payment pause recovery. Separate mocked/local evidence from controlled production evidence.

## Release gate

Complete and test the status/handoff/recovery changes first. Then inspect the actual authenticated buyer and seller UI on web, run the controlled lifecycle matrix on the reviewed deployment, verify exact stock movement and matching receipts, and record what remains untested. Do not label the full platform production-ready based on the previously recorded successful demo alone. No financial transfer was submitted in this audit.

## Context corrections

HOSTED_TRADE_2026-09-25.md, DESKTOP_WEB_2026-09-25.md and the initial HPL xStocks README contain pre-demo statements (not deployed / no funded test). Preserve their historical meaning, but do not use those sentences as the current baseline. This conversation records a successful two-account NVDAx trade; its transaction evidence has not been independently re-queried in this audit.

Browser inventory inspection failed because the CUA kernel exited. Therefore this pass makes no new authenticated screenshot or visual E2E claim. Next execution step: status freshness and bounded hosted-checkout loading, followed by desktop handoff and lifecycle coverage.

## First implementation patch - 26 September 2026

Implemented locally in the two current worktrees:
- Down/up disclosure chevrons replace the browser triangle on Trade terms and hosted checkout details. Native details keyboard interaction remains intact. Component preview at the provider's output/playwright/trade-disclosure-preview.png was visually inspected; this is not an authenticated production screenshot.
- Hosted request deadline covers token acquisition, fetch and JSON decode; aborts on session unmount. Hidden tabs skip background reads, visible/focused checkout refreshes quietly, and concurrent reads coalesce. Manual retry appears after failure, not on every healthy checkout.
- Provider GET with reconcile=true performs a project-scoped read-only confirmed-chain observation. It reuses the existing planner with the accepted customer wallet and no operation. Monotonic observation persistence, missing-escrow protection and paused recovery remain enforced. Concurrent project reads coalesce. No signing data or new signing authority is returned.
- HPS requests reconciliation and rejects an older provider reply lacking the observation envelope. Pending chain reads are labelled, not presented as a newly confirmed result. Deploy provider first, then HPS; changes are not yet deployed.

Validation: HPS TypeScript and hosted route/proxy/interaction tests passed. Provider focused API TypeScript, hosted UI (including quiet refresh, visibility and deduplication), read-only Trade status/isolation/concurrency, deadlines, existing API regression, wallet selection, hosted adapter and pinned planner tests passed. No contract edits.

The full provider UI TypeScript check is still being tracked separately. Authenticated browser review could not run: CUA kernel startup fails with a Windows sandbox token error. No new live financial test or deployment has occurred.

Remaining after this patch: contextual checkout return, broader recovery UX, listing availability/completion lifecycle integration, authenticated desktop geometry review and the controlled two-account lifecycle matrix. This patch closes status read freshness, not the entire Trade completion scope.

Full provider UI TypeScript check: stopped after more than seven minutes without completion or diagnostic output. This is incomplete validation, not a pass. Focused API TypeScript and all listed targeted suites passed; production release remains pending.

## Checkout return and release verification

Added a first-party Return to trade link to the matching conversation. Only the exact Hash PayStream HTTPS Trade route with a valid conversation ID is allowed; credentials, fragments, extra fields and payment-success query hints are rejected. This navigation does not determine payment status.

The focused provider UI TypeScript graph and production Vite build passed. The separate full-provider TypeScript run remains incomplete. Provider live revision ed2c95555 contains newer support updates; the Trade files and package dependencies match the audited base. Preserve that revision when integrating. Existing Playwright sessions opened blank; authenticated desktop verification is still outstanding. No new financial transaction was performed.

## My listings layout

Reused Browse's ItemArt, thumbnail sizing, price alignment and responsive list grid for published listings and drafts. Native expandable rows reveal existing edit/sold/remove actions; sold items still omit edit/sold actions and existing destructive confirmations remain. No listing data or action handlers changed. TypeScript, the production build and listing validation passed. Rendered current JSX with synthetic active/sold listings and inspected desktop and narrow-screen previews, including the expanded actions. These previews do not establish a new production payment test. Live sign-in was restored and the existing My listings page was inspected. This UI change is local and awaits the coordinated Trade deployment.
