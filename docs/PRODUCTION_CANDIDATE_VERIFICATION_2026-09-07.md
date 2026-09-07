# Candidate verification - 2026-09-07

Candidate: release/production-20260907, based on live main a8e6efb9ef6b3885954d6ccde7ef5f94ac21a488.
Scope: existing app/Android correctness fixes plus exact reviewed contract source/test restoration. No API, server.ts, Render configuration, staging migrations or receipt-ledger cutover changes.

## Passed

- Fresh extraction of the combined audit ZIP: full file hashes and source provenance verified.
- Archive SHA256: e51c11f8f330acc44898b71ddbee81ab25b61a9ca41a23aea3156b6bb13428ad.
- Frozen package installed from its lockfile using npm ci --ignore-scripts --no-audit --no-fund.
- Frozen local-only Hardhat harness under Node 22: 42 passing tests across six contract suites. No deployment network or environment/key loading in the frozen config.
- Candidate source/test provenance: node scripts/verify-combined-contract-source.mjs verifies all 15 imported files against normalized audit hashes. The original raw manifest remains under contracts/audits/combined-20260906 for archive provenance; run the candidate verifier for checkout files because Git line-ending normalization may change raw bytes.
- Standalone route and browser-secret surface checks.
- Android static readiness checks.
- Native receipt share checks: cache-only files, byte preservation, cleanup, web fallback and failure paths.

## Pending in this checkpoint

- Full candidate smoke suite and production build PASSED under Node 22. Logs: output/playwright/release-smoke.log and release-build.log (ignored local evidence).
- Native account isolation/navigation, signed APK/AAB build, release unit tests and lint PASSED. Pixel update and signed-in Home/Trade smoke PASSED. A complete live financial transaction walkthrough was not performed.
- Actual deployment provenance/network disposition and operational recovery/alert evidence.

The production candidate preserves main's backend. The Android branch's additional upfront transaction-capture calls were deliberately not imported because they require excluded backend/staging changes. Existing app fixes are sourced from Android commit 9e16166 plus the local tested savings permission-cache and surface-test corrections. Importing reviewed contracts does not change which contracts the live app uses.

## Live contract identity follow-up

Render's configured backend and VITE escrow, router and X Layer chain values match the tracked deployment record (six comparisons passed; no secret values recorded). Read-only runtime comparison against freshly compiled frozen audit artifacts found the deployed X Layer escrow matches legacy UpfrontAdvanceEscrow and the Arc testnet router matches legacy ArcRepaymentRouter. Neither matches its hardened V2/V4 counterpart. This comparison excludes Solidity metadata and immutable slots; it is executable-code evidence, not an exact whole-bytecode certification. Asset/router getters were separately checked in the production audit.

Therefore restoring hardened sources does not close the live financial deployment gate. Keep the financial release no-go until the approved deployment/network plan and matching integration are established.

Native account-isolation and native-navigation suites also passed, covering identity switch, late responses, logout, launch, SPA history/back/minimize and keyboard visibility.

Signing preflight passed against the existing 1.0.14 APK: the candidate uses the same signing certificate. Version 1.0.15, code 16. Signed APK/AAB build passed with current production public configuration; private server variables were excluded. No new signing key was created.

## Final artifact checkpoint

- Android 1.0.15 / code 16 installed on Pixel as a normal update; no uninstall or data clearing. Signed-in Home rendered and Trade Browse loaded without a connection-timeout screen. This is a basic device smoke, not a full financial lifecycle or every-theme retest.
- Gradle assembleRelease, bundleRelease, testReleaseUnitTest and lintRelease: BUILD SUCCESSFUL, 675 tasks executed.
- APK SHA256: 117783f920abd0b07dc7b0b36088fc1e5d4b878371f7216900bdf1df23661fb5.
- AAB SHA256: 0570f678491413f19a964074e66caf89d7b3255c1fc2cd61103507a88ec16011.
- Signing certificate SHA256: 402b168adfbff8ae5be5b188895d732fe62f29dbf4f8ceda34f25ee2c4c777d4.
- APK signature verified. Jarsigner reported AAB jar verified, with self-signed/untrusted-chain, timestamp and ZIP manifest/JarInputStream ordering warnings. No Play Console acceptance test or upload was performed.
- Artifacts saved to Desktop/HashPayStream-1.0.15-Release. Device screenshots contain private app data and remain ignored local evidence, excluded from the release package and repository.
- No production web deploy, contract transaction, new deposits, real notification messages, cron changes or new paid services.

The staged whitespace check reports existing trailing blank lines in four imported frozen contract/test files. They are preserved to retain audited-source fidelity; no Solidity/test logic was edited to silence formatting warnings.
