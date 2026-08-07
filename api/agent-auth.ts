import type { Request } from 'express'
import { hasRenderDurableStore, readDurableJson } from './durable-store.js'
import {
  AGENT_API_KEY_PATTERN,
  agentCredentialDigest,
  agentCredentialRegistryConfig,
  safeAgentCredentialStore,
} from './agent-credential-registry.js'

export type AgentAuthDependencies = {
  hasStore: () => boolean
  read: <T>(key: string) => Promise<T | undefined>
  consume: (key: string, limit: number) => boolean
}

const credentialBuckets = new Map<string, { count: number; resetAt: number }>()

function consumeCredentialRequest(key: string, limit: number) {
  const now = Date.now()
  const current = credentialBuckets.get(key)
  if (!current || current.resetAt <= now) {
    credentialBuckets.set(key, { count: 1, resetAt: now + 60_000 })
    return true
  }
  current.count += 1
  return current.count <= limit
}

const defaultDependencies: AgentAuthDependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  consume: consumeCredentialRequest,
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

function bearer(req: Pick<Request, 'headers'>) {
  return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
}

export async function verifiedPilotAgentIdentity(
  req: Request,
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<AgentAuthDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides }
  const presentedKey = bearer(req)
  if (!AGENT_API_KEY_PATTERN.test(presentedKey)) {
    throw httpError('A valid HashPayStream agent credential is required.', 401)
  }

  let registryConfig: ReturnType<typeof agentCredentialRegistryConfig>
  try {
    registryConfig = agentCredentialRegistryConfig(env)
  } catch {
    throw httpError('HashPayStream agent access is unavailable.', 503)
  }
  if (!registryConfig || !dependencies.hasStore()) {
    throw httpError('HashPayStream agent access is unavailable.', 503)
  }
  let current
  try {
    current = await dependencies.read(registryConfig.storeKey)
  } catch {
    throw httpError('HashPayStream agent access is unavailable.', 503)
  }
  const store = safeAgentCredentialStore(current)
  const digest = agentCredentialDigest(presentedKey, registryConfig.pepper)
  const record = store.credentials[digest]
  if (!record || record.status !== 'active') {
    throw httpError('A valid HashPayStream agent credential is required.', 401)
  }
  if (!dependencies.consume(digest, record.requestsPerMinute)) {
    throw httpError('HashPayStream agent request limit exceeded.', 429)
  }
  return `agent:${record.agentId}`
}

export function agentGatewayEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    HASHPAYSTREAM_ARC_API_KEY: env.HASHPAYSTREAM_AGENT_ARC_API_KEY,
    HASHPAYSTREAM_ARC_PROJECT_ID: env.HASHPAYSTREAM_AGENT_ARC_PROJECT_ID,
    HASHPAYSTREAM_ARC_WEBHOOK_SECRET: env.HASHPAYSTREAM_AGENT_ARC_WEBHOOK_SECRET,
    HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY: env.HASHPAYSTREAM_AGENT_ARC_WEBHOOK_STORE_KEY
      ?? 'hashpaystream:agent-arc-webhooks:v1',
  }
}
