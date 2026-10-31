import { createHash } from 'node:crypto'

export type LegacyAgreementEvent = {
  id: string; event: string; agreementId: string; createdAt: string
  projectId?: string; data?: Record<string, unknown>
}

export type AuthoritativeAgreementSnapshot = {
  id: string; status: string; template: string; recipient: string
  durationSeconds: number; cancellationWindowSeconds: number
  chain?: null | {
    network: string; chainId: number; onchainAgreementId?: string; termsHash?: string
    amountUsdcUnits?: string; releasedUsdcUnits?: string; remainingUsdcUnits?: string; expiresAt?: string
  }
}

export type ReconciliationResult = {
  eventHash: string; agreementHash: string; event: string
  projection: 'verified' | 'blocked'; ledger: 'verified' | 'blocked'; codes: string[]
}

const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i
const HEX_32 = /^0x[a-f0-9]{64}$/i
const ADDRESS = /^0x[a-f0-9]{40}$/i
const UNITS = /^\d{1,78}$/
const TRANSACTION_HASH = /^0x[a-f0-9]{64}$/i
const MONEY_EVENTS = new Set(['agreement.activated', 'agreement.step_released', 'agreement.completed', 'agreement.refunded'])

function hash(label: string, value: string) {
  return createHash('sha256').update(label + '\0' + value).digest('hex')
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function transactionHash(event: LegacyAgreementEvent) {
  const data = object(event.data)
  for (const value of [data?.transactionHash, data?.txHash, data?.transaction_hash]) {
    const candidate = String(value ?? '').trim()
    if (TRANSACTION_HASH.test(candidate)) return candidate.toLowerCase()
  }
  return ''
}

function snapshotIsStructurallyValid(snapshot: AuthoritativeAgreementSnapshot) {
  const chain = snapshot.chain
  return AGREEMENT_ID.test(snapshot.id)
    && ['awaiting_start', 'active', 'expired', 'completed', 'cancelled', 'refunded'].includes(snapshot.status)
    && typeof snapshot.template === 'string'
    && ADDRESS.test(snapshot.recipient)
    && Number.isSafeInteger(snapshot.durationSeconds)
    && Number.isSafeInteger(snapshot.cancellationWindowSeconds)
    && Boolean(chain)
    && chain?.network === 'arc'
    && chain.chainId === 5_042_002
    && HEX_32.test(String(chain.onchainAgreementId ?? ''))
    && HEX_32.test(String(chain.termsHash ?? ''))
    && UNITS.test(String(chain.amountUsdcUnits ?? ''))
    && UNITS.test(String(chain.releasedUsdcUnits ?? ''))
    && UNITS.test(String(chain.remainingUsdcUnits ?? ''))
}

function stateSupportsEvent(event: string, snapshot: AuthoritativeAgreementSnapshot) {
  const released = BigInt(String(snapshot.chain?.releasedUsdcUnits ?? '0'))
  const remaining = BigInt(String(snapshot.chain?.remainingUsdcUnits ?? '0'))
  const amount = BigInt(String(snapshot.chain?.amountUsdcUnits ?? '0'))
  if (amount <= 0n || released < 0n || remaining < 0n || released > amount || remaining > amount || released + remaining > amount) return false
  if (event === 'agreement.activated') return ['active', 'expired', 'completed', 'refunded'].includes(snapshot.status)
  if (event === 'agreement.step_released') return released > 0n
  if (event === 'agreement.completed') return snapshot.status === 'completed' && released === amount && remaining === 0n
  if (event === 'agreement.refunded') return snapshot.status === 'refunded' && remaining === 0n
  if (event === 'agreement.expired') return ['expired', 'refunded'].includes(snapshot.status)
  if (event === 'agreement.cancelled') return snapshot.status === 'cancelled'
  return false
}

export function reconcileLegacyAgreementEvent(event: LegacyAgreementEvent, snapshot?: AuthoritativeAgreementSnapshot): ReconciliationResult {
  const eventId = String(event.id ?? '').trim()
  const agreementId = String(event.agreementId ?? '').trim()
  const codes: string[] = []
  if (!eventId || !AGREEMENT_ID.test(agreementId) || !Number.isFinite(Date.parse(String(event.createdAt ?? '')))) codes.push('LEGACY_EVENT_INVALID')
  if (!snapshot) codes.push('AUTHORITATIVE_SNAPSHOT_MISSING')
  else if (snapshot.id !== agreementId) codes.push('AGREEMENT_ID_MISMATCH')
  else if (!snapshotIsStructurallyValid(snapshot)) codes.push('AUTHORITATIVE_SNAPSHOT_INVALID')
  else if (!stateSupportsEvent(event.event, snapshot)) codes.push('AUTHORITATIVE_STATE_CONFLICT')
  const projection = codes.length === 0 ? 'verified' : 'blocked'
  if (MONEY_EVENTS.has(event.event)) {
    if (!transactionHash(event)) codes.push('CHAIN_TRANSACTION_MISSING')
    // A hash is only a candidate. Receipt status, chain, contract, token and exact
    // amounts must be independently verified before creating a ledger posting.
    codes.push('CHAIN_RECEIPT_VERIFICATION_REQUIRED')
  }
  return {
    eventHash: hash('event', eventId || `${agreementId}:${event.event}:${event.createdAt}`),
    agreementHash: hash('agreement', agreementId),
    event: String(event.event ?? ''),
    projection,
    ledger: 'blocked',
    codes: [...new Set(codes)].sort(),
  }
}

export function summarizeReconciliation(results: ReconciliationResult[]) {
  const codes: Record<string, number> = {}
  const events: Record<string, { verified: number; blocked: number }> = {}
  for (const result of results) for (const code of result.codes) codes[code] = (codes[code] ?? 0) + 1
  for (const result of results) {
    events[result.event] ??= { verified: 0, blocked: 0 }
    events[result.event][result.projection] += 1
  }
  return {
    schema: 'hashpaystream.financial-core.reconciliation.v1' as const,
    readOnly: true as const,
    eventCount: results.length,
    projectionReady: results.filter(result => result.projection === 'verified').length,
    projectionBlocked: results.filter(result => result.projection === 'blocked').length,
    ledgerReady: results.filter(result => result.ledger === 'verified').length,
    ledgerBlocked: results.filter(result => result.ledger === 'blocked').length,
    events: Object.fromEntries(Object.entries(events).sort(([left], [right]) => left.localeCompare(right))),
    codes: Object.fromEntries(Object.entries(codes).sort(([left], [right]) => left.localeCompare(right))),
  }
}
