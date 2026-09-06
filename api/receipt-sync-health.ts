export const RECEIPT_FRESHNESS_MS = 15 * 60_000
export function receiptSyncHealth(row: { state: string; verified_at: Date | string | null } | undefined, now = Date.now()) {
  const verified = row?.verified_at ? new Date(row.verified_at).getTime() : NaN
  const age = Number.isFinite(verified) ? now - verified : null
  const ready = row?.state === 'ready' && age !== null && age >= -60_000 && age <= RECEIPT_FRESHNESS_MS
  const reason = !row ? 'MISSING' : row.state === 'blocked' ? 'BLOCKED' : row.state === 'syncing' ? 'SYNCING' : age === null || age < -60_000 ? 'INVALID_TIMESTAMP' : age > RECEIPT_FRESHNESS_MS ? 'STALE' : ready ? 'READY' : 'INVALID_STATE'
  return { ready, reason, verifiedAgeSeconds: age === null ? null : Math.floor(age / 1000) }
}

// A running cycle deliberately blocks reads; monitor liveness separately.
export function receiptSyncMonitor(row: { state: string; verified_at: Date | string | null; updated_at: Date | string } | undefined, lockHeld: boolean, now = Date.now()) {
  const read = receiptSyncHealth(row, now)
  const elapsed = row ? now - new Date(row.updated_at).getTime() : NaN
  const running = row?.state === 'syncing' && lockHeld && Number.isFinite(elapsed) && elapsed >= -60_000 && elapsed <= RECEIPT_FRESHNESS_MS
  return { ok: read.ready || running, readReady: read.ready, reason: running ? 'RUNNING' : row?.state === 'syncing' ? lockHeld ? 'SYNC_OVERDUE' : 'SYNC_ORPHANED' : read.reason, verifiedAgeSeconds: read.verifiedAgeSeconds }
}
