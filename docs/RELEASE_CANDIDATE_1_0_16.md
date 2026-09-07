# Candidate 1.0.16 (Android code 17)

Scope: one consolidated production-tightening candidate. No new product features.

Included since 1.0.15: explicit reviewed-contract signature support, historical fee-settlement receipt routing with owner isolation, original-network receipt links/share metadata, and guarded reviewed deployment preparation. Existing theme/auth/native/Trade fixes and the frozen reviewed contracts are retained.

The build uses current production public settings. New reviewed signature support remains inactive by default (legacy escrow signature 1 / repayment signature 3). Production backend, contracts and deposit settings are not changed by building or installing this APK.

Validation checkpoint: native readiness, account isolation, receipt share and navigation tests passed. The full smoke run passed through savings runtime, then its final surface check exposed obsolete hardcoded-version and public-environment assertions. Those assertions now check configured signature versions and allow only the added public version setting; the targeted final surface check passed under Node 22. All smoke components have therefore passed across that run and the corrected final check. Web build, Capacitor sync, signed APK/AAB, release unit tests and release lint passed. APK and AAB signatures verified against the existing certificate. All 281 embedded web files match the web build and ZIP byte-for-byte. Pixel package inspection confirms 1.0.16/code 17; a cold launch returned Status ok and the UI hierarchy contains Home, Trade, Agreements, Requests and Account. This proves installation and restored main-app navigation presence, not a complete payment or Trade walkthrough.

Financial release decision remains NO-GO. See LEGACY_MIGRATION_DISPOSITION_2026-09-07.md and REVIEWED_DEPLOYMENT_PREPARATION_2026-09-07.md. Two released predecessor advances have no protocol repayment recorded, complete event inventory remains unavailable, and real Arc production integration plus recovery/observed alert evidence are not yet verified. The older eleven-field predecessor layout is outside the fee-settlement history reader.

Rollback: production web remains at a8e6efb9ef6b3885954d6ccde7ef5f94ac21a488. Preserve that deploy until an authorized replacement is verified. Keep the 1.0.15 signed artifacts. Android rollback uses the previous approved source with a higher version code and the same certificate; do not uninstall or clear user data to force a downgrade. This candidate uses code 17, so any rollback update must use code 18 or greater.

Stop after the fixed release checks and report the decision. Do not reopen feature work to fill time while external prerequisites remain unresolved.

## Final evidence

Built source: `5e5fe6e7c0ad91c7b2c8e668769098a6f4e04e0a`.
Artifacts: `C:\Users\USER\Desktop\HashPayStream-1.0.16-Release`.

- APK SHA256: `cc57dfbb8693433bd4d927b9ff0317272cc090db9e032223ca56677e4eb244ed`
- AAB SHA256: `2546f9bfa6a6d6e32b84d128fa5e5ac58f875a0a30c29579b7a309b9ad1c3acf`
- Web ZIP SHA256: `dd9905e87dfa5a741c2699b662b8da6d8e7838b42c4a77c87887f7a9fc8672f9`

Read-only live check at 2026-09-07T19:34:23Z: production remains at the rollback commit above; readiness HTTP 200, database available, recoveryStatus AVAILABLE with startsAt 2026-09-03T22:40:53Z. Recovery metadata is not evidence of a completed restore drill.

Local preview renders the sign-in DOM. Privy rejects its localhost iframe origin under the configured frame-ancestors policy; no email was submitted. Screenshot inspection was blocked by the Windows sandbox image reader. Final visual light/dark and authenticated end-to-end checks remain unverified; do not count screenshot creation as visual approval.

Release gates, with no additional feature scope:
1. Resolve the two released predecessor advances and complete migration inventory; do not classify obligations as settled without evidence.
2. Verify the intended Arc production network/provider configuration and reviewed deployment migration before enabling financial use.
3. Observe a Render restore drill and authorized real alert delivery.
4. Complete final authentication, payment/receipt and Trade walkthrough plus light/dark visual checks against the candidate on supported origins/devices.

Decision: candidate packaged and installed for verification; financial public release remains NO-GO. No production web deployment, contract deployment or deposit activation was performed.
