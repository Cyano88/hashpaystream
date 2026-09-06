import assert from 'node:assert/strict'
import { receiptSyncHealth, receiptSyncMonitor, RECEIPT_FRESHNESS_MS } from '../api/receipt-sync-health.ts'
const now = Date.parse('2026-09-06T00:00:00Z')
const row = (age, state = 'ready') => ({ state, verified_at: new Date(now - age) })
assert.equal(receiptSyncHealth(row(RECEIPT_FRESHNESS_MS), now).ready, true)
assert.equal(receiptSyncHealth(row(RECEIPT_FRESHNESS_MS + 1), now).reason, 'STALE')
assert.equal(receiptSyncHealth(row(-60_001), now).reason, 'INVALID_TIMESTAMP')
assert.equal(receiptSyncHealth(row(0, 'syncing'), now).ready, false)
assert.equal(receiptSyncHealth(row(0, 'blocked'), now).ready, false)
assert.equal(receiptSyncHealth(undefined, now).reason, 'MISSING')
assert.equal(receiptSyncHealth({ state: 'ready', verified_at: 'invalid' }, now).ready, false)
assert.equal(receiptSyncHealth(row(0), now).ready, true)
console.log('Receipt sync freshness boundary checks passed.')
const active = { ...row(1_000_000, 'syncing'), updated_at: new Date(now - 60_000) }
assert.deepEqual(receiptSyncMonitor(active, true, now), { ok: true, readReady: false, reason: 'RUNNING', verifiedAgeSeconds: 1000 })
assert.equal(receiptSyncMonitor(active, false, now).reason, 'SYNC_ORPHANED')
assert.equal(receiptSyncMonitor({ ...active, updated_at: new Date(now - RECEIPT_FRESHNESS_MS - 1) }, true, now).reason, 'SYNC_OVERDUE')
