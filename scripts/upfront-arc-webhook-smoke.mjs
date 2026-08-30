import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createHashPayStreamUpfrontArcWebhookHandler } from '../api/upfront-arc-webhook.ts'

function responseRecorder() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

const now = new Date('2026-08-20T03:00:00.000Z')
const projectId = 'dev_upfrontwebhook1234'
const secret = `whsec_${'u'.repeat(32)}`
const env = {
  HASHPAYSTREAM_UPFRONT_ARC_PROJECT_ID: projectId,
  HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_SECRET: secret,
  HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY: 'test:hashpaystream:upfront-webhooks',
  HASHPAYSTREAM_ARC_PROJECT_ID: 'dev_normalproject1234',
  HASHPAYSTREAM_ARC_WEBHOOK_SECRET: `whsec_${'n'.repeat(32)}`,
}
let durableState
let settlementTriggers = 0
const securityEvents = []
const handler = createHashPayStreamUpfrontArcWebhookHandler({
  hasStore: () => true,
  mutate: async (key, update) => {
    assert.equal(key, env.HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY)
    durableState = update(durableState)
    return durableState
  },
  env: () => env,
  now: () => now,
  logEvent: event => securityEvents.push(event),
  triggerSettlement: () => { settlementTriggers += 1 },
})

function request({ signingSecret = secret, id = 'evt_upfrontwebhook123456', event = 'agreement.activated' } = {}) {
  const timestamp = Math.floor(now.getTime() / 1000)
  const body = JSON.stringify({
    id,
    event,
    createdAt: now.toISOString(),
    data: {
      partnerId: projectId,
      agreementId: 'agr_upfrontwebhook123456',
      network: 'arc',
      chainId: 5_042_002,
    },
  })
  const signature = createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex')
  return {
    method: 'POST', body: Buffer.from(body),
    headers: {
      'x-hashpaylink-event': id,
      'x-hashpaylink-signature': `t=${timestamp},v1=${signature}`,
    },
  }
}

async function call(input, selectedHandler = handler) {
  const response = responseRecorder()
  await selectedHandler(input, response)
  return response
}

const accepted = await call(request())
assert.equal(accepted.statusCode, 200)
assert.equal(durableState.events.evt_upfrontwebhook123456.projectId, projectId)
assert.equal(settlementTriggers, 0)

const completedRequest = request({ id: 'evt_upfrontcompleted12345', event: 'agreement.completed' })
const completed = await call(completedRequest)
assert.equal(completed.statusCode, 200)
assert.equal(completed.body.replayed, false)
assert.equal(settlementTriggers, 1)

const completedReplay = await call(completedRequest)
assert.equal(completedReplay.statusCode, 200)
assert.equal(completedReplay.body.replayed, true)
assert.equal(settlementTriggers, 2)

const normalProjectSignature = await call(request({ signingSecret: env.HASHPAYSTREAM_ARC_WEBHOOK_SECRET }))
assert.equal(normalProjectSignature.statusCode, 401)
assert.equal(normalProjectSignature.body.error.code, 'INVALID_SIGNATURE')
assert.equal(settlementTriggers, 2)

const failureIsolatedHandler = createHashPayStreamUpfrontArcWebhookHandler({
  hasStore: () => true,
  mutate: async (_key, update) => { durableState = update(durableState); return durableState },
  env: () => env,
  now: () => now,
  logEvent: event => securityEvents.push(event),
  triggerSettlement: () => { throw new Error('scheduler unavailable') },
})
const failureIsolated = await call(request({ id: 'evt_upfronthookfailure123', event: 'agreement.completed' }), failureIsolatedHandler)
assert.equal(failureIsolated.statusCode, 200)
assert.equal(securityEvents.some(event => event.code === 'POST_ACCEPT_FAILED'), true)

console.log('HashPayStream Upfront-project signed webhook smoke checks passed.')
