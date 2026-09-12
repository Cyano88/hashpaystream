# Stock early pay: mainnet handoff, 12 September 2026

> Current pricing decision: Twelve Data is the lower-cost independent-reference candidate; Pyth is excluded from the launch path. X Layer remains the executable quote/depth source, not the sole valuation source. The local manipulation rehearsal demonstrated why. Mainnet remains disabled.

## Authoritative network correction

X Layer mainnet (196) is the deployment target. Earlier testnet recommendations in STOCK_EARLY_PAY_BUILD_2026-09-10.md are superseded. Arc savings is separate.

The stock browser client now recognizes chain 196 and local chain 31337. Stock API configuration and the automated settlement sender currently accept only local chain 31337. This is an explicit deployment-review gate, not a recommendation to deploy to X Layer testnet. No stock mainnet contract or asset is silently inferred from the existing USDC advance product.

## Read-only mainnet verification

Verified through https://rpc.xlayer.tech at block 70404550:

| Record | Escrow | State | Runtime keccak256 |
| --- | --- | --- | --- |
| Checked-in render.yaml | 0xCA4f547527A64a94c9b45306f311D8658d8A3Dbf | Paused | 0x8541bc97d8b1887c00eb760e882ac9b6a36b2c151139b33864d1ff252bca9887 |
| contracts/deployments/xlayer-mainnet.json | 0x98A45f994E5fb887a950D20BEd60bA83cB00430c | Paused | 0x313acc541539d7a26a7830110e872fd246b86e23081677510b12e4adb23bfbe3 |

Both return asset 0xB6CEceAB302E2E4948951eE7843FC24E92933061, whose decimals() returns 6. This verifies contract configuration and token decimals; it does not establish issuer/redemption or stock eligibility.

The deployment record identifies the replacement as UpfrontAdvanceEscrowV2. Neither is StockEarlyPayEscrow. The checked-in deployment/config discrepancy needs reconciliation before a release; this check did not inspect or change the running hosting environment.

## Scheduled repayments

- npm run stock:settlement-worker executes one pass every 15 seconds; append -- --once for a single pass.
- Requires HASHPAYSTREAM_STOCK_SETTLEMENT_WORKER_ENABLED=true, valid stock configuration, an explicit DATABASE_URL, HASHPAYSTREAM_STOCK_SETTLEMENT_KEY, and HASHPAYSTREAM_STOCK_SETTLEMENT_MAX_TX_WEI.
- Use a dedicated gas-only signer, separate from the risk signer, for one escrow and one database. Never share it with wallets, other workers, other databases or deployment tools.
- PostgreSQL advisory locking excludes concurrent instances for this signer. A durable signer-to-escrow binding also prevents reusing it for another escrow in this database.
- Reconcile confirmed receipts first. Select only a confirmed delivered claim whose on-chain due date has arrived and whose worker, funder, earnings and fixed principal-plus-fee match.
- Simulate the exact settle(offerId), check the maximum transaction gas cost, and persist signed bytes/hash before broadcasting. At most one submission per pass.
- On restart or ambiguous RPC failure, verify the journal signature, chain, contract, calldata, zero value and gas budget, then resubmit exactly the same bytes. Never allocate a replacement nonce automatically.
- Confirmation/reorg checks prevent crediting unconfirmed or orphaned repayments. A reorg that moves the claim back before payday also prevents early rebroadcast.
- Confirmed reverted jobs, unused signed nonces after third-party settlement, and inconsistent signer activity require review. Do not delete journal rows to force retries. No automated fee bump or replacement transaction is implemented.
- Pausing new offers does not stop repayment of existing claims. Repayment goes to the contract's fixed funder; the worker cannot redirect funds or change repayment amounts.
- A stock price decline does not increase the worker's USDC deduction. The claim was fixed when accepted.
- Only one transaction per pass is bounded; candidate/journal reads still scale with pilot history. Public-scale queue pagination and archival remain future work.

## Rehearsal

npm run test:stock-postgres creates a fresh loopback-only PostgreSQL 17 instance and synthetic local chain. It does not load a production database URL. Requires the PostgreSQL binaries under C:/Program Files/PostgreSQL/17/bin/ on this Windows workstation. Temporary test database files remain under the system temp directory for diagnostics; the test stops its database and chain processes.

npm run test:stock-mainnet-fork runs the same flow against a localhost fork pinned to X Layer mainnet block 70404550. It checks both recorded escrow runtime hashes against that fork. The candidate stock escrow and both test tokens are newly deployed locally; all accounts and balances are synthetic. The local fork clock is advanced for fresh quotes. This is not a real-stock transfer, issuer restriction, real Privy signing, live scheduler or mainnet gas-budget validation.

Coverage includes early repayment rejection, concurrent worker exclusion, gas cap, committed intent followed by simulated process exit, recovery by a fresh worker process, exact-once successful repayment, receipt worker restarts, canonical confirmations, reorg removal, replay, journal tampering rejection and mainnet/risk-signer gate rejection. Existing employer/worker/funder UI checks remain applicable.

## Next release package

1. Run the configured Twelve Data adapter during an open regular US session and capture contemporaneous independent prices plus X Layer quotes. Confirm written production data rights and capacity.
2. Establish the actual worker/funder eligibility and corporate-action review service, then approve fee, volatility, liquidity, price-age, quote-deviation, claim and tenor limits.
3. Prepare StockEarlyPayEscrow with the verified wSPYx and USDC contracts, owner multisig, distinct risk signer and settlement signer. Deploy paused only after final review and record the creation block and runtime hash.
4. Rehearse the paused candidate with real authenticated wallet sessions and issuer-compatible assets, then review the explicit API and settlement-worker changes that permit chain 196.
5. Reconcile hosting configuration, enable receipt and scheduler workers separately, validate health and gas budgets, and admit a small reviewed pilot cohort before wider public testing.

No mainnet transaction, live deployment, production database mutation, push or hosting configuration change was performed in this checkpoint.

## Completed validation

- Node 22 TypeScript and Vite production build passed (existing dependency annotations and bundle-size warnings remain).
- Final pinned mainnet-fork plus isolated PostgreSQL integration passed, including reorg-before-payday and tampered journal rejection.
- Stock policy, selector, checkout, funder desk and employer UI tests passed.
- Standalone route and browser-secret checks passed after correcting their old testnet expectation.
- Both worker entry points rejected disabled startup.

## Asset/provider review checkpoint

wSPYx V2 was identified through the issuer API and verified on chain 196. Actual-token local-fork wrapping and escrow inventory tests passed. Mainnet log scanning now respects the observed 100-block RPC limit. See [the asset/provider review](STOCK_ASSET_PROVIDER_REVIEW_2026-09-12.md) and its evidence and blocked paused-deployment packet. Asset eligibility, verified production pricing/liquidity, implementation review, constructor owner/signers and risk-policy approval remain outstanding. No mainnet transaction was sent.

## Provider readiness and participant evidence checkpoint

See [the provider audit](STOCK_PROVIDER_READINESS_AUDIT_2026-09-12.md). The risk-adapter interface now requires request-bound worker/funder clearance and POST requests. An integration request is drafted, not sent. Actual provider access, jurisdiction review and live risk evidence remain unverified; mainnet activation remains gated.

## Decentralized route correction

The [decentralized exit review](STOCK_DECENTRALIZED_EXIT_REVIEW_2026-09-12.md) supersedes any implication that a Backed account or CAC approval is a technical dependency for transferring existing wSPYx or using a DEX exit. Issuer RFQ onboarding is an optional integration path. Participant/distribution review remains separate. A real two-hop exit passed on a local X Layer mainnet fork. The independent Twelve Data adapter is implemented; its open-session live evidence and production rights remain release gates.

## Production adapter implementation checkpoint

The opt-in DEX adapter now combines exact-amount/depth quotes with independent timestamped stock and USDC references, regular-session checks and authenticated review evidence. Twelve Data is the default candidate and Pyth is excluded from the launch path. The full actual-token local-fork repayment rehearsal passed with synthetic reference and participant evidence. See [the Twelve Data handoff](STOCK_TWELVE_DATA_ADAPTER_2026-09-12.md). No mainnet activation or issuer account is implied.

## Crypto-aligned pricing audit

See [token-market audit](STOCK_TOKEN_MARKET_AUDIT_2026-09-12.md). Weekend executable exit was observed at block 70451779. A bounded manipulation rehearsal later showed that sustained same-pool movement can outlast the history guard, so DEX-only valuation is rejected. No weekend policy or mainnet gate was enabled.
