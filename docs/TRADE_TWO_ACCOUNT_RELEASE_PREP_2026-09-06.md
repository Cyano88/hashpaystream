# Two-account beta test and signed-release preparation - 2026-09-06

Status: core live two-account checks completed on browser seller and Pixel buyer; remaining cases and signed release are pending.

## Live follow-up evidence (2026-09-06, completed 22:09 WAT)

- Browser seller signed in to the main Render service; the connected Pixel ran Android 1.0.11. A successful buyer enquiry against the browser-created listing verified distinct accounts without reading authentication storage.
- Published TEST - Not for sale - beta check with a synthetic photo and explicit no-purchase description. Public API returned the active listing at revision 1; no owner identity was exposed. The item persisted after browser reload.
- Pixel search found the item. Buyer details showed Ask seller and Report listing without seller management controls. The initial cached empty Browse screen did not discover the new item until a new search query; automatic idle-feed refresh was not verified.
- Buyer message arrived in the browser; seller reply appeared on the Pixel after refresh. Only synthetic messages were sent. Duplicate retries were not exercised in this live run.
- Seller block showed Messaging is blocked on both devices and removed both composers. Seller unblock restored the Pixel composer after refresh. Opposite-party unblock and forced blocked writes remain covered only by earlier backend tests.
- A conversation report using Other was accepted with explicit TEST ONLY / no misconduct text. The UI disclosed listing and up to 20 messages as evidence. Neither test account exposed a reviewer control; administrator review, stored evidence inspection and report dismissal were not completed.
- Pixel keyboard open state was confirmed by Android input-method state; bottom app navigation was absent while typing and returned after dismissal. Full native restart/back coverage remains pending.
- Removed the test listing through the seller UI. Fresh public feed returned 200 with the test item absent; its exact photo URL returned 404. Pixel conversation refresh removed the composer after listing removal. Synthetic conversation/report records were retained; no database rows were deleted directly.
- Browser console capture contained Privy's standard self-XSS warning logs, with no application error entries in that capture.

Remaining live gates: administrator moderation and report cleanup, controlled network recovery, account switch/logout isolation, retry idempotency, and full native lifecycle checks. Signed release still needs the existing signing configuration; this run created no keys and built or installed no APK.

## Follow-up: network recovery and confirmation sheets

- A live browser offline check found that an already-live empty Browse showed No matching items and 0 items alongside Failed to fetch. Fixed pending/error rendering while retaining loaded items. Regression checks cover delayed search, failure, retry to a verified empty response, and retained items on failed refresh.
- Pixel force-stop/relaunch retained authentication. Trade reopened and the existing removed-item enquiry remained in its list.
- Correction to the earlier reviewer observation: Review reports is on the Pixel enquiry list. The authorized reviewer opened the synthetic report and verified the listing description and both messages after public listing removal. The earlier absence inside a conversation did not establish lack of moderator access.
- Replaced all four Trade window.confirm call sites (sold/remove, draft deletion, block/unblock, hide/dismiss) with the shared StreamConfirmSheet. Styling follows SavingsDepositSheet: rounded bottom sheet, matching light/dark surfaces and compact pill buttons.
- Browser checks passed for focus containment/restoration, inert background/restoration, Cancel, Escape, backdrop dismissal, native Back event and one accepted action on duplicate clicks. Light/dark screenshots captured locally.
- Pixel verified the new Dismiss report sheet, Android hardware Back returning to the same report without submitting, then explicit sheet confirmation removing the synthetic report from the queue. No native confirmation remained. Evidence records are retained; public listing/photo remain removed.
- Production web build passed; Render deployment dep-daett63bc2fs73cn2rag is live at 4778ee8. Android source commit 34a39d6 additionally handles native Back before route navigation.
- Android web sync, assembly, unit tests and lint passed. Installed with adb install -r, retaining login. APK remains debug version 1.0.11 / code 12.
- Desktop APK: C:/Users/USER/Desktop/HashPayStream-1.0.11-Trade-Sheets.apk
- SHA256: 5f15e19e48bcd8c0ecfa6a61df9f94645e79d8dbc8cf8ad24a60e78aa23e0178

Remaining release gates: original signing configuration, full account switch/logout and retry-idempotency live checks, moderator hide action on an active synthetic item, backup/restore drill and operational procedures. No release key was created or replaced.

## Recovery drill follow-up

The isolated PostgreSQL 18 logical backup/restore passed for all five Trade tables, full row/evidence content, indexes and constraints. Source remained read-only; the temporary local server and data copy were removed. See TRADE_RECOVERY_DRILL_2026-09-06.md for measured durations and limitations. Backup scheduling/retention and disaster cutover remain operational work.

## Live retry and active moderation follow-up

- Published a second clearly labelled synthetic listing for the existing browser seller and Pixel buyer. Pixel opened its enquiry. No real purchase or payment occurred.
- For one browser message POST, Playwright forwarded the request to the real service and dropped its response. The browser showed Failed to fetch and retained the message text; the Pixel already displayed the message. Removed the interception and retried through Send message. The composer cleared and both devices showed a single entry.
- Independent read-only database verification confirmed exactly one message for that listing after the retry. The injected browser network error was expected.
- Submitted an Other report labelled TEST ONLY / no misconduct. Pixel reviewer opened it and used the Pocket-style Hide listing sheet while the item was still active.
- Public feed returned 200 without the item; its exact public photo URL returned 404. The report left the queue. Read-only database verification confirmed listing status removed and report status resolved / decision hide. Synthetic messages and evidence remain retained.
- Extended the isolated browser fixture to change authentication state without page reload: account A to B, logout, then back to A. Drafts and saved items did not cross accounts and reappeared for A. Mobile overflow and runtime-error checks passed. Authentication was simulated in this fixture; this does not claim real Privy logout/login-switch coverage.
- Restricted Trade database role still has no membership in the production financial role. No database writes were made by the audit verifier.
- No code or APK changed in this follow-up.

Remaining: real authentication-switch test, original Android release signing configuration, backup schedule/retention, monitoring destination and operating procedures.

## September 7 login follow-up

Real browser logout hid private seller listings and the labelled local draft. The browser login UI is open for the Pixel account; real second-account login and seller draft cleanup remain pending. A stale My listings re-entry bug was fixed, tested, deployed to web and installed on Android. See TRADE_LOGIN_REFRESH_AUDIT_2026-09-07.md.

## Earlier preparation evidence (superseded where noted above)

- `adb devices` returned no connected devices on two checks.
- The standard Android folder contains debug.keystore. No .jks or .keystore files were found at the Desktop top level, and no .jks files were found at the release-records top level. These narrow checks do not establish that an original release key is absent elsewhere.
- The release preflight reports all four required signing variables missing from its process. Browser inventory failed twice; the second failure identified a Windows sandbox launch error. No second signed-in test account was verified.
- Added `scripts/android-release-preflight.mjs`. It reads the selected keystore certificate using a password environment-variable reference, never a password command argument. An optional reference APK comparison identifies a direct certificate match. It never generates or replaces keys, signs an APK, installs or uninstalls an app.
- Syntax and failure-path checks passed: missing configuration exits with a blocker, a missing keystore fails closed, and synthetic password values are absent from output. Successful keystore verification and certificate comparison remain untested until the original key is supplied locally. The actual release build must validate the private-key password.

## Run after local signing configuration is available

`node scripts/android-release-preflight.mjs --reference-apk <path-to-an-existing-distributed-apk>`

Required existing environment variables: HASHPAYSTREAM_UPLOAD_STORE_FILE, HASHPAYSTREAM_UPLOAD_STORE_PASSWORD, HASHPAYSTREAM_UPLOAD_KEY_ALIAS, HASHPAYSTREAM_UPLOAD_KEY_PASSWORD. Keep passwords in the local build environment; do not paste them into chat or commit them. Relative keystore paths resolve from android/app, matching Gradle.

An existing debug APK normally differs from a production certificate. A mismatch requires an explicit update/signing-lineage decision or a separate clean test device, not uninstalling the current app to bypass the check. Do not promise update continuity from an upload certificate alone when Play App Signing or key rotation is involved.

After preflight: load the verified public build configuration, build the signed APK/AAB with the original signing setup, verify its certificate and non-debuggable manifest, then verify install/update behavior on the designated test device. Current installed pilot remains Android 1.0.11; this task did not build or install another APK.

## Full physical test matrix (partial coverage above)

Use two designated test identities and clearly labelled test items. Do not message real sellers or buyers.

| Case | Required evidence |
| --- | --- |
| Seller publication | Labelled item and photo persist after app restart; listing revision and visibility are correct. |
| Buyer discovery | Separate account finds the item; buyer cannot edit, mark sold or remove it. |
| Enquiry and reply | Both accounts receive the appropriate message; retries do not duplicate it. |
| Block/unblock | New messages are denied in both directions; only the blocking account can remove its block. |
| Report/moderation | Report includes the disclosed evidence; non-admin cannot review it; authorized reviewer can hide the test item. |
| Network loss/recovery | Pending/failed data is never labelled as empty; retries recover without duplicate writes or layout resets. |
| Account switch/logout | No prior account drafts, saved state, messages or private listings appear under the other identity. |
| Native lifecycle | Back, restart, keyboard open/close and foreground recovery preserve the expected view and navigation. |
| Cleanup | Remove labelled test listing and any test photo; document retained moderation evidence under the agreed policy. |

Hosting consolidation is already complete. Checkout remains disabled. Backup restore, moderation operations and the broader beta release gates remain listed in TRADE_BETA_READINESS_2026-09-06.md.
