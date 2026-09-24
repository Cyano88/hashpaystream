# Arc Agreement production integration handoff - 2026-09-24

Live baseline: a8877ba7118005fef233f28e700bbd1c7a41516f. Render service: srv-d9opfcad0e5s73c3omag. Existing developer project: dev_25f636321f644b4284.

The live app still has a test Agreement credential. Preserve it until reviewed migration; never reuse testnet records as mainnet evidence. The new CLI 0.3.2 can request owner-approved project read, Agreement read/create and key management. Agreement backend keys only read records/create drafts. They do not enable lifecycle/funding/signing routes.

Planned key name: Arc Agreement mainnet. Dedicated Render server variable: HASHPAYSTREAM_ARC_MAINNET_API_KEY. This variable is not yet consumed by the live app and does not activate mainnet flows. Creation requires project-owner browser approval, ready mainnet Arc USDC routing, Agreements capability and a signed webhook. Key lifetime is at most 30 days; renewal must be planned before production use.

No new key or Render mutation has occurred. No contract was deployed or funds moved. Hash PayLink mainnet Agreement release registry is null and workers are disabled. Production completion requires a separately reviewed mainnet contract/operator release, isolated wallet/store/webhook integration and a bounded mainnet canary before app/mobile cutover.

Hash PayLink authorization-support release requested: 9082e1b093014d9abe294741df93d600e7aa0356, Render deployment dep-daqe6hou01pc73fri5c0. Check deployment state before invoking the new scopes.

## Verified mainnet wallet binding increment
- Preserved the updated blue/white Hash PayStream logo and mark from the active migration worktree byte-for-byte.
- Added a separate register_mainnet_wallet action. It requires authenticated Privy identity plus a production Circle wallet-session check against the exact wallet ID/address, ARC chain, SCA type and LIVE state.
- Uses only HASHPAYSTREAM_CIRCLE_MAINNET_API_KEY with LIVE_API_KEY format at the fixed Circle HTTPS origin. No legacy/test key fallback; no signing, wallet creation or funds transfer.
- Stores chain 5042 provenance separately as arcMainnetWallet on the existing identity record, preserving walletAddress/test history. Prevents cross-account reuse and automatic wallet replacement. Legacy registration now merges the latest record rather than overwriting a concurrent mainnet binding.
- Tightened legacy wallet selection to exclude ARC mainnet wallets and reject a production key in the testnet adapter.
- This endpoint prepares identity provenance only. Existing service-request payouts still use the old wallet path and are NOT switched to mainnet. No production Circle key has been provisioned, no mainnet binding written and no new Hash PayLink key issued.
- Mainnet binding, stream account, Circle wallet/session and router-control regression tests passed; typecheck passed. Final build/deployment verification follows separately.
