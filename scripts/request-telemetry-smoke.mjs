import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  createHashPayStreamApiTelemetry,
  withHashPayStreamRequestId,
} from '../api/request-telemetry.ts'

function responseRecorder() {
  const response = new EventEmitter()
  response.headers = {}
  response.statusCode = 200
  response.setHeader = function setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value
    return this
  }
  return response
}

const events = []
const times = [1_000, 1_013, 2_000, 2_004]
let nextCalls = 0
const telemetry = createHashPayStreamApiTelemetry({
  requestId: () => nextCalls ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111',
  now: () => times.shift(),
  log: event => events.push(event),
})

const humanResponse = responseRecorder()
let correlatedContext
telemetry({
  method: 'GET',
  path: '/api/hashpaystream/v2/agreements',
  headers: { 'x-request-id': 'client-value-must-be-ignored' },
}, humanResponse, () => {
  correlatedContext = Promise.resolve().then(() => withHashPayStreamRequestId({ event: 'inside_request' }))
  nextCalls += 1
})
assert.deepEqual(await correlatedContext, {
  event: 'inside_request',
  requestId: '11111111-1111-4111-8111-111111111111',
})
assert.deepEqual(withHashPayStreamRequestId({ event: 'outside_request' }), { event: 'outside_request' })
humanResponse.statusCode = 401
humanResponse.emit('finish')

const unknownResponse = responseRecorder()
telemetry({ method: 'DELETE', path: '/secret-in-path-must-not-be-logged' }, unknownResponse, () => { nextCalls += 1 })
unknownResponse.statusCode = 404
unknownResponse.emit('finish')

assert.equal(nextCalls, 2)
assert.equal(humanResponse.headers['x-request-id'], '11111111-1111-4111-8111-111111111111')
assert.equal(unknownResponse.headers['x-request-id'], '22222222-2222-4222-8222-222222222222')
assert.deepEqual(events, [
  {
    component: 'hashpaystream-api',
    event: 'request_completed',
    requestId: '11111111-1111-4111-8111-111111111111',
    method: 'GET',
    route: 'human_agreements',
    status: 401,
    durationMs: 13,
  },
  {
    component: 'hashpaystream-api',
    event: 'request_completed',
    requestId: '22222222-2222-4222-8222-222222222222',
    method: 'OTHER',
    route: 'unmatched',
    status: 404,
    durationMs: 4,
  },
])
assert.equal(JSON.stringify(events).includes('client-value-must-be-ignored'), false)
assert.equal(JSON.stringify(events).includes('secret-in-path-must-not-be-logged'), false)

const routeEvents = []
const routeTelemetry = createHashPayStreamApiTelemetry({
  requestId: () => '44444444-4444-4444-8444-444444444444',
  now: () => 2_500,
  log: event => routeEvents.push(event),
})
for (const path of [
  '/api/hashpaystream/v2/agreements',
  '/api/hashpaystream/arc-agreement-webhook',
  '/api/hashpaystream/v1/agent/agreements',
  '/api/hashpaystream/v1/agent/arc-agreement-webhook',
  '/api/hashpaystream/v1/admin/analytics',
  '/api/hashpaystream/v1/funding-partners',
  '/api/hashpaystream/v1/public/stats',
]) {
  const response = responseRecorder()
  routeTelemetry({ method: 'POST', path }, response, () => {})
  response.emit('finish')
}
assert.deepEqual(routeEvents.map(event => event.route), [
  'human_agreements',
  'human_webhook',
  'agent_agreements',
  'agent_webhook',
  'admin_analytics',
  'funding_partners',
  'public_stats',
])

const loggerFailure = createHashPayStreamApiTelemetry({
  requestId: () => '33333333-3333-4333-8333-333333333333',
  now: () => 3_000,
  log: () => { throw new Error('logger unavailable') },
})
const failureResponse = responseRecorder()
loggerFailure({ method: 'POST', path: '/api/hashpaystream/v1/agent/agreements' }, failureResponse, () => {})
assert.doesNotThrow(() => failureResponse.emit('finish'))

console.log('HashPayStream API request telemetry smoke checks passed.')
