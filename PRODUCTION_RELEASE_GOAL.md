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
- [ ] Produce release notes, rollback instructions and a final go/no-go checklist tied to exact commits/artifacts.

## Scope guard

No new product features, marketplace expansion, UI redesign, new paid services, or staging ledger cutover. Keep current production API/readiness behavior unless a verified release blocker requires a focused fix. Do not import unrelated dirty work. The reviewed contracts are restored without modifying their logic; approval-to-artifact and deployment matching are separate checks.

No production financial transactions, contract deployments, deposit enablement or real alert messages are authorized by this checklist alone. Render-only recovery remains the accepted backup approach. Current cron schedules stay unchanged.

## Stop rule

When the fixed checks pass, stop implementation and present the release decision. Do not add optional improvements to the release gate. If an external prerequisite prevents release, finish independent preparation and state exactly what is missing instead of expanding scope.

## Checkpoint reached

Candidate 1.0.15 / code 16 is built, signed with the existing release key and installed on Pixel. Full app smoke, web build, native checks, lint/unit tests and all 42 frozen contract tests passed. Home and Trade device smoke passed. The broad live payment/theme walkthrough and operational/deployment gates above remain open. Goal remains ACTIVE; full financial production is NO-GO.

Integration follow-up: see docs/REVIEWED_CONTRACT_INTEGRATION_2026-09-07.md. Arc public mainnet is announced for September 16; no production network parameters are assumed. The separate upstream signer now has tested, inactive V2 support in local commit 73685fc. HashPayStream-side integration and legacy-record disposition remain next.
