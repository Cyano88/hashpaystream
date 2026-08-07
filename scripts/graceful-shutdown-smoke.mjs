import assert from 'node:assert/strict'
import { createHashPayStreamShutdown } from '../api/graceful-shutdown.ts'

function harness(overrides = {}) {
  const calls = { close: 0, idle: 0, all: 0, draining: 0, cancel: 0, unref: 0 }
  const exits = []
  const events = []
  let closeCallback
  let timeoutCallback
  const dependencies = {
    server: {
      close(callback) {
        assert.equal(calls.draining, 1, 'Readiness must flip before the server stops accepting traffic.')
        calls.close += 1
        closeCallback = callback
      },
      closeIdleConnections() { calls.idle += 1 },
      closeAllConnections() { calls.all += 1 },
    },
    onDraining() { calls.draining += 1 },
    schedule(callback, delay) {
      assert.equal(delay, 25_000)
      timeoutCallback = callback
      return { unref() { calls.unref += 1 } }
    },
    cancel() { calls.cancel += 1 },
    exit(code) { exits.push(code) },
    log(event) { events.push(event) },
    ...overrides,
  }
  return {
    shutdown: createHashPayStreamShutdown(dependencies, 25_000),
    calls,
    exits,
    events,
    close: error => closeCallback(error),
    force: () => timeoutCallback(),
  }
}

const normal = harness()
assert.equal(normal.shutdown('SIGTERM'), true)
assert.equal(normal.shutdown('SIGINT'), false)
assert.deepEqual(normal.calls, { close: 1, idle: 1, all: 0, draining: 1, cancel: 0, unref: 1 })
normal.close()
assert.deepEqual(normal.exits, [0])
assert.equal(normal.calls.cancel, 1)
assert.deepEqual(normal.events, [
  { component: 'hashpaystream-lifecycle', event: 'shutdown_started', signal: 'SIGTERM', graceMs: 25_000 },
  { component: 'hashpaystream-lifecycle', event: 'shutdown_complete', signal: 'SIGTERM' },
])

const failed = harness()
failed.shutdown('SIGINT')
failed.close(new Error('private runtime detail'))
assert.deepEqual(failed.exits, [1])
assert.equal(JSON.stringify(failed.events).includes('private runtime detail'), false)
assert.equal(failed.events.at(-1).event, 'shutdown_failed')

const forced = harness()
forced.shutdown('SIGTERM')
forced.force()
assert.deepEqual(forced.exits, [1])
assert.equal(forced.calls.all, 1)
assert.equal(forced.events.at(-1).event, 'shutdown_forced')
forced.close()
assert.deepEqual(forced.exits, [1], 'A late close callback must not exit twice.')

const loggerFailure = harness({ log() { throw new Error('logger unavailable') } })
loggerFailure.shutdown('SIGTERM')
loggerFailure.close()
assert.deepEqual(loggerFailure.exits, [0])

console.log('HashPayStream graceful shutdown smoke checks passed.')
