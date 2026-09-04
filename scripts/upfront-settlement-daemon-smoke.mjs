import assert from 'node:assert/strict'
import { createUpfrontSettlementDaemon } from '../api/upfront-settlement-daemon.ts'

const emptyResult = { eligible: 0, settled: 0, alreadySettled: 0, deferred: 0, codes: [] }
const scheduled = []
const cancelled = []
const events = []
let leaseHeld = false
let passCount = 0
let releaseCount = 0

const daemon = createUpfrontSettlementDaemon({
  acquireLease: async () => {
    if (leaseHeld) return { acquired: false, release: async () => {} }
    leaseHeld = true
    return {
      acquired: true,
      release: async () => {
        leaseHeld = false
        releaseCount += 1
      },
    }
  },
  runPass: async () => {
    passCount += 1
    return emptyResult
  },
  schedule: (callback, delayMs) => {
    const timer = { callback, delayMs, unref() {} }
    scheduled.push(timer)
    return timer
  },
  cancel: timer => { cancelled.push(timer) },
  log: event => events.push(event),
}, 5)

daemon.start()
await new Promise(resolve => setImmediate(resolve))
assert.equal(passCount, 1)
assert.equal(releaseCount, 1)
assert.equal(scheduled.at(-1).delayMs, 10_000)

daemon.trigger()
await new Promise(resolve => setImmediate(resolve))
assert.equal(passCount, 2)
assert.equal(releaseCount, 2)

await daemon.stop()
assert.ok(cancelled.length >= 1)

let blockedPasses = 0
const blockedSchedules = []
const blocked = createUpfrontSettlementDaemon({
  acquireLease: async () => ({ acquired: false, release: async () => { throw new Error('must not release') } }),
  runPass: async () => { blockedPasses += 1; return emptyResult },
  schedule: (callback, delayMs) => {
    const timer = { callback, delayMs, unref() {} }
    blockedSchedules.push(timer)
    return timer
  },
  cancel: () => {},
  log: () => {},
})
blocked.start()
await new Promise(resolve => setImmediate(resolve))
assert.equal(blockedPasses, 0)
assert.equal(blockedSchedules.length, 1)
await blocked.stop()

const retrySchedules = []
const retryEvents = []
const retrying = createUpfrontSettlementDaemon({
  acquireLease: async () => ({ acquired: true, release: async () => {} }),
  runPass: async () => ({ ...emptyResult, deferred: 1, codes: ['RELAYER_GAS_UNAVAILABLE'] }),
  schedule: (callback, delayMs) => {
    const timer = { callback, delayMs, unref() {} }
    retrySchedules.push(timer)
    return timer
  },
  cancel: () => {},
  log: event => retryEvents.push(event),
}, 30_000)
retrying.start()
await new Promise(resolve => setImmediate(resolve))
assert.equal(retrySchedules.at(-1).delayMs, 30_000)
assert.equal(retryEvents.at(-1).event, 'settlement_deferred')
await retrying.stop()

assert.equal(events.length, 0)
console.log('HashPayStream isolated settlement daemon lease and retry checks passed.')
