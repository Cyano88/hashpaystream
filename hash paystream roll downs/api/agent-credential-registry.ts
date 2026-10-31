import { createHmac } from 'node:crypto'

export const DEFAULT_AGENT_CREDENTIAL_STORE_KEY = 'hashpaystream:agent-credentials:v1'
export const AGENT_ID_PATTERN = /^agent_[a-z0-9][a-z0-9_-]{7,63}$/i
export const AGENT_API_KEY_PATTERN = /^hps_agent_test_[A-Za-z0-9_-]{32,128}$/

export type AgentCredentialRecord = {
  keyId: string
  agentId: string
  label: string
  keyDigest: string
  status: 'active' | 'revoked'
  requestsPerMinute: number
  createdAt: string
  revokedAt?: string
  lastUsedAt?: string
  acceptedRequestCount: number
  rateLimitWindowStartedAt?: string
  rateLimitWindowRequestCount: number
}

export type AgentCredentialAuditEvent = {
  id: string
  action: 'credential.created' | 'credential.imported' | 'credential.revoked'
  agentId: string
  keyId: string
  createdAt: string
}

export type AgentCredentialStore = {
  schema: 1
  credentials: Record<string, AgentCredentialRecord>
  audit: AgentCredentialAuditEvent[]
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function agentCredentialRegistryConfig(env: NodeJS.ProcessEnv = process.env) {
  const pepper = String(env.HASHPAYSTREAM_AGENT_CREDENTIAL_PEPPER ?? '').trim()
  const storeKey = String(
    env.HASHPAYSTREAM_AGENT_CREDENTIAL_STORE_KEY ?? DEFAULT_AGENT_CREDENTIAL_STORE_KEY,
  ).trim()
  if (!pepper) return undefined
  if (pepper.length < 32) throw new Error('HashPayStream agent credential registry is unavailable.')
  if (!storeKey || storeKey.length > 160) throw new Error('HashPayStream agent credential registry is unavailable.')
  return { pepper, storeKey }
}

export function agentCredentialDigest(apiKey: string, pepper: string) {
  return createHmac('sha256', pepper)
    .update('hashpaystream.agent.credential\0')
    .update(apiKey)
    .digest('hex')
}

export function safeAgentCredentialStore(current: unknown): AgentCredentialStore {
  const source = current && typeof current === 'object' && !Array.isArray(current)
    ? current as Partial<AgentCredentialStore>
    : {}
  const credentials: Record<string, AgentCredentialRecord> = {}
  if (source.schema === 1 && source.credentials && typeof source.credentials === 'object') {
    for (const [digest, candidate] of Object.entries(source.credentials)) {
      if (!/^[a-f0-9]{64}$/.test(digest) || !candidate || typeof candidate !== 'object') continue
      const record = candidate as Partial<AgentCredentialRecord>
      const keyId = clean(record.keyId, 32)
      const agentId = clean(record.agentId, 70).toLowerCase()
      const label = clean(record.label, 80)
      const createdAt = clean(record.createdAt, 40)
      const revokedAt = clean(record.revokedAt, 40)
      const lastUsedAt = clean(record.lastUsedAt, 40)
      const rateLimitWindowStartedAt = clean(record.rateLimitWindowStartedAt, 40)
      const requestsPerMinute = Number(record.requestsPerMinute ?? 120)
      const acceptedRequestCount = Number(record.acceptedRequestCount ?? 0)
      const rateLimitWindowRequestCount = Number(record.rateLimitWindowRequestCount ?? 0)
      if (
        !/^[a-z0-9]{8,32}$/i.test(keyId)
        || !AGENT_ID_PATTERN.test(agentId)
        || record.keyDigest !== digest
        || !['active', 'revoked'].includes(record.status ?? '')
        || !Number.isInteger(requestsPerMinute)
        || requestsPerMinute < 1
        || requestsPerMinute > 600
        || !Number.isSafeInteger(acceptedRequestCount)
        || acceptedRequestCount < 0
        || !Number.isSafeInteger(rateLimitWindowRequestCount)
        || rateLimitWindowRequestCount < 0
        || !createdAt
      ) continue
      credentials[digest] = {
        keyId,
        agentId,
        label,
        keyDigest: digest,
        status: record.status as AgentCredentialRecord['status'],
        requestsPerMinute,
        createdAt,
        ...(record.status === 'revoked' && revokedAt ? { revokedAt } : {}),
        ...(lastUsedAt && Number.isFinite(Date.parse(lastUsedAt)) ? { lastUsedAt } : {}),
        acceptedRequestCount,
        ...(rateLimitWindowStartedAt && Number.isFinite(Date.parse(rateLimitWindowStartedAt))
          ? { rateLimitWindowStartedAt }
          : {}),
        rateLimitWindowRequestCount,
      }
    }
  }
  const audit = source.schema === 1 && Array.isArray(source.audit)
    ? source.audit.flatMap(candidate => {
        if (!candidate || typeof candidate !== 'object') return []
        const event = candidate as Partial<AgentCredentialAuditEvent>
        const id = clean(event.id, 40)
        const agentId = clean(event.agentId, 70).toLowerCase()
        const keyId = clean(event.keyId, 32)
        const createdAt = clean(event.createdAt, 40)
        if (
          !/^[a-z0-9_-]{8,40}$/i.test(id)
          || !AGENT_ID_PATTERN.test(agentId)
          || !/^[a-z0-9]{8,32}$/i.test(keyId)
          || !['credential.created', 'credential.imported', 'credential.revoked'].includes(event.action ?? '')
          || !createdAt
        ) return []
        return [{
          id,
          action: event.action as AgentCredentialAuditEvent['action'],
          agentId,
          keyId,
          createdAt,
        }]
      }).slice(-1_000)
    : []
  return { schema: 1, credentials, audit }
}

export function registerAgentCredential(
  current: unknown,
  input: {
    apiKey: string
    pepper: string
    agentId: string
    keyId: string
    label?: string
    now: string
    auditId: string
    imported?: boolean
    requestsPerMinute?: number
  },
) {
  const next = safeAgentCredentialStore(current)
  const agentId = input.agentId.trim().toLowerCase()
  if (!AGENT_ID_PATTERN.test(agentId) || !AGENT_API_KEY_PATTERN.test(input.apiKey)) {
    throw new Error('Agent credential input is invalid.')
  }
  if (!/^[a-z0-9]{8,32}$/i.test(input.keyId)) throw new Error('Agent credential key id is invalid.')
  const requestsPerMinute = Number(input.requestsPerMinute ?? 120)
  if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 600) {
    throw new Error('Agent credential request limit is invalid.')
  }
  const digest = agentCredentialDigest(input.apiKey, input.pepper)
  if (next.credentials[digest]) throw new Error('Agent credential is already registered.')
  if (Object.values(next.credentials).some(record => record.keyId === input.keyId)) {
    throw new Error('Agent credential key id is already registered.')
  }
  next.credentials[digest] = {
    keyId: input.keyId,
    agentId,
    label: clean(input.label, 80),
    keyDigest: digest,
    status: 'active',
    requestsPerMinute,
    createdAt: input.now,
    acceptedRequestCount: 0,
    rateLimitWindowRequestCount: 0,
  }
  next.audit.push({
    id: input.auditId,
    action: input.imported ? 'credential.imported' : 'credential.created',
    agentId,
    keyId: input.keyId,
    createdAt: input.now,
  })
  next.audit = next.audit.slice(-1_000)
  return next
}

export function consumeAgentCredential(
  current: unknown,
  input: { keyDigest: string; now: string },
) {
  const next = safeAgentCredentialStore(current)
  if (!/^[a-f0-9]{64}$/.test(input.keyDigest) || !Number.isFinite(Date.parse(input.now))) {
    throw new Error('Agent credential usage input is invalid.')
  }
  const record = next.credentials[input.keyDigest]
  if (!record || record.status !== 'active') {
    return { store: next, status: 'invalid' as const }
  }

  const nowMs = Date.parse(input.now)
  const existingWindowMs = record.rateLimitWindowStartedAt
    ? Date.parse(record.rateLimitWindowStartedAt)
    : Number.NaN
  const resetWindow = !Number.isFinite(existingWindowMs)
    || nowMs < existingWindowMs
    || nowMs - existingWindowMs >= 60_000
  const windowStartedAt = resetWindow ? input.now : record.rateLimitWindowStartedAt!
  const windowStartedMs = resetWindow ? nowMs : existingWindowMs
  const currentCount = resetWindow ? 0 : record.rateLimitWindowRequestCount

  if (currentCount >= record.requestsPerMinute) {
    return {
      store: next,
      status: 'rate_limited' as const,
      limit: record.requestsPerMinute,
      retryAfterSeconds: Math.max(1, Math.ceil((windowStartedMs + 60_000 - nowMs) / 1_000)),
      resetAtEpochSeconds: Math.ceil((windowStartedMs + 60_000) / 1_000),
    }
  }

  record.lastUsedAt = input.now
  record.acceptedRequestCount = Math.min(Number.MAX_SAFE_INTEGER, record.acceptedRequestCount + 1)
  record.rateLimitWindowStartedAt = windowStartedAt
  record.rateLimitWindowRequestCount = currentCount + 1
  return { store: next, status: 'accepted' as const, agentId: record.agentId }
}

export function revokeAgentCredential(
  current: unknown,
  input: { keyId: string; now: string; auditId: string },
) {
  const next = safeAgentCredentialStore(current)
  const record = Object.values(next.credentials).find(candidate => candidate.keyId === input.keyId)
  if (!record) throw new Error('Agent credential was not found.')
  if (record.status === 'revoked') return next
  record.status = 'revoked'
  record.revokedAt = input.now
  next.audit.push({
    id: input.auditId,
    action: 'credential.revoked',
    agentId: record.agentId,
    keyId: record.keyId,
    createdAt: input.now,
  })
  next.audit = next.audit.slice(-1_000)
  return next
}
