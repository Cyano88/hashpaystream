# HashPayStream

HashPayStream is an agreements-only customer application for protected USDC
payments on Arc. It owns its customer experience, identity-to-agreement
ownership journal, and signed webhook history. Hash PayLink remains the
upstream agreement, checkout, chain-policy, lifecycle, and receipt provider.

## Product surface

- `/` public product landing
- `/docs` customer documentation
- `/agreements` authenticated agreement workspace
- `/agreements/new` agreement creation
- `/api/hashpaystream/v2/agreements` server-side Hash PayLink gateway
- `/api/hashpaystream/arc-agreement-webhook` signed lifecycle receiver
- `/api/hashpaystream/v1/agent/agreements` authenticated headless-agent gateway
- `/api/hashpaystream/v1/agent/arc-agreement-webhook` separately signed agent lifecycle receiver

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

For a zero-downtime rotation, create a second credential with the same agent
id, update the agent backend, verify the replacement key's `lastUsedAt`, and
only then revoke the old key. Multiple active keys for one agent are supported
specifically for this overlap.

## Local verification

```text
npm ci
npm run typecheck
npm run test:smoke
npm run build
```

Keep `HASHPAYSTREAM_ARC_API_KEY`, webhook secrets, ownership secrets, and the
database URL server-side. Never prefix them with `VITE_`.
