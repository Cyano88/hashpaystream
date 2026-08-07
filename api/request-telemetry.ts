import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextFunction, Request, Response } from 'express'

const requestContext = new AsyncLocalStorage<{ requestId: string }>()

export type HashPayStreamApiRoute =
  | 'human_agreements'
  | 'human_webhook'
  | 'agent_agreements'
  | 'agent_webhook'
  | 'unmatched'

export type HashPayStreamApiTelemetryEvent = {
  component: 'hashpaystream-api'
  event: 'request_completed'
  requestId: string
  method: 'GET' | 'POST' | 'OTHER'
  route: HashPayStreamApiRoute
  status: number
  durationMs: number
}

export type HashPayStreamApiTelemetryDependencies = {
  requestId: () => string
  now: () => number
  log: (event: HashPayStreamApiTelemetryEvent) => void
}

const defaults: HashPayStreamApiTelemetryDependencies = {
  requestId: randomUUID,
  now: Date.now,
  log: event => console.log(JSON.stringify(event)),
}

export function withHashPayStreamRequestId<T extends Record<string, unknown>>(event: T) {
  const requestId = requestContext.getStore()?.requestId
  return requestId ? { ...event, requestId } : event
}

function method(value: string): HashPayStreamApiTelemetryEvent['method'] {
  if (value === 'GET' || value === 'POST') return value
  return 'OTHER'
}

function route(path: string): HashPayStreamApiRoute {
  if (path === '/api/hashpaystream/v2/agreements') return 'human_agreements'
  if (path === '/api/hashpaystream/arc-agreement-webhook') return 'human_webhook'
  if (path === '/api/hashpaystream/v1/agent/agreements') return 'agent_agreements'
  if (path === '/api/hashpaystream/v1/agent/arc-agreement-webhook') return 'agent_webhook'
  return 'unmatched'
}

export function createHashPayStreamApiTelemetry(
  overrides: Partial<HashPayStreamApiTelemetryDependencies> = {},
) {
  const dependencies = { ...defaults, ...overrides }
  return function hashPayStreamApiTelemetry(req: Request, res: Response, next: NextFunction) {
    const requestId = dependencies.requestId()
    const startedAt = dependencies.now()
    res.setHeader('X-Request-ID', requestId)
    res.once('finish', () => {
      try {
        dependencies.log({
          component: 'hashpaystream-api',
          event: 'request_completed',
          requestId,
          method: method(req.method),
          route: route(req.path),
          status: Number.isInteger(res.statusCode) ? res.statusCode : 500,
          durationMs: Math.max(0, Math.round(dependencies.now() - startedAt)),
        })
      } catch {
        // Telemetry must never change an API response.
      }
    })
    requestContext.run({ requestId }, next)
  }
}

export default createHashPayStreamApiTelemetry()
