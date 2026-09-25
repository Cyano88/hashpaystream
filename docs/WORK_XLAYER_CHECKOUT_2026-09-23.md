# Single-release X Layer work agreements

Implemented locally in the standalone Hash PayStream checkout on 23 September 2026. No deployment, production flag change, wallet transaction, new contract, or Pocket modification.

## Flow
Requests can select Arc USDC (existing route), X Layer USDC, or an explicitly selected approved stock. The Pocket-derived stock picker loads the work-specific authenticated asset list. X Layer amounts use exact token-native units, up to configured decimals; stock quantities never enter Arc USDC totals. Network/asset changes clear the input amount. USDC funding also requires approval in the pinned factory; listing USDC as a choice does not grant that approval.

The provider accepts or proposes revised terms; the client accepts the exact latest version. X Layer acceptance freezes work terms locally, without an Arc upstream call or Circle wallet requirement. Both participants then confirm their own server-verified Privy embedded wallet. Wallets become immutable for this request. Once both are present, a durable binding fixes the work description, version, network, token, quantity, parties, deadlines, factory and arbiter. A work-specific offer ID cannot collide with Trade listing offers. Retries retain the same binding and funding deadline.

The worker prepares and accepts escrow. The client funds it through exact allowance/zero-reset as needed, with one first-party confirmation and standard Privy transaction modals hidden. Work CTAs map to the existing escrow lifecycle; no contract was relabeled or redeployed. The server verifies the pinned factory and immutable escrow terms using the shared planner before returning any transaction. Client validation checks wallet, chain, value, token, precision and exact amount. Pending state persists before signing; unknown broadcast results block retries. Returned receipts require three confirmations and exact transaction matching.

## Explicit work rules
- Single release only; no milestones or progressive payments.
- Worker submission deadline: 1–30 days after confirmed funding.
- A work link or explanation is hashed and saved durably before submission signing. Shared evidence notes may include unsigned attempts, and the UI labels that limitation.
- Client can approve and pay immediately after submission, or explicitly start a 24/48/72-hour review period.
- Worker can claim after the client-started review period unless a dispute is confirmed on-chain before the deadline. Submission alone never starts this release clock.
- If the client does not respond, the worker may dispute after seven days from submission. No silent automatic release is claimed.
- Client can reclaim after missed submission. No discretionary client cancellation refund while funded before that deadline; worker voluntary refund remains available.
- Refunds, releases and dispute handling use the accepted token quantity, not a changing dollar valuation. The arbiter is disclosed. A new mutual-settlement or arbitrator console is not included.
- Funding is due within one day after the second wallet is bound. An expired unpaid binding is not silently renewed; cancellation/new terms require a new request.

## Visibility and isolation
Requests detail includes work checkout and shared notes. The Agreements list includes both client and worker X Layer agreements, with named tokens and work-specific state labels, linking to the correct request lifecycle. Arc funding components do not render for stock work requests. Existing request idempotency, version handling and account filtering remain in place. Confirmed work state is persisted with its observed block; late responses cannot rewind the stored block projection. List state is last observed; opening/refreshing the work checkout reconciles it again.

## Activation and release boundary
Frontend: VITE_HASHPAYSTREAM_WORK_XLAYER_ENABLED=true exposes new work payment choices. Server: HASHPAYSTREAM_WORK_XLAYER_ENABLED=true allows new requests and funding. Defaults remain off. Shared factory and token registry configuration must match approved assets. The work flag does not enable Trade funding. Pausing new work funding preserves access to existing bound escrow status, refunds, release and disputes.

Before enabling: inspect the configured token list and actual factory approvals, verify participant wallet creation/recovery, rehearse two-party app signing and lifecycle with a deliberately approved asset, and close existing contract provenance/dispute-operations release gates. No authenticated browser/device or funded mainnet test is claimed here.

## Verification
- test:work-xlayer: exact fractional units, precision bounds, policy limits, participant isolation, stale versions, no Arc calls, immutable wallets/bindings, retries, evidence persistence failure, observed-state ordering and pause behavior; rendered checkout tests for consent, duplicate clicks, exact amount, account switch and unknown submission.
- test:service-requests: existing Arc acceptance, lifecycle, early-pay routing, races and recovery passed.
- test:request-isolation: account changes and composer idempotency passed; added checks for payment-asset amount reset and fractional work payload.
- test:trade-xlayer and test:trade-xstocks passed after sharing the picker loader and observed-block field.
- Final TypeScript/Vite build result is recorded in the session response.

Separate remaining work: Trade still uses its legacy two-decimal terms; Early Pay/funding-partner navigation simplification is not part of this change; no new stock-swap execution or fiat quote conversion is included.
