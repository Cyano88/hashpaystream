# Desktop web layout - 2026-09-25

Desktop browsers at 1024px and above reuse the mobile shell, navigation, cards, lists and forms. Native Capacitor surfaces keep the mobile layout at every width. Home shows both balance cards; Trade preserves list rows in two columns from 1280px. Forms and detail screens remain width constrained. Swap and X Layer Send now participate in the same navigation shell.

Desktop and mobile reuse the exact StreamPayEmailLogin email/OTP flow. Desktop keeps the existing animated image panel on the left and email form on the right. All 20 product routes require email authentication and a ready Circle session before mounting any app navigation or screen. Restored valid Circle sessions remain supported. Privy provider identity, wallet creation, signing, sessions and API permissions are unchanged.

Light brand SVGs embed the original PNG artwork with an SVG color matrix, preserving blue while mapping white foreground to black. Dark surfaces retain the original PNG. Launch explicitly uses the dark-surface mark. Heroicons inherit the current theme; desktop inactive navigation contrast is increased.

Validation:
- Production TypeScript and Vite build passed.
- Navigation context, native lifecycle/back/keyboard, and Swap UI checks passed.
- Actual shell/nav/balance components rendered in a synthetic fixture passed overflow and navigation geometry at 320, 390, 768, 1024 and 1440px, for web and native platform attributes.
- Light/dark desktop screenshots inspected; original mobile email form and desktop Privy modal verified in browser.
- Local Privy iframe rejects localhost by its production origin policy. Full authentication must be verified on the deployed domain; no production auth settings were weakened.
- Broad standalone-surface smoke has an existing stale Savings Home expectation (Home already uses xStocks). It is not reported as passing.
- No authenticated financial E2E, listing publication or payment was performed. Two-user Trade test remains pending.

Follow-up validation: actual App and CircleWalletGate passed 140 route/state combinations (20 routes x 7 states), including pending email, signed out, Circle idle/restoring/verifying/error/ready. Circle OTP, native navigation and navigation-context checks passed.
