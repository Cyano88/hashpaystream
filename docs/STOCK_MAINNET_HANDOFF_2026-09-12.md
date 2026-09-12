# Stock early pay: mainnet handoff, 12 September 2026

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

1. Select the actual transferable stock token on chain 196 and verify issuer access/transfer restrictions, redemption model, supported worker jurisdictions and contract behavior.
2. Implement the trusted price/liquidity/issuer eligibility adapter. Review fee ceiling, volatility ceiling, liquidity floor, price age, quote deviation and confirmation policy. The TESTx token and 3% ceiling used in tests are fixtures, not approved production choices.
3. Prepare StockEarlyPayEscrow deployment with the verified payment token, owner/multisig, distinct risk signer and immutable policy limits. Deploy paused only after review. Capture creation transaction/block and exact runtime hash.
4. Rehearse candidate configuration with real authenticated wallet sessions and issuer-compatible assets, verify fixed settlement and worker remainder release, then review enabling chain 196 in the API and sender.
5. Reconcile hosting configuration, separately enable receipt/scheduler workers, validate their health and gas budgets, and admit a small reviewed pilot cohort before public testing.

No mainnet transaction, live deployment, production database mutation, push or hosting configuration change was performed in this checkpoint.

## Completed validation

- Node 22 TypeScript and Vite production build passed (existing dependency annotations and bundle-size warnings remain).
- Final pinned mainnet-fork plus isolated PostgreSQL integration passed, including reorg-before-payday and tampered journal rejection.
- Stock policy, selector, checkout, funder desk and employer UI tests passed.
- Standalone route and browser-secret checks passed after correcting their old testnet expectation.
- Both worker entry points rejected disabled startup.

## Asset/provider review checkpoint

wSPYx V2 was identified through the issuer API and verified on chain 196. Actual-token local-fork wrapping and escrow inventory tests passed. Mainnet log scanning now respects the observed 100-block RPC limit. See [the asset/provider review](STOCK_ASSET_PROVIDER_REVIEW_2026-09-12.md) and its evidence and blocked paused-deployment packet. Asset eligibility, authenticated pricing/liquidity, implementation review, constructor owner/signers and risk-policy approval remain outstanding. No mainnet transaction was sent.
