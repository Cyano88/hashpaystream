import assert from 'node:assert/strict'
import { createHashPayStreamReadinessHandler } from '../api/readiness.ts'

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

async function call(handler, method = 'GET') {
  const response = responseRecorder()
  await handler({ method }, response)
  return response
}

const reads = []
const events = []
const ready = createHashPayStreamReadinessHandler({
  hasStore: () => true,
  read: async key => { reads.push(key); return undefined },
  env: () => ({
    HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY: 'test:hashpaystream:owners',
    HASHPAYSTREAM_AGENT_CREDENTIAL_PEPPER: 'readiness-registry-pepper-longer-than-thirty-two-characters',
    HASHPAYSTREAM_AGENT_CREDENTIAL_STORE_KEY: 'test:hashpaystream:credentials',
  }),
  logError: event => events.push(event),
})
const accepted = await call(ready)
assert.equal(accepted.statusCode, 200)
assert.deepEqual(accepted.body, { ok: true, service: 'hashpaystream', status: 'ready' })
assert.deepEqual(reads, ['test:hashpaystream:owners', 'test:hashpaystream:credentials'])
assert.equal(accepted.headers['cache-control'], 'no-store')
assert.equal(events.length, 0)

const disabledPilot = createHashPayStreamReadinessHandler({
  hasStore: () => true,
  read: async key => { assert.equal(key, 'hashpaystream:agreement-owners:v1'); return undefined },
  env: () => ({}),
})
assert.equal((await call(disabledPilot)).statusCode, 200)

const unavailableEvents = []
const unavailable = createHashPayStreamReadinessHandler({
  hasStore: () => false,
  env: () => ({ SECRET_VALUE: 'must-not-be-logged' }),
  logError: event => unavailableEvents.push(event),
})
const rejected = await call(unavailable)
assert.equal(rejected.statusCode, 503)
assert.deepEqual(rejected.body, { ok: false, service: 'hashpaystream', status: 'unavailable' })
assert.deepEqual(unavailableEvents, [{
  component: 'hashpaystream-readiness',
  event: 'dependency_unavailable',
  status: 503,
}])
assert.equal(JSON.stringify(unavailableEvents).includes('must-not-be-logged'), false)

const invalidMethod = await call(ready, 'POST')
assert.equal(invalidMethod.statusCode, 405)
assert.equal(invalidMethod.headers.allow, 'GET')

console.log('HashPayStream readiness smoke checks passed.')
