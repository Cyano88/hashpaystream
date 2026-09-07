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
