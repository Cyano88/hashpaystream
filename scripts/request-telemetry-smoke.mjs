import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createHashPayStreamApiTelemetry } from '../api/request-telemetry.ts'

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
telemetry({
  method: 'GET',
  path: '/v2/agreements',
  headers: { 'x-request-id': 'client-value-must-be-ignored' },
}, humanResponse, () => { nextCalls += 1 })
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

const loggerFailure = createHashPayStreamApiTelemetry({
  requestId: () => '33333333-3333-4333-8333-333333333333',
  now: () => 3_000,
  log: () => { throw new Error('logger unavailable') },
})
const failureResponse = responseRecorder()
loggerFailure({ method: 'POST', path: '/v1/agent/agreements' }, failureResponse, () => {})
assert.doesNotThrow(() => failureResponse.emit('finish'))

console.log('HashPayStream API request telemetry smoke checks passed.')
