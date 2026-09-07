# Production release goal

Status: ACTIVE. Feature scope frozen on 2026-09-07.
Candidate branch: release/production-20260907.
Production base: a8e6efb9ef6b3885954d6ccde7ef5f94ac21a488.

## Definition of done

One versioned web and signed Android candidate, with the approved existing product flows, repeatable passing release checks, contract provenance evidence, operational recovery evidence, and an explicit go/no-go decision. Readiness is not inferred from a green health endpoint. A release blocker must name the failing condition and the smallest corrective action.

## Fixed work list

- [x] Create an isolated candidate from the verified live production commit.
- [x] Consolidate existing Android/auth/theme/receipt fixes, including savings permission-cache regression, while retaining production Trade readiness. Candidate smoke and web build passed.
- [x] Restore exact reviewed combined contract sources/tests and run the frozen six-suite harness; record archive and source hashes. All 42 tests passed.
- [ ] Verify configured deployment identities, networks and runtime-code provenance against reviewed artifacts. Resolve the legacy unpaused escrow/testnet-router discrepancy before any financial launch claim.
- [ ] Pass candidate application build, smoke suite, native readiness checks and signed Android validation. Verify login, payment lifecycle, receipt sharing, retry/account isolation and system/light/dark behavior against the final candidate.
- [ ] Complete recovery/alert evidence or record the precise external dependency and keep the financial release no-go.
- [x] Produce release notes, rollback instructions and a final go/no-go checklist tied to exact commits/artifacts. See docs/RELEASE_CANDIDATE_1_0_16.md; financial release remains NO-GO.

## Scope guard

No new product features, marketplace expansion, UI redesign, new paid services, or staging ledger cutover. Keep current production API/readiness behavior unless a verified release blocker requires a focused fix. Do not import unrelated dirty work. The reviewed contracts are restored without modifying their logic; approval-to-artifact and deployment matching are separate checks.

No production financial transactions, contract deployments, deposit enablement or real alert messages are authorized by this checklist alone. Render-only recovery remains the accepted backup approach. Current cron schedules stay unchanged.

## Stop rule

When the fixed checks pass, stop implementation and present the release decision. Do not add optional improvements to the release gate. If an external prerequisite prevents release, finish independent preparation and state exactly what is missing instead of expanding scope.

## Checkpoint reached

Candidate 1.0.16 / code 17 is built, signed with the existing release key and installed on Pixel. Build source is 5e5fe6e7c0ad91c7b2c8e668769098a6f4e04e0a. All smoke components passed across the full run and corrected final surface check; web build, native checks, release lint/unit tests and 281-file embedded artifact comparison passed. All 42 frozen contract tests passed. Final APK cold launch succeeded and main navigation was observed in the UI hierarchy. Earlier 1.0.15 Trade smoke does not certify the final APK. The final live payment/theme/Trade walkthrough and operational/deployment gates remain open. Goal remains ACTIVE; full financial production is NO-GO.

Integration follow-up: see docs/REVIEWED_CONTRACT_INTEGRATION_2026-09-07.md. Arc public mainnet is announced for September 16; no production network parameters are assumed. The separate upstream signer now has tested, inactive V2 support in local commit 73685fc. HashPayStream-side reviewed-domain support and the synthetic local funding/release/split/refund lifecycle now pass. Legacy-record disposition, deployment preparation and operational evidence remain open. Production activation is unchanged.

Migration audit: see docs/LEGACY_MIGRATION_DISPOSITION_2026-09-07.md. The three incomplete records are identified, but two released predecessor advances have no repayment recorded in the original protocol; operator disposition and complete event coverage remain open. Current history support covers fee-settlement records, not this older eleven-field layout.

Reviewed deployment preparation: V2/V4 command selection, mandatory frozen build/artifact checks, paused-state checks and read-only creation verification are prepared and tested offline. The old empty-unpaused retirement bypass is removed. See docs/REVIEWED_DEPLOYMENT_PREPARATION_2026-09-07.md; no deployment or activation has occurred.

