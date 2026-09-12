# X Layer stock candidate and paused deployment review

Status: technical candidate verified on-chain; production selection and deployment remain blocked. This review continues commit cc4720d. No issuer account, live quote, participant approval or production policy has been assumed.

## Candidate

Evaluate **wSPYx V2**, the wrapped SP500 xStock, first. This is a proposed ETF-exposure pilot asset, not direct stock ownership or a guarantee of low volatility. The choice reduces single-company concentration; measured volatility and liquidity gates still apply.

The issuer's [SPYx asset API](https://api.backed.fi/api/v2/public/assets/SPYx) identifies the XLayer deployment and its explicit wrapperAddressV2. The saved [public evidence](evidence/stock-xlayer-candidate.json) records block 70421653, metadata, proxy runtime and implementation hashes.

| Field | Verified value |
| --- | --- |
| Network | X Layer mainnet, 196 |
| Underlying SPYx | 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48 |
| Candidate wSPYx V2 | 0xE7E553Cd128F0011777323A0b44a7b96EA1CB540 |
| Wrapper decimals | 18 |
| Payment USDC | 0xB6CEceAB302E2E4948951eE7843FC24E92933061 |
| Payment decimals | 6 |
| Wrapper asset() | The underlying SPYx address above |

Ordinary xStocks rebase. Our escrow tracks fixed inventory, so admitting raw SPYx would require different accounting. Use only a reviewed current wrapper. The [issuer's wrapper documentation](https://docs.xstocks.fi/developers/wrapped-xstocks) excludes legacy V1 from new integrations and explains its donation-sensitive exchange rate. A wrapper's conversion is not a price: value needs an independent underlying price and explicit unit conversion. Current and legacy addresses must not be interchanged.

Both stock contracts are proxies. Pin and monitor implementations as well as proxy code. The existing runtime verification checks escrow code and asset decimals, not token implementation changes; this needs an extension before activation. Source/audit and upgrade-authority review is still incomplete.

## Provider decision

**Backed/xStocks is the candidate for asset identity, corporate actions and account-specific execution/eligibility inputs.** The [public API quickstart](https://docs.xstocks.fi/developers/quickstart) separates unauthenticated metadata from authenticated wallet/account/trading operations.

The fetched public price response contains only quote, with no source timestamp. Retrieval time is not price observation time. It is unsuitable for signing a fresh acceptance, even when HTTP is successful. At this snapshot the issuer reports the market closed; that must disable new offers under the proposed pilot.

The [xChange documentation](https://docs.xstocks.fi/developers/xchange-atomic-rfq) describes authenticated soft quotes with creation/expiry times and wallet-bound executable quotes. Its network table omits X Layer, while current asset metadata reports XLayer atomic-swap support. Treat that discrepancy as unresolved until an approved account successfully obtains the relevant quote. No authenticated request or trade was made.

A soft/indicative quote is not proof of executable exit capacity. Verify the exact sell quantity, payment token, network, fees, spread, expiry, wallet permissions and path from wrapper to underlying. Unwrapping/redemption may need multiple transactions; do not promise atomic exit unless rehearsed.

**Chainlink SPY/USD Data Streams is an independent price-source candidate**, supported by its [published stream listing](https://data.chain.link/streams/spy-usd-equityprice-streams). Credentials, exact feed ID, report verification, freshness/market status and availability for this integration have not been tested. This is not a claim that an X Layer AggregatorV3 address exists.

Use decimal/integer arithmetic and actual token decimals. Validate wrapper conversion once, underlying-price units, and a timestamped USD/USDC rate or a quote explicitly denominated in USDC. Never treat an exchange's share-equivalent price as a price per wrapped token without conversion.

## Eligibility finding

The issuer distinguishes technical transferability from distribution eligibility. Its [legal overview](https://docs.xstocks.fi/docs/product-legal-overview) describes tracker certificates and jurisdiction-dependent distributor obligations. An active API account or a transferable wallet does not establish every worker's eligibility.

At the b2ce622 candidate-review checkpoint, the risk endpoint had one asset-level issuerEligible boolean and no worker/funder context. That cannot establish participant-specific eligibility. Before enabling mainnet, bind reviewed eligibility to both parties' identities and wallets, jurisdiction, asset, chain, policy version and expiry. Refuse missing, expired or mismatched evidence. Determine approved countries from the actual integration arrangement; do not infer ?Asia eligible? or Nigeria eligible from network usage.

## Proposed pilot limits

These are engineering proposals for review, not provider requirements, measured calibration or approved launch policy. They are not enabled.

| Control | Draft |
| --- | --- |
| Fee ceiling | 1% once per funded payment; fixed displayed amount |
| Principal | At most 100 USDC per payment |
| Duration | At most 7 days to repayment |
| Outstanding claims | One per worker |
| Backing | 100% of principal plus fee reserved at acceptance |
| Quote lifetime | At most 30 seconds, clipped to provider expiry |
| Source price age | At most 15 seconds |
| Contract risk age | 60 seconds maximum |
| Quote deviation | At most 0.5% |
| Executable exit depth | At least 1,000 USDC and enough for the proposed sale within the deviation limit |
| Volatility stop | Intraday high-low / prior regular close above 3%, or absolute 5-minute move above 0.5% |
| New offers | Regular US session only; no halt or corporate-action transition |
| Confirmation count | Pending network-finality review; do not equate N blocks with L1 finality |

Volatility needs timestamped, corporate-action-adjusted history and complete window coverage. Missing data means unavailable. Add a corporate-action blackout when a future multiplier is announced; resume after the new state and prices are verified. A future scheduled change must not be hidden by a current zero halt flag.

The current code does not implement all these controls. In particular, principal/tenor/per-worker limits, session checks, participant eligibility, corporate-action handling and verified history require implementation. A JSON policy proposal does not enforce them.

## Paused deployment packet

[Deployment review JSON](evidence/stock-paused-deployment-plan.json) contains the candidate, exact constructor order, draft immutable values, source/artifact hashes and expected paused state.

The owner/multisig and risk signer are deliberately unset because none was approved for this new escrow. No deployable transaction is emitted. The settlement signer must be separate. Paused deployment cannot compensate for incorrect immutable constructor choices.

Expected initial state: paused, no allowed assets or funders, zero USDC liability, policy version 1. After an approved deployment, capture transaction, creation block and runtime hash; verify constructor reads and initial state before any allowlisting. Resolve the legacy hosting/deployment-address mismatch independently.

Reproduction:
- npm run audit:stock-candidate -- --write : refresh public issuer and chain evidence.
- npm run test:stock-wrapper-fork : rehearse the actual candidate on localhost from the saved block.
- npm run stock:deployment-plan : regenerate the blocked review packet; never broadcasts.

The mainnet feature and automated sender remain disabled. Issuer-account approval is not a technical prerequisite for the direct DEX route. The next code dependency is a production adapter combining executable DEX quotes, an independent timestamped price reference and participant-bound risk evidence. See the decentralized exit review below.

## RPC compatibility

Read-only eth_getLogs probes against rpc.xlayer.tech rejected both 500-block and 2,000-block requests with a stated maximum of 100 blocks. The scanner now uses at most 100 blocks for chain 196; local tests retain 500. A focused test verifies both boundaries. Mainnet activation remains gated.

## Validation completed

The real wSPYx V2 fork rehearsal passed at saved block 70421653: proxy/implementation bytecode pins, actual wrapping, paused escrow construction, exact inventory deposit and withdrawal, withdrawal while paused, and donation-resistant conversion. Balances were seeded by impersonation entirely on localhost chain 31337; no real wallet key or mainnet write was used. This does not establish issuer approval, uninterrupted redemption, corporate-action behavior, executable liquidity or full production suitability.

The participant-binding boundary has since been implemented and tested; see [the provider readiness audit](STOCK_PROVIDER_READINESS_AUDIT_2026-09-12.md). Real provider-backed decisions and production adapter authentication are still pending.

## Decentralized route correction

The [decentralized exit review](STOCK_DECENTRALIZED_EXIT_REVIEW_2026-09-12.md) supersedes any implication that a Backed account or CAC approval is a technical dependency for transferring existing wSPYx or using a DEX exit. Issuer RFQ onboarding is an optional integration path. Participant/distribution review remains separate. A real two-hop exit passed on a local X Layer mainnet fork; the production price adapter and independent fair-price reference remain unfinished.
