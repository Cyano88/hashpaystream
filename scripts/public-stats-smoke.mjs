import assert from 'node:assert/strict'
import { createHashPayStreamPublicStats } from '../api/public-stats.ts'

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
  await handler({ method, headers: {} }, response)
  return response
}

const analytics = {
  generatedAt: '2026-08-08T18:00:00.000Z', environment: 'Arc Testnet',
  scope: { ownedAgreements: 8, projects: ['human', 'upfront', 'agentic'] },
  totals: { agreements: 8, awaitingFunding: 1, active: 2, completed: 4, cancelled: 1, refunded: 0, refundAvailable: 0 },
  modes: { human: 5, upfront: 1, agentic: 2 },
  funnel: { created: 8, funded: 7, deliverySubmitted: 5, releaseApproved: 4, completed: 4 },
  structures: [{ template: 'fixed_unlock', count: 4 }, { template: 'progressive_release', count: 2 }, { template: 'milestone', count: 2 }],
  testUsdc: { protected: '0.18', released: '0.12', remaining: '0.06' },
  performance: { fundedCompletionRate: 57.1, averageFundingHours: 1, averageDeliveryReviewHours: 2 },
  daily: [{ date: '2026-08-08', created: 1, completed: 1 }],
  infrastructure: { hashPayLink: { human: { reachable: true, latencyMs: 12 }, upfront: { reachable: true, latencyMs: 15 }, agentic: { reachable: true, latencyMs: 18 } }, latestLifecycleAt: '2026-08-08T17:00:00.000Z' },
  circleMarketplace: { requestAnalyticsRecorded: false, note: 'Not recorded.' }, privacy: 'private',
}
const privateValues = ['owner@example.com', '0x1111111111111111111111111111111111111111', 'agr_private123456', 'https://private.example/review', '0xtransactionhash']
const handler = createHashPayStreamPublicStats({ analytics: async () => analytics, env: () => ({}), now: () => new Date(), logError: () => {} })
const response = await call(handler)
assert.equal(response.statusCode, 200)
assert.match(response.headers['cache-control'], /^public, max-age=60, s-maxage=300/)
assert.deepEqual(response.body.stats.agreements, { created: 8, funded: 7, completed: 4 })
assert.deepEqual(response.body.stats.participation, { human: 5, upfront: 1, agentic: 2 })
assert.deepEqual(response.body.stats.testUsdc, { protected: '0.18', released: '0.12' })
assert.equal(response.body.stats.verifiedOperation.available, true)
const serialized = JSON.stringify(response.body)
for (const forbidden of [...privateValues, 'latencyMs', 'averageFundingHours', 'daily', 'cancelled', 'remaining']) {
  assert.equal(serialized.includes(forbidden), false)
}

const method = await call(handler, 'POST')
assert.equal(method.statusCode, 405)
assert.equal(method.headers.allow, 'GET')
let logged
const unavailable = await call(createHashPayStreamPublicStats({
  analytics: async () => { throw Object.assign(new Error('private upstream detail'), { status: 502 }) },
  logError: event => { logged = event },
}))
assert.equal(unavailable.statusCode, 502)
assert.equal(unavailable.headers['cache-control'], 'no-store')
assert.equal(JSON.stringify(unavailable.body).includes('private upstream detail'), false)
assert.equal(logged.component, 'hashpaystream-public-stats')

console.log('HashPayStream public statistics privacy smoke checks passed.')
