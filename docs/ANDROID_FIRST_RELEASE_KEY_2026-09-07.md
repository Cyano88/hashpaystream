# First Android release key and candidate 1.0.12

The user authorized creating the first release key on 2026-09-07. This supersedes the earlier key-unavailable release-preflight result. No private key or password is stored in this repository.

## Signing identity

- Alias: `hashpaystream-release`; PKCS12, RSA 3072, SHA256withRSA, validity 10000 days.
- Certificate SHA-256: `402b168adfbff8ae5be5b188895d732fe62f29dbf4f8ceda34f25ee2c4c777d4`.
- Private material is in the operator's `.hashpaystream/signing` directory outside all project checkouts. Directory ACL restricts access to the current Windows user and SYSTEM.
- The generated password is protected with Windows DPAPI. It is not a portable backup. The private folder contains an interactive `Export-ReleaseKeyBackup.ps1` helper and instructions; an independently retained encrypted backup and password are still required before public distribution.

## Built and verified

- Package `app.hashpaystream`, version name `1.0.12`, version code `13`, min SDK 24, target SDK 36.
- Public VITE configuration was used for the web build. Server secrets were not passed into the client build.
- Web build and Capacitor sync passed.
- Gradle `assembleRelease bundleRelease testReleaseUnitTest lintRelease --no-daemon`: successful. The existing unit-test suite contains one test, with zero failures/errors; it is not release runtime coverage. App lint: zero errors, 29 warnings.
- APK `apksigner verify --verbose --print-certs`: passed, v2 signature, matching certificate above.
- AAB `jarsigner -verify`: reports `jar verified`; certificate matches above. It also warns about the self-signed certificate, missing timestamp, unsigned ZIP attributes, and streaming JAR manifest order. This is recorded rather than described as warning-free verification. The bundle has no duplicate ZIP entries. Google bundletool 1.18.3 `validate` passed.
- All 280 web build files match byte-for-byte inside both APK and AAB.
- APK manifest has no debuggable flag, `allowBackup=false`, and `usesCleartextTraffic=false`.

| Artifact | SHA-256 |
| --- | --- |
| HashPayStream-1.0.12-release.apk | `0959792ca2d7bd66255fb4718653409f0c8a54e92925375bf7659efb11d4baf7` |
| HashPayStream-1.0.12-release.aab | `af596b7c1f89408f7132c6a316b6cb91d0bc50697276f619fbef54079c059ba2` |

## Remaining release checks

The certificate comparison against the existing 1.0.11 debug APK returned `directCertificateMatch=false`. The Pixel debug app was not uninstalled, replaced, or cleared. No emulator is installed. A clean-device release installation and login/Trade runtime check remain pending; do not treat earlier debug runtime tests as signed-release runtime verification. No Play Console publication was performed.

The desktop release folder contains only distributable APK/AAB, public certificate, checksums, and instructions. Keep the private key and password separate. Preserve this signing identity for future direct APK updates. Decide Play App Signing setup explicitly before publishing to Google Play.

References: [Android app signing](https://developer.android.com/studio/publish/app-signing), [bundletool](https://developer.android.com/tools/bundletool), and [Java 21 JarInputStream manifest handling](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/jar/JarInputStream.html).

## Backup and clean installation follow-up

The operator confirmed saving the signing password separately, then requested the encrypted key backup in a new folder on the Pixel. The PKCS12 copy was opened locally and its private-key entry and release certificate verified. The encrypted key, public certificate, instructions and checksums were copied to Downloads/HashPayStream-Key-Backup-20260907 on the Pixel. Device-side SHA-256 matched the original key and certificate. No password or DPAPI credential file was transferred. The operator confirmed seeing the folder. This completes the independent device-copy step; manual password-manager recovery was not independently exercised.

A clean Android 15 emulator was installed using Google's command-line tools, emulator 37.1.11 and API 35 Google APIs x86_64 revision 9. Tool archive SHA-256 matched Google's published value. The 1,738,815,903-byte system image matched repository SHA-1 0103e6dab21290c4b9d16550a3ce99476f884eef. Windows Hypervisor Platform passed the acceleration check. The SDK manager stalled on the image, so the official archive was downloaded directly and verified before extraction.

On the isolated HashPayStream_Release_API35 emulator (emulator-5556), package enumeration confirmed no existing app installation. The exact release-folder APK installed successfully. Android reports version 1.0.12 / code 13 without DEBUGGABLE. The sign-in screen rendered; a warm HTTPS Trade intent opened the live Trade UI with the empty feed; My listings displayed the sign-in gate; hardware Back returned to Browse. Screenshots and UI evidence are in ignored output/playwright files. No AndroidRuntime error appeared in the sampled emulator log. The physical Pixel app was not replaced or cleared.

Authenticated signed-release tests remain pending user login. After a full emulator reboot, the installed app remained present and a cold launch rendered the sign-in screen again, verified by screenshot. The visible emulator window is ready for user login. No public release or Play upload was performed.

## Authenticated signed-release test: session restoration blocker

The operator completed email sign-in in the emulator. The signed app then exposed authenticated Trade navigation and loaded the private My listings screen with zero published items and zero local drafts. A synthetic local draft named TEST release draft 1.0.12 was created with price 100 NGN, city Lagos, size M, a clearly labelled test description, and the existing synthetic test image selected through Android's photo picker. The app confirmed: Draft saved on this device. It is not published. No listing was published and no message or payment was sent.

During entry, bottom navigation was absent with the keyboard open and returned after Back dismissed the keyboard. Form values remained intact, and photo selection returned successfully to the signed app.

After force-stopping and cold-starting only the emulator app, opening Trade and My listings returned the sign-in gate. Waiting for startup to settle did not restore authenticated navigation. Draft persistence cannot yet be judged because the original account is signed out. This is a release blocker pending reproduction and diagnosis, not a claimed data-loss result. The visible emulator was returned to the enlarged sign-in flow and a second login was requested. The emulator clock matches the PC's UTC time. No app data was cleared, no authentication storage or token contents were inspected, and no speculative authentication fix was applied.

The synthetic local draft must be checked and removed after the same account signs in again. Authenticated enquiries, session persistence, connection recovery and the remaining two-account checks are not marked passed by this run.

## Session persistence diagnostic follow-up

A second successful login recovered the synthetic local draft in the same account. Draft persistence therefore passed this restart check; cleanup remains pending while signed out. Session loss reproduced after backgrounding the app before force-stop.

Temporary diagnostic APKs were installed only on emulator-5556. They log fixed event labels, authentication readiness booleans, and a custom non-sensitive localStorage marker. No authentication storage values, cookies, tokens, or request bodies were inspected. The original desktop APK/AAB and physical Pixel app remain unchanged.

The marker was absent on repeated cold launches, including an inline check before application module imports. The origin remained https://hashpaystream.app. Enabling the legacy WebView database setting did not resolve this and was removed. The same loss reproduced on the original Google WebView 124.0.6367.219 and official AOSP WebView 128.0.6613.88 (APK Git blob SHA-1 fcd919744aaba4ff5f9d30701e0f1e135cbf0ad6). This does not establish a specific WebView defect or a production fix. Filesystem metadata confirms that the app's localStorage LevelDB directory exists with app ownership and non-empty files; contents were not read.

The diagnostic fetch wrapper may miss SDK requests whose fetch reference was captured during module initialization; absence of refresh labels is not proof that no refresh was attempted. Immediate marker read-after-write and delayed checks are the next diagnostic step. Temporary instrumentation must be removed before preparing any distributable build. Public testing remains blocked by session restoration.

The marker passed immediate read-after-write and a 15-second check, but was absent after both force-stop and background-process termination. A minimal page with no app or authentication imports reproduced the loss in the existing profile. The same minimal APK under a separate application ID, app.hashpaystream.storageaudit, retained the marker across restart on the same emulator.

With only the original emulator app stopped, its localStorage LevelDB directory was moved intact to /data/user/0/app.hashpaystream/local-storage-audit-backup. This is a reversible diagnostic preservation step, not a production migration. No database entries were inspected. IndexedDB was not moved or cleared. The minimal page then retained the marker across restart in the original application ID with a newly created localStorage database.

The original Google WebView 124 provider was restored. After one launch on that provider, the full diagnostic app retained the marker on its next cold launch (08:29:30 UTC, PID 8176: early_present and storage_present). This narrows the reproduced failure to the existing emulator localStorage profile, but the underlying cause of that profile's failure remains unconfirmed. A repaired test profile is not evidence that authenticated session persistence now passes.

Temporary tracked/untracked source instrumentation was preserved under ignored output/playwright/session-diagnostic-source and removed from production source. The original desktop signed APK was reinstalled with install -r, preserving emulator app data. A new authenticated restart check and draft cleanup remain pending user sign-in. Intermediate ignored build outputs are diagnostic artifacts and must not be distributed; a future release must use the normal full web sync and release build.

The separate marker-only test app was uninstalled after verification and emulator adbd was returned to non-root. The original release is at the email verification screen in the enlarged emulator. The requested recipient was verified without exposing any login code. Only this audit document differs in tracked source.

## Authenticated restart verification after profile recovery

The operator completed email verification on the restored original signed 1.0.12 APK. Authenticated Trade and private My listings were available. The earlier synthetic draft was no longer listed (zero drafts) after the prior storage/provider diagnostics. Therefore those diagnostics cannot be described as preserving the earlier draft end-to-end; the specific cause of its disappearance was not established. The earlier recovery observation remains valid only for its original test point.

On this run, the original signed app retained authenticated Trade access after force-stop and cold launch without another login. A fresh unpublished draft, TEST-restart-retention, was then created through the UI with synthetic description, price 100 NGN, Lagos, and the existing synthetic test image. The app displayed the local-save confirmation, and My listings showed the draft.

After a second force-stop and cold launch, authenticated My listings still showed TEST-restart-retention. The draft was deleted through the standard in-app confirmation sheet, and My listings returned to zero drafts. No listing was published and no enquiry, message, agreement or payment was created. These checks ran on the original Google WebView 124 provider, with no production-source authentication change or diagnostic APK active.

Result: the reproduced emulator session-restoration blocker no longer occurs in these two cold-launch checks after localStorage profile recovery; a fresh draft save/restart/delete cycle also passed. This is not a general storage migration fix, proof of the original profile failure's cause, an OS-reboot check, or completion of the remaining signed-release two-account/recovery tests. The preserved old localStorage directory remains only inside the isolated emulator for diagnosis. The physical Pixel app and desktop release artifacts were untouched in this run.
