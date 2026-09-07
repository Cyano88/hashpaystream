# Production audit checkpoint - 2026-09-07

## Verified live

- Render web service reports live commit a8e6efb9ef6b3885954d6ccde7ef5f94ac21a488. Public /readyz returns ready.
- Public savings config returns no vault, depositsEnabled false, status in_review, chain 196.
- Read-only RPC checks of the escrow in contracts/deployments/xlayer-mainnet.json return chain 196, deployed code, paused false, and asset/router matching the record. The historical pausedAtVerification true is not current state. Its recorded router has code on Arc testnet (chain 5042002). These checks do not establish audited runtime-bytecode equivalence or financial readiness.
- Android branch starts at 9e16166680520fb7e4031a99977e4440ae283268. Direct main-to-Android diff covers 193 files; production has Trade readiness changes absent from Android, while Android contains isolated staging ledger/receipt work and UI/native changes. Do not wholesale merge.

## Contract provenance blocker

All entries in FILE_MANIFEST.json in Desktop/hashpaystream-audit-bundles/HashPayStream-combined-contract-audit-2026-09-06.zip match their SHA256 hashes. Normalized UTF-8/LF source comparison finds:

- Android and production worktree are missing ArcRepaymentRouterV4.sol and UpfrontAdvanceEscrowV2.sol.
- LockedSavingsCohortVault.sol differs from the combined bundle in both worktrees.
- ArcRepaymentRouter.sol, PersonalSavingsVault.sol and UpfrontAdvanceEscrow.sol match.
- All six match the original dirty Desktop/hashpaystream checkout. Preserve that checkout.

Auditor approval was reported by the user. This check has not linked a written approval to deployed bytecode. The bundle harness was not rerun in this pass. Next contract work is an isolated candidate from production main, importing the exact frozen audited package, running its combined harness, and verifying deployment provenance and integration. No deployment or contract pause/unpause was performed.

## Fixes in this checkout

Savings runtime now caches only as a starting point for reads: each new mount disables deposits until fresh configuration succeeds. Failed refreshes invalidate cached permission, and unmounted requests cannot update shared cache. Regression checks cover remount, offline failure, recovery, and a late response after unmount. Added the runtime and API-config checks to the smoke command.

Updated outdated surface assertions to cover the current single splash, immediate resolved-screen mounting, shared sign-in mark and reduced-motion behavior. No splash implementation changed in this audit.

Validation: the full pre-change smoke command passed its preceding suites then failed obsolete surface assertions. After correction, standalone surface, savings runtime, savings API config and TypeScript checks passed. Full smoke was not rerun after the narrowly scoped fix; no combined all-green run is claimed. No new APK, production deploy or push in this pass.

## User cost question: live cron inventory

- hashpaystream-receipt-sync-staging: active Starter, every 15 minutes, command npm run sync:receipts:staging -- --allow-remote-staging-database.
- hashpaystream-receipt-monitor-staging: active Starter, every five minutes offset by three, command npm run monitor:receipts:staging -- --allow-remote-staging-database.
- Both track infra/financial-core-phase1 with auto-deploy off.
- Render bills active runtime, with a minimum USD 1 per job per month (https://render.com/docs/cronjobs). This establishes a combined minimum of USD 2, not an exact invoice or cap.
- The five user-supplied sync durations average 234 seconds. At 96 runs/day over 30 days, that projects to 187.2 compute hours for sync alone; it is an estimate, not measured monthly usage.
- Recommendation: suspend both staging jobs between deliberate testing windows. That stops staging freshness verification; its read API will become stale/unavailable. Neither job was changed during this audit.

Remaining operational gates include the Render PITR restore/cutover drill and observed alert delivery. Render-only recovery remains the user's chosen workflow; do not reintroduce Pixel or external backups as an assumed requirement.
