# Trade rail consolidation - 2026-10-03

Branch: feature/trade-rails-20261002, based on live fe67705.
Companion Hash PayLink branch: feature/trade-rails-20261002, based on 3f47919fb.

The first increment introduces explicit Arc/XLayer payment identity in accepted
Trade terms. Arc is chain 5042 with six-decimal USDC; stock terms remain chain 196.
Historical USDC-only offers keep their original serialization and cannot be
silently promoted to Arc mainnet. Mainnet checkout requires newly accepted terms
with an explicit Arc rail. Existing stock reservation payloads stay unchanged.

This is foundation work. Hosted checkout still accepts xStocks only. No new Arc
option is advertised as usable, and neither production service was deployed.

The ordinary-token TradeEscrow/TradeEscrowFactory source is unchanged. Its 46
existing contract tests passed under the local-only hardhat.arc-trade.config.ts
(chain ID 5042, mock USDC, no remote networks or signing credentials). This does
not establish deployed-bytecode, real-USDC, Circle wallet or Arc Safe readiness.

Other passing checks: Trade rail/quantity tests; hosted checkout/HTTP tests;
disposable Postgres backend/community/confirmed-release/expired-recovery suite;
Stream typecheck.

Next required integration: verified Arc Trade deployment and authority; hosted
Arc participant/funding/reconciliation/reviewer adapters; two-choice Trade UI;
both-rail end-to-end evidence. Incorporate the other session's final XLayer split
test before freezing the combined Trade release. Work expansion follows Trade.

