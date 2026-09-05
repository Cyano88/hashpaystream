type LegacyStoreRow = {
  storeKey: string
  value: unknown
}

type Category =
  | 'accounts'
  | 'service_requests'
  | 'human_agreements'
  | 'upfront_agreements'
  | 'agent_agreements'
  | 'arc_events'
  | 'upfront_arc_events'
  | 'agent_arc_events'
  | 'upfront_assessments'
  | 'funding_partners'
  | 'agent_credentials'
  | 'unknown'

export type LegacyFinancialInventory = {
  schema: 'hashpaystream.financial-core.inventory.v1'
  readOnly: true
  storesRead: number
  storesExpected: number
  storesMissing: number
  categories: Record<Category, { stores: number; records: number }>
  requestVersions: number
  agreementReferences: number
  lifecycleEvents: number
  moneyEventsRequiringAuthoritativeEvidence: number
  ledgerPostingsReady: 0
  issues: Record<string, number>
}

const CATEGORIES: Category[] = [
  'accounts',
  'service_requests',
  'human_agreements',
  'upfront_agreements',
  'agent_agreements',
  'arc_events',
  'upfront_arc_events',
  'agent_arc_events',
  'upfront_assessments',
  'funding_partners',
  'agent_credentials',
  'unknown',
]

const MONEY_EVENTS = new Set([
  'agreement.activated',
  'agreement.step_released',
  'agreement.completed',
  'agreement.refunded',
])

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function category(storeKey: string): Category {
  const key = storeKey.toLowerCase()
  if (key.includes('service-requests')) return 'service_requests'
  if (key.includes('human-agreement-owners')) return 'human_agreements'
  if (key.includes('upfront-agreement-owners')) return 'upfront_agreements'
  if (key.includes('agent-agreement-owners')) return 'agent_agreements'
  if (key.includes('upfront-arc-webhooks')) return 'upfront_arc_events'
  if (key.includes('agent-arc-webhooks')) return 'agent_arc_events'
  if (key.includes('arc-webhooks')) return 'arc_events'
  if (key.includes('upfront-assessments')) return 'upfront_assessments'
  if (key.includes('funding-partners')) return 'funding_partners'
  if (key.includes('agent-credentials')) return 'agent_credentials'
  if (key.includes('accounts')) return 'accounts'
  return 'unknown'
}

function collectionName(kind: Category) {
  if (kind === 'accounts') return 'accounts'
  if (kind === 'service_requests') return 'requests'
  if (kind.endsWith('_agreements')) return 'agreements'
  if (kind.endsWith('_events')) return 'events'
  if (kind === 'upfront_assessments') return 'records'
  if (kind === 'funding_partners') return 'applications'
  if (kind === 'agent_credentials') return 'credentials'
  return ''
}

function addIssue(issues: Record<string, number>, code: string) {
  issues[code] = (issues[code] ?? 0) + 1
}

export function inventoryLegacyFinancialStores(
  rows: LegacyStoreRow[],
  expectedStores = rows.length,
): LegacyFinancialInventory {
  const categories = Object.fromEntries(CATEGORIES.map(name => [name, { stores: 0, records: 0 }])) as LegacyFinancialInventory['categories']
  const issues: Record<string, number> = {}
  const agreementReferences = new Set<string>()
  let requestVersions = 0
  let lifecycleEvents = 0
  let moneyEventsRequiringAuthoritativeEvidence = 0

  for (const row of rows) {
    const kind = category(String(row.storeKey ?? ''))
    categories[kind].stores += 1
    const store = object(row.value)
    if (!store || store.schema !== 1) {
      addIssue(issues, 'LEGACY_SCHEMA_INVALID')
      continue
    }
    const collectionKey = collectionName(kind)
    const collection = collectionKey ? object(store[collectionKey]) : undefined
    if (!collection) {
      addIssue(issues, kind === 'unknown' ? 'LEGACY_STORE_UNKNOWN' : 'LEGACY_COLLECTION_INVALID')
      continue
    }
    const records = Object.entries(collection)
    categories[kind].records += records.length

    if (kind === 'service_requests') {
      for (const [, value] of records) {
        const request = object(value)
        const versions = Array.isArray(request?.terms) ? request.terms : []
        requestVersions += versions.length
        if (!request || versions.length === 0 || Number(request.activeVersion) !== versions.length) {
          addIssue(issues, 'REQUEST_VERSION_INCONSISTENT')
        }
        const agreementId = String(request?.agreementId ?? '').trim()
        if (agreementId) agreementReferences.add(agreementId)
      }
    }

    if (kind.endsWith('_agreements')) {
      for (const [mapKey, value] of records) {
        const agreement = object(value)
        const agreementId = String(agreement?.agreementId ?? mapKey).trim()
        if (agreementId) agreementReferences.add(agreementId)
        else addIssue(issues, 'AGREEMENT_REFERENCE_INVALID')
      }
    }

    if (kind.endsWith('_events')) {
      for (const [, value] of records) {
        const event = object(value)
        const eventName = String(event?.event ?? '').trim()
        if (!eventName) {
          addIssue(issues, 'LIFECYCLE_EVENT_INVALID')
          continue
        }
        lifecycleEvents += 1
        if (MONEY_EVENTS.has(eventName)) moneyEventsRequiringAuthoritativeEvidence += 1
      }
    }
  }

  const normalizedExpected = Number.isSafeInteger(expectedStores) && expectedStores >= rows.length
    ? expectedStores
    : rows.length
  return {
    schema: 'hashpaystream.financial-core.inventory.v1',
    readOnly: true,
    storesRead: rows.length,
    storesExpected: normalizedExpected,
    storesMissing: normalizedExpected - rows.length,
    categories,
    requestVersions,
    agreementReferences: agreementReferences.size,
    lifecycleEvents,
    moneyEventsRequiringAuthoritativeEvidence,
    ledgerPostingsReady: 0,
    issues: Object.fromEntries(Object.entries(issues).sort(([left], [right]) => left.localeCompare(right))),
  }
}
