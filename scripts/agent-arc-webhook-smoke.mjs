import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createHashPayStreamAgentArcWebhookHandler } from '../api/agent-arc-webhook.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

const now = new Date('2026-08-04T12:00:00.000Z')
const projectId = 'dev_agentwebhook1234'
const secret = `whsec_${'a'.repeat(32)}`
const env = {
  HASHPAYSTREAM_AGENT_ARC_PROJECT_ID: projectId,
  HASHPAYSTREAM_AGENT_ARC_WEBHOOK_SECRET: secret,
  HASHPAYSTREAM_AGENT_ARC_WEBHOOK_STORE_KEY: 'test:hashpaystream:agent-webhooks',
}
let durableState
const securityEvents = []
const handler = createHashPayStreamAgentArcWebhookHandler({
  hasStore: () => true,
  mutate: async (key, update) => {
    assert.equal(key, env.HASHPAYSTREAM_AGENT_ARC_WEBHOOK_STORE_KEY)
    durableState = update(durableState)
    return durableState
  },
  env: () => env,
  now: () => now,
  logEvent: event => securityEvents.push(event),
})

function request(signingSecret = secret) {
  const id = 'evt_agentwebhook12345678'
  const timestamp = Math.floor(now.getTime() / 1000)
  const body = JSON.stringify({
    id,
    event: 'agreement.activated',
    createdAt: now.toISOString(),
    data: {
      partnerId: projectId,
      agreementId: 'agr_agentwebhook12345678',
      network: 'arc',
      chainId: 5_042_002,
    },
  })
  const signature = createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex')
  return {
    method: 'POST',
    body: Buffer.from(body),
    headers: {
      'x-hashpaylink-event': id,
      'x-hashpaylink-signature': `t=${timestamp},v1=${signature}`,
    },
  }
}

async function call(input) {
  const response = responseRecorder()
  await handler(input, response)
  return response
}

const accepted = await call(request())
assert.equal(accepted.statusCode, 200)
assert.equal(accepted.body.replayed, false)
assert.equal(durableState.events.evt_agentwebhook12345678.projectId, projectId)

const humanProjectSignature = await call(request(`whsec_${'b'.repeat(32)}`))
assert.equal(humanProjectSignature.statusCode, 401)
assert.equal(humanProjectSignature.body.error.code, 'INVALID_SIGNATURE')
assert.deepEqual(securityEvents, [{
  component: 'hashpaystream-arc-webhook',
  event: 'request_rejected',
  status: 401,
  code: 'INVALID_SIGNATURE',
}])
assert.equal(JSON.stringify(securityEvents).includes(secret), false)

console.log('HashPayStream agent-project signed webhook smoke checks passed.')
