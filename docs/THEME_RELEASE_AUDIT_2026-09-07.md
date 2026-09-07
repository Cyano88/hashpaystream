# Theme release audit - 2026-09-07

Release target: Android 1.0.14 (code 15), branch feat/trade-marketplace-preview.

The launch surface keeps the existing #06070a background and original HashPayStream mark. Privy email/OTP and Circle recovery surfaces stay light. Privy configuration and all Circle SDK constructors explicitly use the light palette. Account offers System, Light and Dark; only explicit preference changes are persisted. OS changes update System mode without overwriting it. Mounted launch/auth surfaces temporarily override the root theme and system bars, then restore the app preference. Legacy Android status-bar backgrounds also follow launch, auth and app surfaces; regression checks cover each colour. Native launch resources include an API-27 navigation bar override while retaining minimum API 24 compatibility.

## Verified in a real Chromium browser

An ignored local fixture imports the actual ThemeProvider, email login, Circle gate, splash and receipt renderer. Auth and wallet network calls are mocked with synthetic data. React StrictMode is enabled.

- System dark -> system light updates immediately and does not write hp_theme.
- Explicit Dark survives the OS being Light.
- Email sign-in and its OTP portal are light while the saved preference remains Dark.
- Circle recovery is light while the saved preference remains Dark.
- Launch is dark; removing it restores the app preference.
- Selecting System and reloading retains System.
- Light/dark receipt images are byte-identical; each PDF embeds the exact same receipt JPEG.
- Screenshots inspected: theme-email.png, theme-otp.png, theme-circle.png, theme-launch.png under output/playwright.

The fixture does not verify the live hosted Circle confirmation iframe or complete a real email login. No real email was sent.

## Checks

TypeScript and Vite production build passed. Payment receipt and native receipt sharing smoke tests passed. Android readiness, account isolation, navigation and Circle wallet/session smoke tests passed. The navigation fixture was updated for the existing cancelable back event and now verifies overlay consumption. Native assembleRelease, bundleRelease, testReleaseUnitTest and lintRelease passed after moving the navigation bar setting to values-v27. Final packaged release and Pixel results are recorded below.

Existing saved Light/Dark values are preserved: the previous implementation did not distinguish an explicit selection from a saved resolved System value, so existing users can select System in Account.
## Standard signed package

Final production rebuild and native assembleRelease, bundleRelease, testReleaseUnitTest and lintRelease passed. APK signature, package app.hashpaystream, version 1.0.14/code 15, minimum SDK 24 and target SDK 36 were inspected. Bundletool validation passed.

Desktop directory: C:/Users/USER/Desktop/HashPayStream-1.0.14-Release.

- APK SHA-256: 84bc3ed8a528c1d63e7ba876409d3dd5bab7818652dac263479d7e01673a6a57
- AAB SHA-256: bd6c3169de461be12c74896c4441f3383fd2615ef27e633561fb4e900aca3241
- Release certificate SHA-256: 402b168adfbff8ae5be5b188895d732fe62f29dbf4f8ceda34f25ee2c4c777d4

No Google Play upload was performed. This release branch has not been merged wholesale into production main.

## Immediate launch follow-up

User requested a dark rounded Android icon, an immediate logo before CSS, and one installed app. The adaptive icon background now uses #06070a. A native vector draws the existing ring/dot mark in the original PNG's measured #3B82F6. Initial HTML embeds the original PNG with inline styling, and session loading shows the brand instead of only a small dot. React's first committed screen calls SplashScreen.hide with a short fade; Android retains a 12-second automatic fallback. Boot-time system bar calls preserve the native dark style until React selects a surface.

Chromium with the main JavaScript request deliberately blocked showed HashPayStream, a fully loaded embedded logo and rgb(6, 7, 10) background. Screenshot theme-before-js.png was inspected.

Installed versions before consolidation were original app.hashpaystream 1.0.11/code 12 and app.hashpaystream.releaseaudit 1.0.14/code 15. Android rejected an in-place update because the original 1.0.11 signing certificate differed from the release certificate. Following the user request to remove the old app, it was uninstalled and replaced with the signed 1.0.14 release; this resets local app data and requires sign-in. The duplicate test package was then uninstalled. Package inventory confirms only app.hashpaystream remains.


## Single CSS transition

The root splash previously completed before rendering page content. The sign-in page then mounted its own native-enabled splash hook and started a second animation. Removed splash hooks from all page-level sign-in consumers and removed the duplicate animated overlay from AgreementSignInLanding. App.tsx is now the only hook caller; the destination screen renders under its overlay before the fade completes. TypeScript and Android readiness/navigation/account-isolation/receipt-share checks passed. The final signed build was installed and replayed on the Pixel.


## Scrollbars and calmer timing

Hidden CSS scroll tracks globally and disabled Android WebView horizontal/vertical scroll indicators. Scrolling remains enabled outside the launch surface, which is temporarily locked. A real Chromium wheel test moved a scroll container to scrollTop 300 while computed scrollbar-width and WebKit scrollbar display were both none; overflow remained auto.

The single splash now keeps its mark visible from its first frame, reveals the wordmark over 850 ms using only transform and opacity, holds it for 450 ms, and switches directly to sign-in with no dark overlay fade. Fixed logo/text widths avoid per-frame layout changes. Total normal CSS sequence is approximately 1650 ms. Reduced-motion users skip assembly. The lifecycle regression now asserts each distinct phase, including holding before launching. The splash remains fully opaque until it unmounts; the light auth surface is restored by the existing layout-effect theme cleanup before paint.


## Final Pixel verification

The final signed 1.0.14/code 15 release is installed as app.hashpaystream. Package inventory shows no duplicate HashPayStream package. Native build, unit tests, lint, APK signature and AAB validation passed. A bounded cold-launch recording shows the branded splash followed by the light email form, which remains light at 4 and 6.5 seconds. A background sample at 30 fps changes directly from dark to light at 2.27 seconds, with zero intermediate-tint frames and no second dark transition in the captured interval. This is a bounded visual check, not a universal device frame-rate guarantee. No real email login was sent during this audit.
