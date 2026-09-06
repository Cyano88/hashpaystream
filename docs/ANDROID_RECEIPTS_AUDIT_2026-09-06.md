# Android receipt pilot update - 2026-09-06

## Scope and source

The existing Android client was found in the dirty, untracked native project
at Desktop/hashpaystream. Its files were copied into an isolated worktree on
`release/android-receipts-20260906`, based on `infra/financial-core-phase1`.
The original worktree was preserved. Generated assets, build directories,
local SDK settings, screenshots and signing keys are excluded from source.

This packages the nine previously verified receipt UI/PDF changes together
with the existing native navigation, login, transport and session persistence.
The app still uses the existing production API. Staging receipt ingestion and
its authenticated reader are not promoted to production or embedded in the APK.

The connected Pixel contained app.hashpaystream debug version 1 (1.0). This
update uses versionCode 2 / versionName 1.0.1 with the same application ID.
Release signing environment variables are absent. The existing production
release audit failed its broader infrastructure/contract review gates; this
is a device-installed debug pilot, not a Play Store or public production release.

## Corrections from this audit

- Account and agreement state now hides data immediately on an identity change
  and rejects late prior-account responses. React regression tests cover account
  switches, late responses and logout with synthetic authentication and data.
- Balance failure messages removed from the unfinished client were restored.
- Funding, savings and X Layer send retain their previous wallet boundaries;
  they do not require the Circle gate added by the unfinished native draft.
- PDF and image receipt sharing now writes a temporary native cache file and
  opens Android's share sheet. The file provider exposes only receipt-exports,
  with no broad external/private-file access. Old cache exports are cleaned on
  later shares. No destination is selected and no receipt is sent by this audit.
- Cosmetic web-layout/loading assertions were updated for the existing native
  UI. Authentication, wallet boundaries, disabled savings and error visibility
  assertions remain enforced.

Native storage uses the existing encrypted device credential plugin. Backup
and device-transfer exclusions, HTTPS-only traffic and release-signing guards
remain present. Public build configuration is fetched from the verified Render
service into process memory; server credentials are not forwarded to the build.

## Verification

Node 22 is used for compilation and the full application smoke suite. Native
share tests cover exact bytes, cache-only paths, cleanup boundaries, browser
fallback and failure propagation. Android readiness and account isolation tests
passed. The initial APK build, Android unit tests and lint passed; final artifact
and device results are recorded below after the corrected rebuild.

The runtime dependency audit reported 20 moderate findings and no high or
critical findings. Direct affected packages include Privy React auth and
Express; no forced wallet SDK upgrades were performed. This audit does not
claim those advisories are remediated.

Implementation references: https://capacitorjs.com/docs/apis/share and
https://capacitorjs.com/docs/apis/filesystem (Capacitor v8).


## Final artifact checks

The final Node 22 build, full application smoke suite, Android unit tests and
lint completed successfully. Lint reported 29 warnings and no errors. All 280
packaged web assets matched the built dist files byte-for-byte. The APK contains
no environment or keystore files.

APK SHA-256: `1aedf386d81ebf50e517270b283eafff2ed316dfa02db0ca47630d9af59d1cd7`

Size: 15502344 bytes. The signing certificate matches the installed
debug app. Device installation and runtime checks follow.

## Device outcome

Both app instrumentation tests passed on the connected Pixel 10 Pro using
:app:connectedDebugAndroidTest. The receipt provider returned exact synthetic
PDF bytes and refused private files outside the export cache. The broader
all-module command failed in generated Cordova plugin test dependencies due to
conflicting Kotlin standard-library versions; that dependency test issue remains.

Gradle instrumentation cleanup removed the target package. Version 2 / 1.0.1
was reinstalled afterward and launched successfully. The device UI confirms
the sign-in screen, so the local session was reset and the user must sign in
again. No payment, signing, transfer or receipt delivery was performed.
Authenticated end-to-end receipt sharing remains unverified.
