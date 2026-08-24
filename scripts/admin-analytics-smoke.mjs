import assert from 'node:assert/strict'
import { createHashPayStreamAdminAnalytics } from '../api/admin-analytics.ts'

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}
async function call(handler, method = 'GET') {
  const response = responseRecorder()
  await handler({ method, headers: { authorization: 'Bearer private-session' } }, response)
  return response
}

const privateValues = ['owner@example.com', '0xprivatewallet', 'agr_private123456', 'https://private.example/review', '0xtransaction']
const human = [{
  id: privateValues[2], title: 'Private title', recipient: privateValues[1], payerReviewPath: privateValues[3],
  status: 'completed', template: 'fixed_unlock', createdAt: '2026-08-07T10:00:00.000Z',
  chain: { amountUsdcUnits: '100000', releasedUsdcUnits: '100000', remainingUsdcUnits: '0', transactionHash: privateValues[4] },
  timeline: [
    { event: 'agreement.activated', createdAt: '2026-08-07T11:00:00.000Z' },
    { event: 'agreement.completed', createdAt: '2026-08-07T13:01:00.000Z' },
  ],
  deliveryTimeline: [
    { event: 'delivery.submitted', createdAt: '2026-08-07T12:00:00.000Z' },
    { event: 'delivery.release_approved', createdAt: '2026-08-07T13:00:00.000Z' },
  ],
}, {
  id: 'agr_waiting123456', status: 'awaiting_start', template: 'milestone', createdAt: '2026-08-08T09:00:00.000Z', timeline: [], deliveryTimeline: [],
}]
const agentic = [{
  id: 'agr_agentic123456', status: 'active', template: 'progressive_release', createdAt: '2026-08-08T10:00:00.000Z',
  chain: { amountUsdcUnits: '200000', releasedUsdcUnits: '50000', remainingUsdcUnits: '150000' },
  timeline: [{ event: 'agreement.activated', createdAt: '2026-08-08T10:30:00.000Z' }], deliveryTimeline: [],
}]
const env = { HASHPAYSTREAM_ADMIN_EMAILS: 'OWNER@example.com' }
const modes = []
const handler = createHashPayStreamAdminAnalytics({
  env: () => env,
  now: () => new Date('2026-08-08T15:00:00.000Z'),
  identityEmails: async () => [privateValues[0]],
  ownership: async () => ({ schema: 1, agreements: Object.fromEntries([...human, ...agentic].map(agreement => [agreement.id, { agreementId: agreement.id }])) }),
  upstream: async mode => {
    modes.push(mode)
    return { status: 200, body: { ok: true, agreements: mode === 'human' ? human : mode === 'agentic' ? agentic : [] }, latencyMs: mode === 'human' ? 12 : mode === 'upfront' ? 15 : 18 }
  },
  logError: () => {},
})
const allowed = await call(handler)
assert.equal(allowed.statusCode, 200)
assert.equal(allowed.headers['cache-control'], 'no-store')
assert.deepEqual(modes.sort(), ['agentic', 'human', 'upfront'])
assert.equal(allowed.body.analytics.totals.agreements, 3)
assert.equal(allowed.body.analytics.totals.completed, 1)
assert.equal(allowed.body.analytics.totals.awaitingFunding, 1)
assert.equal(allowed.body.analytics.funnel.funded, 2)
assert.equal(allowed.body.analytics.funnel.deliverySubmitted, 1)
assert.equal(allowed.body.analytics.testUsdc.protected, '0.3')
assert.equal(allowed.body.analytics.testUsdc.released, '0.15')
assert.equal(allowed.body.analytics.testUsdc.remaining, '0.15')
assert.equal(allowed.body.analytics.performance.fundedCompletionRate, 50)
assert.equal(allowed.body.analytics.performance.averageFundingHours, 0.8)
assert.equal(allowed.body.analytics.performance.averageDeliveryReviewHours, 1)
assert.equal(allowed.body.analytics.daily.at(-1).created, 2)
assert.equal(allowed.body.analytics.circleMarketplace.requestAnalyticsRecorded, false)
const serialized = JSON.stringify(allowed.body)
for (const value of privateValues) assert.equal(serialized.includes(value), false)

let forbiddenUpstreamCalls = 0
const forbidden = await call(createHashPayStreamAdminAnalytics({
  env: () => env,
  identityEmails: async () => ['other@example.com'],
  upstream: async () => { forbiddenUpstreamCalls += 1; throw new Error('must not run') },
  logError: () => {},
}))
assert.equal(forbidden.statusCode, 403)
assert.equal(forbiddenUpstreamCalls, 0)
assert.equal(JSON.stringify(forbidden.body).includes(privateValues[0]), false)

const unavailable = await call(createHashPayStreamAdminAnalytics({
  env: () => ({}), identityEmails: async () => [privateValues[0]], logError: () => {},
}))
assert.equal(unavailable.statusCode, 503)
const badUpstream = await call(createHashPayStreamAdminAnalytics({
  env: () => env, identityEmails: async () => [privateValues[0]],
  upstream: async () => ({ status: 502, body: {}, latencyMs: 5 }), logError: () => {},
}))
assert.equal(badUpstream.statusCode, 502)
const method = await call(handler, 'POST')
assert.equal(method.statusCode, 405)
assert.equal(method.headers.allow, 'GET')

console.log('HashPayStream private admin analytics smoke checks passed.')
