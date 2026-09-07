# Signed Android recovery audit - 2026-09-07

## Change and build

Version 1.0.13 / code 14 replaces native HTTP transport exception details with: Could not connect. Check your connection and try again. Server response handling, authentication, signing identity and wallet logic are unchanged. This addresses the observed Android DNS hostname/error leakage during the offline Trade check.

Full TypeScript/web build and Capacitor sync passed. Gradle assembleRelease, bundleRelease, testReleaseUnitTest and lintRelease passed (675 tasks; 4m44s). APK signature verification matched the existing release certificate SHA-256 402b168adfbff8ae5be5b188895d732fe62f29dbf4f8ceda34f25ee2c4c777d4. APK manifest reports package app.hashpaystream, version 1.0.13 / code 14, min SDK 24, target SDK 36 and no debuggable flag. AAB jarsigner verification and bundletool validation passed. All 282 packaged web assets match between APK and AAB; the temporary storage marker is absent.

Artifacts are in C:/Users/USER/Desktop/HashPayStream-1.0.13-Release.

- APK SHA-256: 9b300be39bb82b1362785ead51666fbf768cbb29ea69a6d7a01c07059b04104c
- AAB SHA-256: 1402cdd4863d2ed8030c4589fda988c4c3f524784d810d41aede641a34cd6e83

## Signed emulator runtime

Installed with adb install -r on emulator-5556. Authenticated private My listings remained available after update. With emulator Wi-Fi and mobile data disabled, Browse showed the friendly connection guidance, Retry and Unavailable, rather than a verified-empty result or raw hostname diagnostics. Re-enabling connectivity and pressing Retry restored the successful empty feed and removed the error. Connectivity was restored. No public item, message or payment was created. Physical Pixel and original 1.0.12 desktop artifacts were not changed.

## Two-account and Circle follow-up

The pre-existing browser was verified signed in as the buyer identity. My listings showed zero drafts and no previous seller draft, extending the prior real logout/account-isolation evidence. The operator supplied a separate seller identity; browser sign-out and its email verification were performed while preserving emulator buyer login.

After login, the browser displayed Opening your Circle wallet / Restoring your secure wallet session / Failed to receive deviceId. The installed Circle Web SDK source shows this exact rejection when its hidden device-id frame has not responded after ten seconds. The production web checkout calls that SDK method directly; the Android branch has different existing wallet-session code. No wallet implementation was copied between branches and no device ID was fabricated by this audit.

The request-level retry probe could not complete because the controlled browser session closed; its cause was not established. A fresh headed session was opened. A public request to Circle's device page returned HTTP 200. A temporary hidden-frame probe on the production origin then observed frame load and Circle's onFrameReady signal within a twelve-second observation window, with no failed Circle requests in that run. The probe was removed. It did not inspect device-ID values, tokens, keyshares, cookies or wallet balances. This demonstrates a working readiness signal in the fresh browser, not successful authenticated wallet restoration or the cause of the earlier failure.

Seller email verification is open again in the fresh browser. Signed-release live two-account enquiry/reply and final account-isolation checks remain pending that login. The original browser's previous synthetic seller draft cannot currently be rechecked because that browser session closed. Do not mark these gates complete or treat this build as public-beta approval.

Reference: https://developers.circle.com/sdks/user-controlled/web-sdk
