# Checkout progress audit - 2026-09-28

Scope: active Hash PayStream web Trade handoff, Hash PayLink hosted stock Trade/work checkout, and older native Trade/work recovery UI. No financial transaction was submitted during verification.

Progress belongs in a disabled primary button, with an accessible status label. Hosted checkout hides competing actions during busy, local pending, provider pending and failed status verification. Final lifecycle states remain explicit; actionable pre-funding status copy no longer repeats the CTA. Recovery stays available for uncertain transactions and does not resend automatically.

Hash PayStream release 54c54b1 is live (dep-dasr7mjbc2fs73did1u0). Hash PayLink release e0444947b is live (dep-dasr9irtqb8s73a3dp50). Latest upstream production changes were merged and preserved before the shared checkout release.

Checks passed: Hash PayStream typecheck; Trade interaction, native Trade and work UI checks; hosted checkout component tests including a single disabled progress CTA, network-pending action suppression, stale status blocking, final state handling, and no duplicate seller Confirm payment terms label; focused hosted checkout TypeScript check. Vite production bundles completed with existing dependency/chunk warnings. Full Hash PayLink typecheck reports failures in unchanged legacy, Pocket and other files; the repository-wide check is not green.

Live browser verification: initial status appears as Checking payment in a disabled CTA. Seller confirmed setup renders one Confirm payment terms action, without Waiting for seller body copy. Opening first-party confirmation yields aria-busy=true and a disabled Checking payment CTA. Cancel dismissed the prompt without a wallet transaction. The real test remains awaiting seller confirmation, with 0.00222 NVDAx unchanged.

Broader scan: USDC Send and stock Send already use button-based confirmation progress. Passive waits for another participant and explanatory payment terms are not transaction progress. Swap and hosted-send navigation use loading skeletons; those are separate from signed-payment confirmation. This audit does not establish every product endpoint or financial lifecycle as production complete.
