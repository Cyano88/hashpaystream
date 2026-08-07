import type { Request, Response } from 'express'
import { hasRenderDurableStore, readDurableJson } from './durable-store.js'
import { agentCredentialRegistryConfig } from './agent-credential-registry.js'

const DEFAULT_OWNERSHIP_STORE_KEY = 'hashpaystream:agreement-owners:v1'

export type ReadinessDependencies = {
  isDraining: () => boolean
  hasStore: () => boolean
  read: <T>(key: string) => Promise<T | undefined>
  env: () => NodeJS.ProcessEnv
  logError: (event: {
    component: 'hashpaystream-readiness'
    event: 'dependency_unavailable'
    status: 503
  }) => void
}

const defaults: ReadinessDependencies = {
  isDraining: () => false,
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  env: () => process.env,
  logError: event => console.error(JSON.stringify(event)),
}

export function createHashPayStreamReadinessHandler(
  overrides: Partial<ReadinessDependencies> = {},
) {
  const dependencies = { ...defaults, ...overrides }
  return async function hashPayStreamReadiness(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ ok: false, service: 'hashpaystream', status: 'method_not_allowed' })
    }
    if (dependencies.isDraining()) {
      return res.status(503).json({ ok: false, service: 'hashpaystream', status: 'unavailable' })
    }
    try {
      if (!dependencies.hasStore()) throw new Error('Durable store is unavailable.')
      const env = dependencies.env()
      const ownershipStoreKey = String(
        env.HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY ?? DEFAULT_OWNERSHIP_STORE_KEY,
      ).trim()
      if (!ownershipStoreKey || ownershipStoreKey.length > 160) {
        throw new Error('Ownership store configuration is invalid.')
      }
      await dependencies.read(ownershipStoreKey)
      const registryConfig = agentCredentialRegistryConfig(env)
      if (registryConfig) await dependencies.read(registryConfig.storeKey)
      return res.status(200).json({ ok: true, service: 'hashpaystream', status: 'ready' })
    } catch {
      try {
        dependencies.logError({
          component: 'hashpaystream-readiness',
          event: 'dependency_unavailable',
          status: 503,
        })
      } catch {
        // Logging must never change the readiness response.
      }
      return res.status(503).json({ ok: false, service: 'hashpaystream', status: 'unavailable' })
    }
  }
}

export default createHashPayStreamReadinessHandler()
