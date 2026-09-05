import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inventoryLegacyFinancialStores } from '../api/financial-core-inventory.ts'

const privateEmail = 'private-user@example.com'
const privateWallet = '0x1111111111111111111111111111111111111111'
const report = inventoryLegacyFinancialStores([
  {
    storeKey: 'hashpaystream:service-requests:v1',
    value: {
      schema: 1,
      requests: {
        req_one: {
          activeVersion: 2,
          agreementId: 'agr_one000000000',
          terms: [
            { version: 1, providerEmail: privateEmail },
            { version: 2, providerWallet: privateWallet },
          ],
        },
      },
      idempotency: {},
    },
  },
  {
    storeKey: 'hashpaystream:human-agreement-owners:v1',
    value: {
      schema: 1,
      agreements: {
        agr_one000000000: { agreementId: 'agr_one000000000', ownerEmail: privateEmail },
        agr_two000000000: { agreementId: 'agr_two000000000', wallet: privateWallet },
      },
      idempotency: {},
    },
  },
  {
    storeKey: 'hashpaystream:arc-webhooks:v1',
    value: {
      schema: 1,
      events: {
        evt_one000000000: { event: 'agreement.activated', agreementId: 'agr_one000000000' },
        evt_two000000000: { event: 'agreement.refunded', agreementId: 'agr_two000000000' },
        evt_three0000000: { event: 'agreement.expired', agreementId: 'agr_two000000000' },
      },
    },
  },
  {
    storeKey: 'hashpaystream:unknown-private-store:v1',
    value: { schema: 2, secret: 'must-not-leak' },
  },
], 5)

assert.equal(report.readOnly, true)
assert.equal(report.storesRead, 4)
assert.equal(report.storesExpected, 5)
assert.equal(report.storesMissing, 1)
assert.equal(report.categories.service_requests.records, 1)
assert.equal(report.categories.human_agreements.records, 2)
assert.equal(report.categories.arc_events.records, 3)
assert.equal(report.requestVersions, 2)
assert.equal(report.agreementReferences, 2)
assert.equal(report.lifecycleEvents, 3)
assert.equal(report.moneyEventsRequiringAuthoritativeEvidence, 2)
assert.equal(report.ledgerPostingsReady, 0)
assert.equal(report.issues.LEGACY_SCHEMA_INVALID, 1)

const serialized = JSON.stringify(report)
assert.equal(serialized.includes(privateEmail), false)
assert.equal(serialized.includes(privateWallet), false)
assert.equal(serialized.includes('must-not-leak'), false)
assert.equal(serialized.includes('agr_one'), false)

const migration = readFileSync(new URL('../api/migrations/002_workflow_projections.sql', import.meta.url), 'utf8')
for (const required of [
  'hashpaystream.service_requests',
  'hashpaystream.service_request_versions',
  'hashpaystream.agreements',
  'hashpaystream.agreement_projections',
  'hashpaystream.chain_observations',
  'guard_domain_event_append_only',
  'APPEND_ONLY_RECORD_IMMUTABLE',
  'SERVICE_REQUEST_VERSION_REGRESSION',
  'AGREEMENT_IDENTITY_IMMUTABLE',
  'AGREEMENT_PROJECTION_SOURCE_CONFLICT',
  'COMMAND_IDENTITY_IMMUTABLE',
  'WEBHOOK_INBOX_IDENTITY_IMMUTABLE',
  'OUTBOX_IDENTITY_IMMUTABLE',
  'AGREEMENT_PROJECTION_IMMUTABLE',
  'foreign key (identity_domain, request_id)',
  "jsonb_typeof(terms) = 'object'",
  "jsonb_typeof(projection) = 'object'",
  'observation_type, block_hash',
]) assert.ok(migration.includes(required), 'Missing workflow invariant: ' + required)

const runner = readFileSync(new URL('./audit-financial-core-data.mjs', import.meta.url), 'utf8')
assert.match(runner, /connectionTimeoutMillis: 10_000/)
assert.match(runner, /begin transaction read only/)
assert.match(runner, /select store_key, value from render_durable_kv/)
assert.match(runner, /STORE_KEY_DOMAINS_NOT_DISTINCT/)
assert.doesNotMatch(runner, /client\.query\(\s*['\"](?:insert|update|delete|alter|create|drop|truncate)\b/i)

console.log('HashPayStream privacy-safe legacy inventory and workflow projection checks passed.')
