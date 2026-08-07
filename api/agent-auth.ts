import type { Request } from 'express'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './durable-store.js'
import {
  AGENT_API_KEY_PATTERN,
  agentCredentialDigest,
  agentCredentialRegistryConfig,
  consumeAgentCredential,
  safeAgentCredentialStore,
} from './agent-credential-registry.js'

export type AgentAuthDependencies = {
  hasStore: () => boolean
  read: <T>(key: string) => Promise<T | undefined>
  mutate: <T>(key: string, update: (current: T | undefined) => T | Promise<T>) => Promise<T>
  now: () => Date
}

const defaultDependencies: AgentAuthDependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  mutate: mutateDurableJson,
  now: () => new Date(),
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

  let usage: ReturnType<typeof consumeAgentCredential> | undefined
  try {
    const now = dependencies.now()
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid clock')
    await dependencies.mutate(registryConfig.storeKey, value => {
      usage = consumeAgentCredential(value, { keyDigest: digest, now: now.toISOString() })
      return usage.store
    })
  } catch {
    throw httpError('HashPayStream agent access is unavailable.', 503)
  }
  if (!usage || usage.status === 'invalid') {
    throw httpError('A valid HashPayStream agent credential is required.', 401)
  }
  if (usage.status === 'rate_limited') {
    throw httpError('HashPayStream agent request limit exceeded.', 429)
  }
  return 'agent:' + usage.agentId
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
