# HashPayStream

HashPayStream is an agreements-only customer application for protected USDC
payments on Arc. It owns its customer experience, identity-to-agreement
ownership journal, and signed webhook history. Hash PayLink remains the
upstream agreement, checkout, chain-policy, lifecycle, and receipt provider.

## BuildX AI Season pilot

HashPayStream Upfront turns funded service agreements into AI-underwritten
cash-flow assets with bounded advance execution on X Layer. The public judge
entry is https://hashpaystream.app/upfront. Submission copy, architecture, onchain proof, and the 90-second demo script are in
[`docs/BUILDX_AI_SEASON_SUBMISSION.md`](./docs/BUILDX_AI_SEASON_SUBMISSION.md).


## Product surface

- `/` public product landing
- `/docs` customer documentation
- `/agreements` authenticated agreement workspace
- `/agreements/new` agreement creation
- `/api/hashpaystream/v1/human/agreements` human agreement gateway
- `/api/hashpaystream/v1/human/upfront/agreements` human Upfront agreement gateway
- `/api/hashpaystream/v1/agent/agreements` agent-only agreement gateway
- `/api/hashpaystream/arc-agreement-webhook` signed lifecycle receiver
- `/api/hashpaystream/v1/agent/agreements` authenticated headless-agent gateway
- `/api/hashpaystream/v1/circle-marketplace/agreement-plan` Circle Gateway x402 storefront for fixed agreement plans
- `/api/hashpaystream/v1/agent/arc-agreement-webhook` separately signed agent lifecycle receiver
- `/admin/analytics` private operator dashboard (server-side admin allowlist)
- `/api/hashpaystream/v1/admin/analytics` privacy-safe aggregate analytics
- `/stats` public Arc Testnet product proof
- `/api/hashpaystream/v1/public/stats` cached public aggregate statistics
- `/healthz` dependency-free process liveness
- `/readyz` aggregate durable-dependency readiness with no configuration details

Every `/api/hashpaystream` response is marked `Cache-Control: no-store` so
authenticated agreement and lifecycle responses are not retained by browsers
or intermediary caches.

API responses also return a server-generated `X-Request-ID`. Completion logs
contain only that ID, a fixed route label, normalized method, status, and
duration. Client request IDs, URLs, query strings, IPs, headers, credentials,
and payloads are not recorded by this telemetry boundary.
Authentication, gateway, and webhook failure events reuse the same request ID
while retaining fixed, secret-free event schemas.
Rejected webhooks record only their bounded error code, status, and request ID.
Valid duplicate deliveries remain idempotent successes and increment the
durable duplicate counter instead of being classified as rejections.

On `SIGTERM` or `SIGINT`, the server marks readiness unavailable before it
stops accepting traffic, closes idle connections, and gives active requests
up to 25 seconds to finish. It then exits cleanly, or closes remaining
connections and exits unsuccessfully if the bounded drain expires. Lifecycle
logs use fixed, payload-free event fields.

Render continuously probes `/readyz` and reserves 30 seconds for shutdown,
leaving the application five seconds beyond its own bounded drain. A separate
GitHub Actions monitor probes the public readiness boundary every five minutes
and fails only after three consecutive attempts. It records the Cloudflare ray
identifier when available, without logging response payloads or credentials.
GitHub Actions email or web notifications must be enabled on the workflow
owner's GitHub account for failed scheduled runs to generate direct alerts.

Creator feeds, payroll, x402 checkout, Arena, content gates, and embedded
Agent Hash UI are intentionally excluded. The server-to-server headless-agent
agreement pilot below is the only agent surface.

## Headless-agent pilot

`/api/hashpaystream/v1/agent/agreements` is a disabled-by-default,
server-to-server agreement pilot. It uses a separate Hash PayLink agentic
test project and never returns human payer-access credentials. The pilot
supports agreement create, list, read, bounded Circle Agent Wallet execution,
exact Arc approval/activation call preparation, delivery accept/dispute,
bounded payer cancellation/refund execution, transaction recording, and
confirmed status reconciliation.
HashPayStream derives the opaque upstream payer reference server-side.

Circle execution uses the Agent Wallet connected to the Hash PayLink project
owner and only calls derived from Hash PayLink's prepared agreement state.
The existing prepare, external-sign, record, and reconcile path remains
available for another compatible Arc wallet. HashPayStream and Hash PayLink
never receive its private key. Accepted deliveries enter Hash PayLink's
existing guarded operator release queue; agents never receive or execute the
operator key. Cancellation and refund remain constrained by authoritative Arc
escrow eligibility and confirmation.

The separately signed agent-project webhook receiver is
`/api/hashpaystream/v1/agent/arc-agreement-webhook`. Do not configure either
agent route with the human HashPayStream project key or webhook secret.

### Agent credential registry

Multi-agent pilot credentials are stored as peppered HMAC digests in the
standalone Postgres database. Configure
`HASHPAYSTREAM_AGENT_CREDENTIAL_PEPPER` and keep it server-side. Agent access
fails closed unless the credential registry and durable store are available.
Per-credential request limits are enforced atomically in Postgres across
instances. Sanitized metadata tracks only accepted request counts and the last
successful use time; request payloads and client IP addresses are not stored.

`npm run agent:credentials -- list` returns only sanitized credential
metadata. Create and revoke commands are dry runs unless
`--confirm-agent-credential-write` is supplied. New credentials must be
written to a new file outside the repository and are never printed:

```text
npm run agent:credentials -- create --agent-id agent_example_01 --label "Example" --requests-per-minute 120 --output-file C:\secure\agent-example.json
npm run agent:credentials -- revoke --key-id keyidvalue
```

Never commit a generated credential output file.

## Upfront pilot

Upfront is a disabled-by-default payment option owned by HashPayStream. Its
first boundary submits a validated, privacy-minimized agreement draft to
ZeroScout Agreement Intelligence. The request contains the delivery terms
needed for assessment, an opaque provider reference, requested advance
parameters, explicit data gaps, and a canonical terms hash. It does not send
the user Privy identity or treat AI output as a funding decision.

The pilot supports fixed-release drafts only. It can prove restricted advance
execution on X Layer testnet or mainnet while payment evidence remains on Arc
testnet; it does not claim or require a direct asset bridge. Arc test USDC has
no financial value and must never be described as collateral for a real-USDC
advance. ZeroScout returns evidence-bound Agreement
Intelligence and PolyDesk applies the deterministic approve, escalate, or block
policy. Approved decisions include an EIP-712 offer that HashPayStream verifies
against the intended X Layer chain, escrow contract, signer, provider, amount,
terms hash, and intelligence commitment.

The separate `/upfront` assessment surface is compiled into the app only as a
disabled pilot. It appears in navigation only when
`VITE_HASHPAYSTREAM_UPFRONT_ENABLED=true`; the server route separately requires
`HASHPAYSTREAM_UPFRONT_ENABLED=true`. Assessment never moves funds. The matching
escrow source and tests live in `contracts/`; no contract address is assumed
until an intentional deployment is completed.

The Arc recipient must be the fixed Upfront repayment router because Hash
PayLink enforces one configured Arc recipient per project. HashPayStream binds
the confirmed agreement and its onchain Arc terms hash to both the X Layer
funder and a separately selected Arc repayment recipient. This keeps a Privy
smart account on X Layer from accidentally owning an unusable Arc repayment.
Draft terms and Arc onchain terms are separate commitments and are never
treated as interchangeable.

The pilot begins with a dedicated HashPayStream treasury as the first funder.
Approved treasury or LP emails can open the private `/upfront/funding` desk;
only customer-funded, unexpired, PolyDesk-approved offers are returned. Funding
execution remains operator-controlled. Copy the verified offer to a local JSON
file and validate it without moving funds:

```text
npm run upfront:fund -- ./verified-offer.json
```

The in-app funding desk uses the approved account's embedded Privy wallet. The
same address funds the advance on X Layer, releases it after Arc protection is
verified, and credits and claims repayment on Arc. It therefore needs X Layer
OKB for advance transactions and a small Arc Testnet USDC gas balance for the
repayment transaction. No separate repayment destination is accepted.

The local operator script remains available for recovery and diagnostics.
Submitting through it requires `--execute`, a dedicated
`XLAYER_FUNDER_PRIVATE_KEY`, and the network-specific confirmation
(`FUND_XLAYER_TESTNET` or `FUND_XLAYER_MAINNET`). Never use an application or
signing-service key as the treasury key.

The production Upfront contract has no global spending cap. Each advance is
instead bounded by its protected agreement amount, signed PolyDesk percentage,
approved funding account, and explicit wallet confirmation. Public testing uses
small amounts by choice. The earlier 1-USDC / 5-USDC proof deployment is legacy
and has been replaced by the uncapped production escrow recorded in
`contracts/deployments/xlayer-mainnet.json`. Ordinary HashPayStream
Send and Receive transfers are independent from the Upfront escrow.

For a zero-downtime rotation, create a second credential with the same agent
id, update the agent backend, verify the replacement key's `lastUsedAt`, and
only then revoke the old key. Multiple active keys for one agent are supported
specifically for this overlap.

## Private analytics

The operator dashboard at `/admin/analytics` is excluded from customer
navigation. Access requires a valid Privy session whose verified email is in
the comma-separated, server-only `HASHPAYSTREAM_ADMIN_EMAILS` allowlist.
Authorization is enforced again by the API; the browser cannot grant access.

Metrics are derived at request time from the Human and Agentic Hash PayLink
agreement APIs, capped at the newest 100 agreements per project. Responses
contain aggregate statuses, funnel counts, test-USDC totals, timing averages,
release structures, and upstream latency only. They never contain identities,
wallet addresses, private payer URLs, agreement IDs, or transaction hashes.
Circle Marketplace request analytics are labeled as not recorded until a
separate privacy-reviewed event store is implemented.

The public `/stats` page uses a separate cached API projection. It includes
only created, funded, and completed agreement counts, Human and Agentic totals,
test-USDC protected and released totals, release structures, and a link to the
curated verified operating example. It excludes internal latency, timing,
status breakdowns, identities, wallets, private links, agreement identifiers,
and transaction hashes.

## Local verification

```text
npm ci
npm run typecheck
npm run test:smoke
npm run build
```

Keep `HASHPAYSTREAM_ARC_API_KEY`, webhook secrets, ownership secrets, and the
database URL server-side. Never prefix them with `VITE_`.

### Circle Agent Marketplace storefront

The Circle marketplace route is separate from the private agent agreement API.
It validates the complete request before presenting a Circle Gateway x402
payment requirement. A settled request returns a deterministic, machine-readable
fixed-agreement plan; it does not create or fund an escrow agreement and never
returns a payer credential. Marketplace payment is the API service fee only.

Configure `HASHPAYSTREAM_CIRCLE_MARKETPLACE_SELLER_ADDRESS` with a non-zero EVM
seller address. The pilot is restricted to Arc Testnet through
`HASHPAYSTREAM_CIRCLE_MARKETPLACE_FACILITATOR_URL` and charges the price in
`HASHPAYSTREAM_CIRCLE_MARKETPLACE_PRICE_USD` (default `0.01`). Keep the seller
configuration server-side.

Example request body:

```json
{
  "template": "fixed_unlock",
  "title": "Verified research delivery",
  "description": "Deliver a cited research brief for payer review.",
  "amount": "0.10",
  "recipient": "0x1111111111111111111111111111111111111111",
  "durationSeconds": 86400,
  "cancellationWindowSeconds": 900
}
```
