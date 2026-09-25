# Focused navigation and Pocket list layout — 2026-09-23

Implemented locally in the standalone HashPayStream app:
- Home, Agreements, Trade, Account navigation; requests and agreement creation keep Agreements active.
- Home actions: Send, Receive, Swap (disabled and labelled Coming soon), Savings. Existing bell retained.
- Requests and New agreement entry points inside Agreements.
- Existing early-pay and funding access moved to Account's Existing funding disclosure.
- Pocket-style compact activity and Trade item rows, thumbnails/icons, subtle dividers and right-aligned values.
- Activity filters (All, Agreements, Transfers), Today/Yesterday groups and links to the relevant agreement/request.
- Notification request links now open the exact request.

Validation:
- Production build passed (existing vendor annotation and bundle-size warnings).
- TypeScript, navigation-context, notification, Trade preview/filtering and request isolation/compose checks passed.
- Updated obsolete Home/navigation expectations in the surface smoke test. The broader test then stopped on an existing supportedChains assertion expecting VITE_HASHPAYSTREAM_STOCK_EARLY_PAY_ENABLED inside main.tsx; this UI change does not alter chain configuration.
- Playwright launched the local mobile viewport, but the app renders VITE_PRIVY_APP_ID is required. Visual QA and authenticated interaction remain unverified; no fake configuration or login bypass was added.

No deployment or live payment was performed. Pocket source was read only. Trade conversation notifications are not added by this layout change.

## Follow-up: preview and Android Candidate
- Recovered the public Privy app ID from the deployed frontend and added it to ignored .env.local.
- Updated stale supportedChains and public Work feature-flag assertions. Full standalone surface smoke now passes.
- Android readiness, account isolation, receipt sharing and native navigation smoke checks pass.
- Playwright at 390x844 exercised the real Trade component with an intercepted disabled-market response, activating the explicitly labelled sample listings. Search for trainers returned one item; tapping it opened /trade?view=browse&item=sample-trainers. This verifies UI navigation, not live market or payment execution.
- Screenshot: output/playwright/trade-pocket-list-mobile.png.
- Android build uses the verified hashpaystream Render service's VITE_* settings only. Secrets are not forwarded to the client build. Candidate package is app.hashpaystream.candidate, separate from the existing app.hashpaystream installation.
- Authenticated Home, Agreements and Activity interaction still requires signing into Candidate.

## Corrected Android update target
The first install used app.hashpaystream.candidate 1.0.27 / 28, a separate debug package. This was the wrong target for the user's requested update. The existing app.hashpaystream was verified on-device as 1.0.28 / 29; it was not replaced or cleared.

The newer Android release checkout retains version 29 and updated branding/splash files. Those branding files and splash behavior were carried into this current implementation checkout, without replacing its newer wallet/savings logic. The actual installed APK was pulled and its signing certificate verified against the existing release key: direct match. The corrected in-place update is version 1.0.29 / 30, package app.hashpaystream. Native and standalone surface checks pass after the reconciliation.

## Installation result
- Corrected signed APK metadata verified: app.hashpaystream, 1.0.29, versionCode 30.
- APK certificate matched the same release certificate verified against the installed 1.0.28 APK.
- adb install -r succeeded; launch returned Status: ok; app process remained running.
- On-device version is 1.0.29 / 30. firstInstallTime remains 2026-09-13 15:32:56; no uninstall or data-clear was performed on app.hashpaystream.
- Candidate package was already absent when cleanup was attempted; no Candidate data deletion was performed by this follow-up.
- Final signed release build, testReleaseUnitTest and lintRelease completed successfully (BUILD SUCCESSFUL). Existing Gradle deprecation warnings remain.
