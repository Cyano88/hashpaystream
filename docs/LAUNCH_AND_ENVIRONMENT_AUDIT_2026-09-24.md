# Launch replay and environment audit - 2026-09-24

## Verified causes

1. CircleWalletProvider keys its session subtree by authenticated user/email.
   App is inside that subtree. A sign-in identity change remounts App and the
   launch hook. The hook intentionally ignored sessionStorage for native builds,
   so each remount could replay the animation. A document-lifetime committed
   launch claim now prevents replay after authentication, while a new WebView
   document can still animate on cold launch. React double initialization is
   handled by claiming in an effect rather than mutating in the initializer.
2. Android used the original blue-and-white mark while the CSS splash applied
   brightness-0/invert. Those filters were removed. Both use the existing logo.
3. The prior generic eased scale/rotate did not reproduce the supplied reference.
   The downloaded video's sampled motion now informs the mark expansion/settle
   and staggered letter overshoot. The brand/logo differ from the Spenda source;
   this is adapted motion, not a claim of pixel-identical video reproduction.
4. Render metadata confirms HASHPAYSTREAM_ARC_API_KEY, UPFRONT_ARC_API_KEY and
   AGENT_ARC_API_KEY are sandbox credentials. Circle has ARC_TESTNET app and
   test API configuration. The gateway requires hpl_test_ yet calls live
   /api/v2/agreements. HPL's live boundary rejects these with the user's exact
   error. A read-only probe returned 502 during this audit and did not provide
   independent successful route verification. No secrets were printed.

## Boundaries

No key rotation, testnet-to-mainnet migration, fund movement or backend deployment
was performed. Do not suppress the error, weaken live-route key checks, or label
these configured testnet wallets as mainnet. A production migration still needs
verified live project credentials, Circle environment and gateway compatibility.
The displayed balance alone does not establish mainnet funds.

## Checks

App TypeScript passes. Browser fixture runs actual App, splash hook and wallet
access UI with synthetic providers: one startup sequence, OTP success followed
by a keyed App remount without replay, and no CSS filter on the mark.
Candidate 1.0.35 / code 36 is the corrective Android build for the existing
app.hashpaystream.candidate package. Preserve that app's data with install -r;
do not recreate the older duplicate package.
