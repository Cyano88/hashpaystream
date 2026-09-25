# Pocket xStocks audit and Hash PayStream reuse

## Scope and evidence
Source-level audit of the current Pocket working tree at Desktop/polymarket-lp-sentinel/hashkey-paylink, including its uncommitted xStocks implementation. Pocket was read only. Standalone Hash PayStream changes remain local. This is not a full security audit or authenticated device/mainnet rehearsal.

Pocket has a complete UI path: market and portfolio, searchable asset selection, holdings, Buy/Sell/Swap review, wallet send/receive, XPay merchant checkout, and pending transaction feedback. Reviewed PocketXStocksPage, PocketStockTrade, PocketArcTokenPicker, stockPickerTokens, usePocketStockWallet, pocketXStocksWallet, pocketXStocksSwap, pocketStockSubmission, PocketXPay, the authenticated swap route, and the September 22 execution audit.

Execution code includes first-party payment approval, explicit Privy wallet selection with standard transaction modals hidden, client calldata validation, sealed server quotes, exact approvals, quote refresh after approvals, and persisted pending/uncertain submission handling. These are code observations; no real buy/sell/payment was performed in this audit. The prior audit document records read-only provider and mocked execution checks, not a signed end-to-end proof.

## Reused locally
- PocketArcTokenPicker adapted as XStockTokenPicker: same modal/search/held-first rows, icons, keyboard focus trap, Escape close, and failed-image fallback. Native Pocket back handling and safe-area dependencies adapted for the web app.
- Copied Pocket catalogue (808 entries) and ranking snapshot, with source attribution in the files. Catalogue metadata is not authorization. Remote issuer icons are display only.
- Added a reusable XStockPaymentPicker with account-scoped balance reads, cancellation of stale responses, and unknown balance states rather than fabricated zeros. Balances are last-refresh display values, never funding authorization.
- Trade proposal form selects an explicit named stock instead of a single build-time default token. Changing currency or stock clears amounts to avoid reinterpreting fiat as token units.
- Offer summary and payment confirmation show company name and ticker; unknown historical assets retain their exact contract address as fallback.
- Authenticated, rate-limited asset endpoint intersects Pocket metadata with Hash PayStream's server registry and the pinned factory approval, and checks token decimals, chain, recent block and block-hash consistency. Disabled payment gate returns no assets. Checkout still independently validates current factory/token state.

## Reuse boundaries
Pocket Buy/Sell/Swap signs DEX transactions. Pocket XPay sends tokens directly to a merchant. Neither call may replace escrow funding, which must invoke the accepted escrow with its exact token amount and existing server checks.
Pocket PIN/native biometric context, Circle context, notification registration, user identity and server credentials are app-specific and were not copied. Existing Hash PayStream signing/recovery remains authoritative.

The component is reusable for Work Agreements, but Work Agreements are not wired to X Layer escrow by this change. They still require their own durable work terms, participant binding, submission/review deadline policy, receipts and refund/dispute handling. Start with one release; existing TradeEscrow is not a milestone or progressive-release contract.

Current Trade amount validation is limited to two decimal places. This change discloses that limit and preserves historical terms; token-native fractional precision needs an explicit versioned terms migration. No live stock conversion quote was added to escrow payments. Catalogue/approval membership is not proof of issuer eligibility or unrestricted transferability.

## Validation
- TypeScript check passed before final build.
- New asset tests: disabled gate, configured/catalogue intersection, factory pin, approval, precision, wrong chain, stale node, reorg and RPC failure.
- New picker adapter tests: exact quantity display, unknown balances, approved-only selection, arbitrary-contract rejection, account-switch response isolation.
- Existing Trade X Layer planner, Privy consent/recovery UI and escrow-binding tests passed.
- Final production build result is recorded in the session response.

No deployment, production flag change, contract change or wallet transaction. No Pocket source changes. Early Pay navigation removal and Work Agreement escrow integration remain subsequent implementation work.
