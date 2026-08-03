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

Creator feeds, payroll, x402, Arena, content gates, and embedded agent routes
are intentionally excluded.

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
