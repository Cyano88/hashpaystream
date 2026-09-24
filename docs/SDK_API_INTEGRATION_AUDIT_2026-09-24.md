# Hash PayLink SDK/API integration audit - 2026-09-24

## Verified implementation

- Hash PayStream package.json does not depend on @hashpaylink/sdk. api/agreement-gateway.ts and api/service-requests.ts call Hash PayLink REST endpoints directly.
- Hash PayLink packages/sdk (version 1.0.0) exports checkout URL helpers and a React checkout button. It does not export an Agreement client, wallet provisioning, or session handoff.
- Hash PayStream src/lib/circleWallet.tsx, api/circle-wallet.ts and api/stream-accounts.ts implement the app wallet separately, using Circle testnet and Privy identity. These are existing product dependencies, not services automatically provided by the SDK.
- Hash PayLink api/arc-agreement-payer.ts owns the Agreement payer execution flow and verifies Circle sessions/wallets. api/arc-agreement-project-payer.ts authenticates a project plus agreement capability and payer email. A Circle session from an arbitrary separate app cannot be assumed interchangeable with this flow.
- Hash PayStream service requests call /api/v2/agreements/verified-recipient, /api/v2/agreements, and /api/v2/agreements/project-payer. The new agreement:read/create backend credential intentionally supports only reads and human draft creation at the base Agreement route. It cannot complete these service requests.
- Hash PayStream gateway, service-request and customer-request adapters still require hpl_test_ credentials. Merely handing a new hpl_app_ credential to Render does not migrate them.
- Hash PayLink ARC_MAINNET_AGREEMENT_RELEASE remains null. The source gate must not be removed or filled with testnet addresses to make activation appear ready.

## Correction made

Removed the unused register_mainnet_wallet action, its direct production Circle verifier and new dedicated Circle secret requirement introduced in da17d8c. No frontend used the action and no production Circle credential had been configured. Retained the updated logo, legacy wallet behavior, latest-record merge protection, and testnet/mainnet credential filtering. Existing data is not deleted or relabeled.

A separate production Circle app is not an established prerequisite for the intended Hash PayLink-managed integration. The earlier assertion that the existing SDK already bundles the complete wallet/Agreement flow was also incorrect.

## Remaining implementation boundary

Complete and review the platform-owned Agreement integration contract first: payer session handoff, verified payee registration, endpoint-specific permissions, lifecycle actions, webhook verification, and mainnet deployment evidence. Expose supported operations through the SDK, then migrate Hash PayStream's backend and frontend together with isolated mainnet records and end-to-end tests. Preserve the existing wallet-dependent Send/Savings/Trade flows until their replacement is implemented and verified.

This correction does not add a wallet-as-a-service API, issue a credential, activate mainnet Agreements or migrate existing funds. Production readiness remains unproven.
