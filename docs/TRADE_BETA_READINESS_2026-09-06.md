# Trade beta release readiness - 2026-09-06

Status: NOT READY for an unrestricted public release. Discovery-only beta is the next target; checkout remains unavailable.

## Current follow-up status

Trade runs on the existing paid main service; the old pilot is suspended. No extra paid service is required. Browser/Pixel publication, two-way messages, block/unblock, report evidence review and dismissal, public cleanup, keyboard behavior and restart/login persistence have been verified. Trade uses Pocket-style confirmation sheets on web and Android. See TRADE_TWO_ACCOUNT_RELEASE_PREP_2026-09-06.md for exact coverage and remaining gates.

The original signing configuration is still missing. Current installed Android 1.0.11 is a debug build. Account-switch isolation, live duplicate-retry tests and operational procedures remain release gates. The isolated logical backup/restore drill passed; see TRADE_RECOVERY_DRILL_2026-09-06.md. Scheduled backup policy and disaster cutover remain unverified.

## Historical audit snapshot (superseded by the follow-up above)

- Isolated Trade service is available on the Free compute plan. Live health/listings returned 200; anonymous enquiries/moderation returned 401; financial service-request route returned 404. Warm checks completed in approximately 0.3-1.2 seconds.
- Database host is available on paid basic_256mb PostgreSQL 18 in Oregon, without high availability. This confirms hosting configuration, not a successful recovery drill.
- One Pixel is connected. A second authenticated test account/device has not yet been identified.
- Release signing is enforced by Gradle, but all four required upload-signing variables are absent in process, User and Machine environments. This does not prove the original keystore is absent elsewhere. Do not generate a replacement or uninstall the app to bypass signature mismatch.

## Timeout defect and correction

The reported failed feed request was incorrectly described as a drafts-only screen. Unknown/error mode now preserves a Published items section with an explicit unavailable state; the header distinguishes Unavailable from Connecting. Private listings distinguish loading, successfully empty and failed states, with a dedicated retry. Existing loaded items remain visible during refresh failure.

A synthetic failure test confirmed public failure, public retry, delayed private response, private failure and private retry. No failed or pending response was presented as an empty published-items result. Cache and slow-network layout checks also passed.

## Gates before invited testers

| Gate | Status / required evidence |
| --- | --- |
| Always-on API | Complete: consolidated into the existing paid main HashPayStream service. No extra paid service. |
| Android signing/update continuity | Configure the original upload key locally, verify certificate/update path, build signed release APK/AAB. Current APK is a debug pilot. |
| Two-account device lifecycle | Core browser/Pixel flow, moderation review/dismissal and restart passed. Account switch/logout and live duplicate-retry coverage remain pending. |
| Recovery | Isolated logical restore passed: all five tables, full row/evidence content, indexes and constraints matched. Scheduling, retention and disaster cutover remain operational work. |
| Operations | Assign report reviewer, define evidence retention/deletion and account suspension procedures; verify alert destination and rollback. |
| Web/Android parity | Verify deliberate pilot routing and feature availability in each distributed client. Do not merge production main merely to publish a pilot. |
| Payment boundaries | Checkout disabled and no buyer-protection promises until the goods agreement lifecycle is implemented and audited. |

## Invited-test protocol

Start with 10-20 invited testers in one area after the gates above pass. Use clearly labelled test items until moderators and support are ready for real listings. Record app version, device/OS, network, action and sanitized failure details; never collect access tokens or payment credentials. Stop rollout for cross-account visibility, lost data, unauthorized writes, repeated unrecoverable connection failures or failed updates.

## Source references

- https://render.com/docs/free : Free web services sleep after 15 idle minutes and take about a minute to wake. This can exceed the current 20-second app request budget; it is a plausible explanation of the reported timeout, not a trace-proven attribution.
- https://render.com/docs/compute-plans : Starter maps to 0.5c-512mb; changing API compute plans requires a successful deployment.
- https://render.com/articles/render-vs-railway : Starter base compute price is $7/month. Other account usage charges are separate.

## Final audit evidence

- Local PostgreSQL listing and community smoke tests passed on the current checkout, including cross-account denial, concurrent edits, quotas, pagination, blocking and moderation. The local test database was stopped afterwards.
- Android 1.0.10 (code 11) web build, native assembly, unit tests and lint passed. Installed on the Pixel with data-preserving `adb install -r`; version independently confirmed. All 280 web files match the APK.
- APK: `C:\Users\USER\Desktop\HashPayStream-1.0.10-Trade-Pilot.apk`.
- SHA-256: `c1d9c3f7c6b7d6ed264a9aecc5d059b269d0c1175c5faa5593768ed0479e1415`.
- The phone was in WhatsApp during both availability checks. No second-account device interaction or physical UI pass is claimed. No real-user enquiries were sent during this audit.

Hosting gate superseded by the completed consolidation recorded in TRADE_CONSOLIDATION_2026-09-06.md: Trade now runs on the existing paid main service; the free pilot is suspended. No second paid server or Starter upgrade approval is needed. Android 1.0.11 uses the main endpoint.
