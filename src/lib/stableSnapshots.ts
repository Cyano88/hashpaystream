export type UpdatedSnapshot = { id: string; updatedAt: string }

function timestamp(value: string) {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function reconcileUpdatedSnapshots<T extends UpdatedSnapshot>(current: T[], incoming: T[], merge?: (current: T, incoming: T) => T) {
  const existing = new Map(current.map(item => [item.id, item]))
  return incoming.map(item => {
    const previous = existing.get(item.id)
    if (!previous) return item
    if (timestamp(previous.updatedAt) > timestamp(item.updatedAt)) return previous
    return merge ? merge(previous, item) : item
  })
}

export const SETTLEMENT_RETRY_DELAY_MS = 30 * 60 * 1_000

export function settlementRetryReady(observedAt: number | null, now = Date.now(), delayMs = SETTLEMENT_RETRY_DELAY_MS) {
  return observedAt !== null && now - observedAt >= delayMs
}

export function compactEvidenceReference(value: string, maximum = 42) {
  try {
    const parsed = new URL(value)
    if (!['https:', 'http:'].includes(parsed.protocol)) return 'Submitted work'
    const label = `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`
    return label.length > maximum ? `${label.slice(0, Math.max(1, maximum - 3))}...` : label
  } catch {
    return 'Submitted work'
  }
}
