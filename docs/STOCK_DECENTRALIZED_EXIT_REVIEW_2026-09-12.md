# Decentralized stock exit checkpoint ? 12 September 2026

## Result and scope correction

Existing wSPYx V2 can exit through Uniswap v3 on X Layer: **wSPYx ? USDG ? USDC**. The actual wrapper and deployed router executed successfully on a local mainnet fork. No Backed account, issuer RFQ, CAC approval or mainnet transaction was used by these tests. This corrects the earlier mandatory-account framing. Technical transferability does not itself settle HashPayStream's participant/distribution responsibilities.

This is an inventory-and-exit rehearsal, not the complete real-token early-pay acceptance/repayment flow or a production release. Mainnet API and scheduler gates remain in place. Arc savings remains separate.

## Verified route

Addresses were sourced from [Uniswap's X Layer deployment documentation](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-xlayer-deployments), then contracts, pool identities and token implementation pins were checked at block **70423197**.

| Hop | Pool | Fee |
| --- | --- | --- |
| wSPYx ? USDG | 0x07c40850D14064D20eB0AfDEf9574675392f2c11 | 0.05% |
| USDG ? USDC | 0xbB9a35F790EA6eA9763b99e885f33BCF95860d40 | 0.01% |

The checked direct wSPYx/USDC 0.05% pool exists but is uninitialized. This audit does not claim to enumerate every exchange or possible route. Both selected pools returned five-minute and thirty-minute observation history.

| Input wSPYx | Quoted USDC output |
| --- | --- |
| 0.01 | 7.691323 |
| 0.10 | 76.912599 |
| 0.13 | 99.986099 |
| 1.00 | 769.061463 |
| 2.00 | 1537.979537 |

These are block-specific simulations, including pool fees and price impact, excluding gas. They are not reserved prices, guaranteed future proceeds or proof of durable liquidity. The intermediary adds USDG exposure and another pool dependency.

## Reproducible evidence

- [Read-only route and quote snapshot](evidence/stock-dex-exit.json): token/proxy implementation pins, route contracts, pool identities, observations and quotes.
- [Local fork result](evidence/stock-dex-exit-fork.json): exact 0.13 wSPYx spent and 99.986099 USDC received, bounded approval, minimum output and router deadline.
- Run npm run audit:stock-dex-exit to refresh read-only mainnet evidence, then npm run test:stock-dex-exit for a loopback-only fork rehearsal.

The fork uses synthetic accounts, balances and local impersonation to seed the actual wrapper. It also checks wrapping, exact escrow inventory transfers, initial pause, withdrawal while paused and donation-resistant conversion. No production keys or balances are used. The fork does not establish real wallet onboarding, full fixed repayment, live execution cost or issuer redemption access.

## Pricing still needs production work

An executable DEX quote measures sell proceeds. Its spot and TWAP share the same pools and cannot independently establish stock fair value. The public Backed indicative price lacks a source timestamp. A wrapper conversion ratio also is not a stock price.

The trusted adapter must combine a reviewed independent timestamped SPY reference, wSPYx-to-SPYx conversion, explicit USD/USDC treatment, current executable exit depth, market sessions, corporate actions and participant-bound evidence. Fail closed when any required evidence is stale or missing. Saturday DEX quotes do not mean the underlying US stock market is open.

Pyth is a candidate for further evaluation, not a configured provider: [its current documentation](https://docs.pyth.network/price-feeds/core/getting-started) states that Hermes API access requires a key following the August 26, 2026 upgrade. Permissionless on-chain feeds and authenticated data delivery are distinct. No SPY feed integration or API access was established here, and a price-data credential is not an issuer account.

## Next strongest production action

Implement the verified DEX quote route in the trusted server adapter and pair it with a verified independent reference and market-session policy. Keep the stock amount, fixed USDC obligation and worker risk disclosure distinct: a later stock price decline must never increase the already-agreed deduction.

Then rehearse the complete actual-token acceptance, scheduled fixed repayment and worker remainder release against the isolated database. Calibrate pilot caps and risk limits, finish contract/implementation security review, confirm the owner multisig and separate signers, and finalize the paused mainnet deployment packet. The draft packet remains blocked and contains no unsigned transaction. The optional issuer integration request remains unsent.
