import type { Request, Response } from 'express'
import { readHashPayStreamAnalytics } from './admin-analytics.js'
import { withHashPayStreamRequestId } from './request-telemetry.js'

type AnalyticsSnapshot = Awaited<ReturnType<typeof readHashPayStreamAnalytics>>

export type PublicStatsDependencies = {
  analytics: (env: NodeJS.ProcessEnv, now: Date) => Promise<AnalyticsSnapshot>
  env: () => NodeJS.ProcessEnv
  now: () => Date
  logError: (event: {
    component: 'hashpaystream-public-stats'
    event: 'request_failed'
    status: number
    requestId?: string
  }) => void
}

const defaults: PublicStatsDependencies = {
  analytics: (env, now) => readHashPayStreamAnalytics(env, now),
  env: () => process.env,
  now: () => new Date(),
  logError: event => console.error(JSON.stringify(event)),
}

function publicProjection(analytics: AnalyticsSnapshot) {
  return {
    generatedAt: analytics.generatedAt,
    environment: analytics.environment,
    agreements: {
      created: analytics.funnel.created,
      funded: analytics.funnel.funded,
      completed: analytics.funnel.completed,
    },
    participation: {
      human: analytics.modes.human,
      upfront: analytics.modes.upfront,
      agentic: analytics.modes.agentic,
    },
    testUsdc: {
      protected: analytics.testUsdc.protected,
      released: analytics.testUsdc.released,
    },
    structures: analytics.structures,
    verifiedOperation: {
      available: analytics.funnel.completed > 0,
      documentationPath: '/docs#verified-operation',
      explorerNetwork: 'Arc Testnet',
    },
    methodology: 'Aggregated only from agreements owned by HashPayStream across Human, Upfront, and Agentic Hash PayLink projects.',
    disclaimer: 'Testnet operating activity only. Not evidence of mainnet volume, customer adoption, or investment performance.',
    privacy: 'No identities, wallets, private links, agreement identifiers, transaction hashes, timing metrics, or operational diagnostics.',
  }
}

export function createHashPayStreamPublicStats(overrides: Partial<PublicStatsDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return async function hashPayStreamPublicStats(req: Request, res: Response) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }
    try {
      const stats = publicProjection(await dependencies.analytics(dependencies.env(), dependencies.now()))
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
      return res.json({ ok: true, stats })
    } catch (error) {
      const sourceStatus = Number((error as Error & { status?: number }).status)
      const status = sourceStatus >= 500 && sourceStatus < 600 ? sourceStatus : 503
      dependencies.logError(withHashPayStreamRequestId({
        component: 'hashpaystream-public-stats',
        event: 'request_failed',
        status,
      }))
      res.setHeader('Cache-Control', 'no-store')
      return res.status(status).json({ ok: false, error: 'HashPayStream public statistics are temporarily unavailable.' })
    }
  }
}

export default createHashPayStreamPublicStats()
