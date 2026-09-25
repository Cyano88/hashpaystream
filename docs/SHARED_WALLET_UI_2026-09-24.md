# Shared wallet UI and single Pixel installation - 2026-09-24

## Installed

Pixel 10 Pro now has only app.hashpaystream.candidate, versionCode 35,
versionName 1.0.34-candidate, label Hash PayStream Candidate.
The user explicitly requested removal of the duplicate. The older
app.hashpaystream 1.0.31 package was uninstalled after the new install succeeded.
The candidate was updated with install -r; its data was retained.

APK SHA256: DDD71F9E7956EB5BC0A4027A9343CCEA3D2F37F950BB144FC60D1C32349E798A

## Changes

- Blank HTML boot root and unbranded React loading fallback; one animated launch.
- Wordmark is Hash PayStream, with an explicit visible word space.
- Animated mark is unmounted once the wordmark starts.
- Circle code entry waits until the launch surface exits.
- @hashpaylink/sdk/wallet replaces the local OTP UI implementation.
- Pocket and hosted Circle sign-in use the same SDK controller in the HPL source.
- Pocket's access/retry screen and Plus Jakarta Sans font assets ship in the SDK.
- Close mounts only when Circle's iframe is visible, honors native safe areas,
  and cleans up on cancel, success, timeout, resend failure, or account change.
- HPL wallet-connection create/read/redeem carry the authenticated project's
  name. HPS stores and exposes only upstream branding, ignoring request names.
  The UI uses that metadata when available, otherwise Hash PayStream.

## Verification

SDK build/types, HPS typecheck/Android build, OTP lifecycle, device registration,
Circle API/ownership/transfer checks, biometric vault tests, account bridge tests,
and a cross-repo real-handler branding/identity fixture passed.

Playwright used the actual App route, launch hook, gate and SDK module, with
synthetic Privy/Circle responses. Recorded one forward startup sequence and no
OTP-over-splash overlap; checked hidden-frame cancel suppression, 32px native
safe-area placement, cancel/retry/success cleanup and visible word spacing.
Screenshots are under output/playwright/wallet-integration.
No real OTP code or biometric unlock was entered by the agent.

## Deployment boundary

This is an installed Android candidate, not a production backend deployment or
public npm release. SDK is pinned to vendor/hashpaylink-sdk-1.1.0-candidate.2.tgz.
The HPL source is C:/Users/USER/.audit-tools/hashpaylink-arc-release-tools-20260924.
The optional hosted-account bridge remains disabled in production until configured.
The UI extraction does not migrate existing Circle accounts/sessions or change
wallet authority, network configuration, signing rights, or fund custody.
HPS still uses its existing authenticated Circle server adapter.

The whole HPL repository typecheck reports existing errors outside this change
(checkpoint recovery, legacy StreamPay/PaymentPage and Pocket controller/biometric
files). The SDK's own type/declaration build passed. No HPL deployment was made.
