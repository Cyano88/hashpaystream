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

## Live signed-release two-account follow-up

The operator completed seller login in the fresh browser; the Circle wallet gate cleared and the authenticated Home screen rendered. No wallet-code change was needed for this successful attempt. This does not establish the cause of the prior device-ID timeout.

Using distinct browser seller and signed Android 1.0.13 buyer sessions, a clearly labelled synthetic listing was published through the UI. Public API confirmed active revision 1 (listing a6587cc8-2c14-4ab4-8448-f8a891ca344a), and seller My listings retained it after a full browser reload. Android search found it. Buyer details exposed Ask seller and Report listing, without seller edit/sold/remove controls.

Android created the enquiry and sent one synthetic message. The seller received it and replied once; Android Refresh displayed the reply. After an Android force-stop/cold launch, the authenticated conversation still contained exactly one copy of each message. This verifies ordinary delivery and retention; it is not an acknowledgement-loss retry/idempotency experiment.

Android hardware Back cancelled the shared Block messages confirmation without submitting. Reopening and confirming the block removed the composer on both devices. The seller saw Messaging is blocked and had no Unblock control for the buyer's block. Android confirmed Unblock through the same sheet; both composers returned after refresh. No report was submitted and no payment or agreement was created.

Cleanup: seller removed the synthetic listing through the shared confirmation sheet. A bounded public API read confirmed the listing absent; its exact photo returned HTTP 404. Two synthetic messages and the removed-item conversation e9602ab5-3f93-4133-9e2d-bd5c151b97b0 remain as historical records. No database rows were deleted directly.

During the final Android removed-item check, a screenshot exposed an Android app-not-responding dialog. Therefore missing navigation in that intermediate UI dump is not evidence of logout. ActivityManager recorded a 5014ms input-dispatch focus-loss timeout at emulator time 10:02:32. The captured app main-thread stack waited in BinderProxy.transact / InputMethodManager.getInputMethodList / WebViewChromium.onWindowFocusChanged. A SelectToSpeak popup activity was listed as resumed; enabled_accessibility_services read null. These observations identify the stall location but do not establish its cause or exonerate app behavior. Sanitized main-thread evidence is in ignored output/playwright/signed-release-anr-main.txt.

The emulator was rebooted without clearing data, after returning adbd to non-root. Recovery verification is pending below. This ANR remains a release-readiness concern; do not convert the successful functional checks into an unconditional public-release approval.

The OS-only reboot stalled before sys.boot_completed. A sample showed emulator load around 9.6 on two configured cores, roughly 1.2 GB free guest memory, and the ranchu graphics composer as the largest CPU consumer. HashPayStream had not been launched during that boot. The emulator process was then shut down via adb emu kill and relaunched with the same AVD, software GPU, memory/CPU settings, and no snapshot; no wipe-data flag was used. This environment instability limits attribution of the ANR. Fresh-process recovery verification follows.

Fresh-process recovery completed: sys.boot_completed returned 1. Android System UI then displayed its own unresponsive dialog; choosing Wait recovered it. HashPayStream Home showed the authenticated buyer session. Trade enquiries retained the removed synthetic item; opening it displayed exactly one buyer message and one seller reply, with no message composer. Emulator adbd was verified back to uid 2000 (non-root). Public cleanup and post-reboot session/conversation recovery therefore passed, while the app/System UI ANR observations remain unresolved environment/runtime concerns. No application code changed in this follow-up. The physical Pixel app was untouched. The local UI helper now refreshes its saved XML even when an Android system dialog is foreground, avoiding stale-file interpretation in future checks.
