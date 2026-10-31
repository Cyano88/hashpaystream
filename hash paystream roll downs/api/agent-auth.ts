import type { Request } from 'express'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from './durable-store.js'
import {
  AGENT_API_KEY_PATTERN,
  agentCredentialDigest,
  agentCredentialRegistryConfig,
  consumeAgentCredential,
  safeAgentCredentialStore,
} from './agent-credential-registry.js'
import { withHashPayStreamRequestId } from './request-telemetry.js'

export type AgentAuthDependencies = {
  hasStore: () => boolean
  read: <T>(key: string) => Promise<T | undefined>
  mutate: <T>(key: string, update: (current: T | undefined) => T | Promise<T>) => Promise<T>
  now: () => Date
  logSecurity: (event: AgentAuthSecurityEvent) => void
}

export type AgentAuthSecurityEvent = {
  component: 'hashpaystream-agent-auth'
  event: 'credential_rejected' | 'credential_rate_limited' | 'credential_store_unavailable'
  status: 401 | 429 | 503
  reason: string
  requestId?: string
}

const defaultDependencies: AgentAuthDependencies = {
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  mutate: mutateDurableJson,
  now: () => new Date(),
  logSecurity: event => {
    const line = JSON.stringify(event)
    if (event.status >= 500) console.error(line)
    else console.warn(line)
  },
}

function httpError(message: string, status: number, metadata: Record<string, number> = {}) {
  return Object.assign(new Error(message), { status, ...metadata })
}

function securityFailure(
  dependencies: AgentAuthDependencies,
  message: string,
  event: AgentAuthSecurityEvent,
  metadata: Record<string, number> = {},
): never {
  try {
    dependencies.logSecurity(withHashPayStreamRequestId(event))
  } catch {
    // Logging must never change the authentication result.
  }
  throw httpError(message, event.status, { ...metadata, securityLogged: 1 })
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
    securityFailure(dependencies, 'A valid HashPayStream agent credential is required.', {
      component: 'hashpaystream-agent-auth',
      event: 'credential_rejected',
      status: 401,
      reason: 'invalid_format',
    })
  }

  let registryConfig: ReturnType<typeof agentCredentialRegistryConfig>
  try {
    registryConfig = agentCredentialRegistryConfig(env)
  } catch {
    securityFailure(dependencies, 'HashPayStream agent access is unavailable.', {
      component: 'hashpaystream-agent-auth',
      event: 'credential_store_unavailable',
      status: 503,
      reason: 'invalid_registry_configuration',
    })
  }
  if (!registryConfig || !dependencies.hasStore()) {
    securityFailure(dependencies, 'HashPayStream agent access is unavailable.', {
      component: 'hashpaystream-agent-auth',
      event: 'credential_store_unavailable',
      status: 503,
      reason: !registryConfig ? 'registry_not_configured' : 'durable_store_not_configured',
    })
  }
  let current
  try {
    current = await dependencies.read(registryConfig.storeKey)
  } catch {
    securityFailure(dependencies, 'HashPayStream agent access is unavailable.', {
      component: 'hashpaystream-agent-auth',
      event: 'credential_store_unavailable',
      status: 503,
      reason: 'registry_read_failed',
    })
  }
  const store = safeAgentCredentialStore(current)
  const digest = agentCredentialDigest(presentedKey, registryConfig.pepper)
  const record = store.credentials[digest]
  if (!record || record.status !== 'active') {
    securityFailure(dependencies, 'A valid HashPayStream agent credential is required.', {
      component: 'hashpaystream-agent-auth',
      event: 'credential_rejected',
      status: 401,
      reason: 'credential_not_active',
    })
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
    securityFailure(dependencies, 'HashPayStream agent access is unavailable.', {
      component: 'hashpaystream-agent-auth',
      event: 'credential_store_unavailable',
      status: 503,
      reason: 'usage_mutation_failed',
    })
  }
  if (!usage || usage.status === 'invalid') {
    securityFailure(dependencies, 'A valid HashPayStream agent credential is required.', {
      component: 'hashpaystream-agent-auth',
      event: 'credential_rejected',
      status: 401,
      reason: 'credential_revoked_during_request',
    })
  }
  if (usage.status === 'rate_limited') {
    securityFailure(dependencies, 'HashPayStream agent request limit exceeded.', {
      component: 'hashpaystream-agent-auth',
      event: 'credential_rate_limited',
      status: 429,
      reason: 'credential_window_exhausted',
    }, {
      rateLimit: usage.limit,
      rateLimitRemaining: 0,
      rateLimitReset: usage.resetAtEpochSeconds,
      retryAfterSeconds: usage.retryAfterSeconds,
    })
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
