# Newer-source biometric candidate integration

24 September 2026.

Merged the additive hosted account bridge and native biometric session changes from integration commits `6b582e6` and `28fc643` into the newer `hashpaystream-production-20260907` working source based on `f4d61ca`.

Preserved existing xStocks work, updated logo and navigation. Original Account and package files were backed up under `.audit-tools/hashpaystream-biometric-reconcile-20260924`; a hash manifest verifies the remaining preexisting modified and untracked files. No stash, reset or broad replacement was used. Existing user work remains uncommitted.

The Android candidate uses application ID `app.hashpaystream.candidate`, version code 33, version name `1.0.32-candidate`. The connected Pixel's installed main app was version code 32 / 1.0.31 at the start. Candidate installation must remain separate and must not clear either app's data.

Build uses an explicit allowlist of public VITE configuration read from the current Hash PayStream Render service, held in the build process only. No server keys are injected into the frontend. The legacy Android guard was corrected to require stock Early Pay disabled. This does not activate hosted wallet APIs or migrate Circle configuration to mainnet.

Passed: full TypeScript, biometric vault tests, hosted account bridge tests, existing Circle wallet tests, Android readiness and account isolation, receipt sharing, native navigation, newer Work xStocks API/UI tests, and a synthetic test across both real Hash PayLink/Hash PayStream handoff handlers.

Device validation requires the user: sign into the candidate, complete Circle verification if requested, enable fingerprint/face unlock under Account, fully close and relaunch the candidate, and verify device unlock restores the wallet. Cancel one unlock attempt and ensure the app remains locked. Use explicit Verify wallet again only for recovery. Do not initiate a payment as part of this biometric test.

The main app's session is not shared with the candidate. A separate browser checkout still cannot read the candidate's native secure storage. Real hosted-wallet single-login migration remains separate work.

## Installed candidate

APK build succeeded and package metadata was verified before installation. Installed and launched on the connected Pixel 10 Pro as `app.hashpaystream.candidate`, version code 33 / `1.0.32-candidate`. The main app remains `app.hashpaystream`, version code 32 / `1.0.31`.

APK SHA-256: `11C95621AE234EA3CAA8F9A22B0F51F8C135A75ECD59D64463019D7B90C0C6ED`.

Physical biometric enrollment/relaunch confirmation is pending the user's response. No production deployment, mainnet activation or real payment test was performed.
