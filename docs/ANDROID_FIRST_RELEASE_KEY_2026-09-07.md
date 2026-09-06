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
