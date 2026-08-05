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
supports agreement create, list, read, exact Arc approval/activation call
preparation, delivery accept/dispute, exact payer cancellation/refund call
preparation, transaction recording, and confirmed status reconciliation.
HashPayStream derives the opaque upstream payer reference server-side.

The agent signs and broadcasts the returned calls with its own Arc wallet;
HashPayStream and Hash PayLink never receive its private key. Accepted
deliveries enter Hash PayLink's existing guarded operator release queue;
agents never receive or execute the operator key. Cancellation and refund
remain constrained by authoritative Arc escrow eligibility and confirmation.

The separately signed agent-project webhook receiver is
`/api/hashpaystream/v1/agent/arc-agreement-webhook`. Do not configure either
agent route with the human HashPayStream project key or webhook secret.

## Local verification

```text
npm ci
npm run typecheck
npm run test:smoke
npm run build
```

Before the first live cutover, temporarily set
`HASHPAYSTREAM_MIGRATION_OWNER_PRIVY_USER_ID`, run `npm run migrate:owners` as
a dry run, review the counts, and then run:

```text
npm run migrate:owners -- --confirm-hashpaystream-owner-import
```

Remove the temporary migration identity immediately afterwards.

Keep `HASHPAYSTREAM_ARC_API_KEY`, webhook secrets, ownership secrets, and the
database URL server-side. Never prefix them with `VITE_`.
