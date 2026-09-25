# Arc mainnet cutover audit — 2026-09-23

Status: blocked before credential issuance and production cutover. No API key was created, exposed, revoked or replaced. Render settings and active testnet recovery were not changed.

## Verified target
Official network reference: https://docs.arc.io/arc/references/connect-to-arc
- Arc mainnet chain ID 5042; HTTPS RPC https://rpc.mainnet.arc.io; explorer https://explorer.arc.io.
- USDC ERC-20 interface uses six decimals at 0x3600000000000000000000000000000000000000. Native USDC uses eighteen decimals. These must not be double-counted.

## Credential and hosting blockers
- Hash PayLink CLI auth status is signed_out.
- packages/cli/src/key-management.mjs only permits project:read, checkout:read and checkout:create on generated hpl_app_ keys. They cannot authorize Agreement APIs.
- packages/cli/src/hosting.mjs pins the destination variable to HASHPAYLINK_API_KEY. HashPayStream consumes HASHPAYSTREAM_ARC_API_KEY, with separate upfront/agent credentials. Renaming a checkout key does not grant Agreement permissions.
- HashPayStream's verified Render service has a test-mode Agreement key, Circle test configuration and no ARC_MAINNET-named settings. No secret values were printed.
- api/arc-mainnet-boundary.ts in Hash PayLink sets ARC_MAINNET_AGREEMENT_RELEASE to null. Activation rejects without a reviewed mainnet factory/operator release; an environment override cannot bypass it.

## Required sequence
1. Complete the Hash PayLink mainnet Agreement factory/operator deployment review and production Circle wallet/operator provisioning. Record chain, runtime bytecode, addresses, owner/operator permissions and verification evidence. Do not reuse testnet contract addresses.
2. Provide an owner-authorized live developer project with arc_agreements capability, Arc 5042 USDC routing, signed webhook and applicable Agreement activation policy.
3. Use a supported Agreement-key issuance path. For the requested CLI path, first add and deploy explicit Agreement scopes and server route enforcement, update protected key issuance, and add reviewed support for the HashPayStream Render variable. Test cross-project and cross-network rejection. Do not widen existing checkout keys.
4. Generate a dedicated Arc Agreement mainnet credential with an idempotent operation, keep it in protected storage, and deliver it directly to the verified Render backend. Never put it in VITE_ variables, chat, command arguments, repo files or logs. Use matching mainnet project/webhook settings. Existing testnet keys stay isolated until legacy recovery is retired.
5. Migrate all current product dependencies listed below with isolated mainnet stores and wallet/session namespaces. Preserve historical testnet identifiers and recovery paths; testnet records and balances are not mainnet assets.
6. Run server/provider/on-chain verification, then controlled end-to-end mainnet workflows. Deploy backend before the matching Android build. Do not publish a frontend pointing at unprepared contracts or wallet providers.

## Product dependency inventory
| Flow | Main dependencies requiring migration |
| --- | --- |
| Wallet, Send, Receive, Home | api/circle-wallet.ts; api/stream-accounts.ts; src/lib/circleWallet.tsx; src/lib/arcWallet.ts; Circle app ID/session isolation; production ARC wallet verification |
| Transfers and Activity | api/pocket-transfers.ts; src/lib/pocketTransfers.tsx; pending transfer reconciliation; explorer links; durable transfer chain IDs and receipt validation |
| Work Agreements/Requests | api/agreement-gateway.ts; api/service-requests.ts; api/customer-requests.ts; mainnet key/project/webhook; network-specific escrow history |
| Trade Arc rail | api/trade-wallet-verification.ts; api/trade-escrow-binding.ts; SQL settlement-wallet chain constraints and explicit mainnet bindings |
| Savings | src/lib/savingsChain.ts; useSavingsVault/useSavingsUsdcBalance; reviewed mainnet savings vault; signer/asset/runtime receipt checks; existing plans remain chain-bound |
| Legacy early-pay recovery | upfront settlement workers, evidence, checkpoints, targets, protection and webhooks; these must retain testnet recovery while new mainnet records use separate configuration |
| Agent Agreements | separate agent credential/project/webhook and independent policy limits |
| Readiness/Android | test-prefix assumptions in api/readiness.ts; Android public config validation; Privy supported chains; all client explorers and build flags |

This audit does not assert that any mainnet Agreement or savings contract is deployed. Current mainnet activation is blocked in the reviewed local source.

UI work completed separately: Android 1.0.31 / 32 installed successfully with new Heroicons, four recent-activity entries, and 220px minimum-height balance cards. Signed build and native checks passed; no server deployment occurred.
