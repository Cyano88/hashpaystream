# Candidate 1.0.16 (Android code 17)

Scope: one consolidated production-tightening candidate. No new product features.

Included since 1.0.15: explicit reviewed-contract signature support, historical fee-settlement receipt routing with owner isolation, original-network receipt links/share metadata, and guarded reviewed deployment preparation. Existing theme/auth/native/Trade fixes and the frozen reviewed contracts are retained.

The build uses current production public settings. New reviewed signature support remains inactive by default (legacy escrow signature 1 / repayment signature 3). Production backend, contracts and deposit settings are not changed by building or installing this APK.

Validation checkpoint: native readiness, account isolation, receipt share and navigation tests passed. The full smoke run passed through savings runtime, then its final surface check exposed obsolete hardcoded-version and public-environment assertions. Those assertions now check configured signature versions and allow only the added public version setting; the targeted final surface check passed under Node 22. All smoke components have therefore passed across that run and the corrected final check. Web build, signed APK/AAB, release lint/unit tests, artifact verification and device checks are pending for this version; completed results belong in the final manifest/report.

Financial release decision remains NO-GO. See LEGACY_MIGRATION_DISPOSITION_2026-09-07.md and REVIEWED_DEPLOYMENT_PREPARATION_2026-09-07.md. Two released predecessor advances have no protocol repayment recorded, complete event inventory remains unavailable, and real Arc production integration plus recovery/observed alert evidence are not yet verified. The older eleven-field predecessor layout is outside the fee-settlement history reader.

Rollback: production web remains at a8e6efb9ef6b3885954d6ccde7ef5f94ac21a488. Preserve that deploy until an authorized replacement is verified. Keep the 1.0.15 signed artifacts. Android rollback uses the previous approved source with a higher version code and the same certificate; do not uninstall or clear user data to force a downgrade. This candidate uses code 17, so any rollback update must use code 18 or greater.

Stop after the fixed release checks and report the decision. Do not reopen feature work to fill time while external prerequisites remain unresolved.
