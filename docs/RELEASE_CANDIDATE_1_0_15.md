# Candidate 1.0.15 (Android code 16)

Purpose: consolidate already-approved app fixes and restore reviewed contract source provenance for release verification. No new product features.

Existing changes included: native session/navigation and receipt sharing; dark launch, light authentication and system/user app theme; light external receipts; savings deposit authorization refresh safety; refund receipt correctness. Production backend and Trade readiness remain at live main.

Validation completed: full application smoke, production web build, native static readiness, receipt sharing, account isolation, navigation, and frozen combined contract harness (42 tests). Signing certificate matches the installed release lineage. Signed APK/AAB, release lint/unit tests and basic Pixel Home/Trade verification passed. See PRODUCTION_CANDIDATE_VERIFICATION_2026-09-07.md for evidence and limitations.

Release decision: NO-GO for full financial production. Configured escrow/router match legacy executable artifacts, not hardened V2/V4; the router is on Arc testnet. Savings remains disabled. Recovery cutover and observed alert delivery remain external operational checks. Local tests and a signed installer do not close these gates.

Rollback: production main has not been changed by this candidate. Any later web deployment must record the exact Render deploy and retain a rollback to a8e6efb. Keep the original 1.0.14 APK/AAB and certificate record. Android version codes must increase for a normal update; do not uninstall or clear user data to force a downgrade. If rollback is needed after installing this candidate, rebuild the prior approved app source with a higher version code and the same signing key.

Next action after candidate verification: resolve the reviewed-contract deployment/network and integration plan, then obtain the specific authorization needed for any financial deployment or operational test. Do not reopen feature work.
