import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createHashPayStreamArcWebhookHandler } from '../api/arc-agreement-webhook.ts'

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

const projectId = 'dev_hashpaystream1234'
const secret = `whsec_${'a'.repeat(32)}`
const now = new Date('2026-08-03T12:00:00.000Z')
let durableState
const securityEvents = []

const dependencies = {
  hasStore: () => true,
  mutate: async (_key, update) => {
    durableState = update(durableState)
    return durableState
  },
  env: () => ({
    HASHPAYSTREAM_ARC_PROJECT_ID: projectId,
    HASHPAYSTREAM_ARC_WEBHOOK_SECRET: secret,
    HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY: 'test:hashpaystream:webhooks',
  }),
  now: () => now,
  logEvent: event => securityEvents.push(event),
}

function signedRequest(input = {}) {
  const id = input.id ?? 'evt_hashpaystream12345678'
  const event = input.event ?? 'agreement.activated'
  const createdAt = input.createdAt ?? now.toISOString()
  const timestamp = input.timestamp ?? Math.floor(now.getTime() / 1000)
  const payload = JSON.stringify({
    id,
    event,
    createdAt,
    data: {
      partnerId: input.projectId ?? projectId,
      agreementId: input.agreementId ?? 'agr_hashpaystream12345678',
      network: input.network ?? 'arc',
      chainId: input.chainId ?? 5_042_002,
      status: input.status ?? 'active',
    },
  })
  const signature = input.signature ?? createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')
  return {
    method: 'POST',
    body: Buffer.from(payload),
    headers: {
      'x-hashpaylink-event': input.headerId ?? id,
      'x-hashpaylink-signature': `t=${timestamp},v1=${signature}`,
    },
  }
}

async function call(handler, request) {
  const response = responseRecorder()
  await handler(request, response)
  return response
}

const firstHandler = createHashPayStreamArcWebhookHandler(dependencies)
const accepted = await call(firstHandler, signedRequest())
assert.equal(accepted.statusCode, 200)
assert.equal(accepted.body.replayed, false)
assert.equal(durableState.events.evt_hashpaystream12345678.duplicateCount, 0)
assert.equal('signature' in durableState.events.evt_hashpaystream12345678, false)

// Recreate the handler while retaining only the injected durable state. This
// exercises the restart boundary: replay detection must come from storage,
// not handler-local memory.
const restartedHandler = createHashPayStreamArcWebhookHandler(dependencies)
const replayed = await call(restartedHandler, signedRequest())
assert.equal(replayed.statusCode, 200)
assert.equal(replayed.body.replayed, true)
assert.equal(durableState.events.evt_hashpaystream12345678.duplicateCount, 1)

const invalidSignature = await call(restartedHandler, signedRequest({
  id: 'evt_invalidsignature12345',
  signature: '0'.repeat(64),
}))
assert.equal(invalidSignature.statusCode, 401)
assert.equal(invalidSignature.body.error.code, 'INVALID_SIGNATURE')

const stale = await call(restartedHandler, signedRequest({
  id: 'evt_stalesignature123456',
  timestamp: Math.floor(now.getTime() / 1000) - 301,
}))
assert.equal(stale.statusCode, 401)
assert.equal(stale.body.error.code, 'STALE_SIGNATURE')

const wrongProject = await call(restartedHandler, signedRequest({
  id: 'evt_wrongproject12345678',
  projectId: 'dev_otherproject1234',
}))
assert.equal(wrongProject.statusCode, 403)
assert.equal(wrongProject.body.error.code, 'PROJECT_MISMATCH')

const wrongNetwork = await call(restartedHandler, signedRequest({
  id: 'evt_wrongnetwork12345678',
  network: 'base',
  chainId: 8453,
}))
assert.equal(wrongNetwork.statusCode, 400)
assert.equal(wrongNetwork.body.error.code, 'NETWORK_MISMATCH')

const unsupported = await call(restartedHandler, signedRequest({
  id: 'evt_unsupported12345678',
  event: 'payment.confirmed',
}))
assert.equal(unsupported.statusCode, 400)
assert.equal(unsupported.body.error.code, 'UNSUPPORTED_EVENT')

const nonRawBody = await call(restartedHandler, {
  ...signedRequest({ id: 'evt_nonrawbody123456789' }),
  body: {},
})
assert.equal(nonRawBody.statusCode, 400)
assert.equal(nonRawBody.body.error.code, 'INVALID_BODY')

const conflict = await call(restartedHandler, signedRequest({
  id: 'evt_hashpaystream12345678',
  status: 'completed',
}))
assert.equal(conflict.statusCode, 409)
assert.equal(conflict.body.error.code, 'EVENT_CONFLICT')

const invalidMethod = await call(restartedHandler, { method: 'GET', headers: {}, body: Buffer.alloc(0) })
assert.equal(invalidMethod.statusCode, 405)
assert.equal(invalidMethod.headers.allow, 'POST')

assert.deepEqual(securityEvents.map(event => [event.status, event.code]), [
  [401, 'INVALID_SIGNATURE'],
  [401, 'STALE_SIGNATURE'],
  [403, 'PROJECT_MISMATCH'],
  [400, 'NETWORK_MISMATCH'],
  [400, 'UNSUPPORTED_EVENT'],
  [400, 'INVALID_BODY'],
  [409, 'EVENT_CONFLICT'],
  [405, 'METHOD_NOT_ALLOWED'],
])
assert.equal(securityEvents.every(event => event.event === 'request_rejected'), true)
const serializedEvents = JSON.stringify(securityEvents)
assert.equal(serializedEvents.includes(secret), false)
assert.equal(serializedEvents.includes('evt_invalidsignature12345'), false)
assert.equal(serializedEvents.includes('0'.repeat(64)), false)

const loggerFailureHandler = createHashPayStreamArcWebhookHandler({
  ...dependencies,
  logEvent: () => { throw new Error('logger unavailable') },
})
const loggerFailure = await call(loggerFailureHandler, signedRequest({
  id: 'evt_loggerfailure1234567',
  signature: '0'.repeat(64),
}))
assert.equal(loggerFailure.statusCode, 401)

console.log('HashPayStream standalone Arc webhook smoke checks passed.')
