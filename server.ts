import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import agreementGateway from './api/agreement-gateway.js'
import arcAgreementWebhook from './api/arc-agreement-webhook.js'
import agentAgreementGateway from './api/agent-agreement-gateway.js'
import agentArcAgreementWebhook from './api/agent-arc-webhook.js'
import adminAnalytics from './api/admin-analytics.js'
import publicStats from './api/public-stats.js'
import { rateLimit } from './api/rate-limit.js'
import { createHashPayStreamReadinessHandler } from './api/readiness.js'
import apiTelemetry from './api/request-telemetry.js'
import { createHashPayStreamShutdown } from './api/graceful-shutdown.js'
import upfrontAssessment from './api/upfront-assessment.js'
import upfrontAgreementGateway from './api/upfront-agreement-gateway.js'
import upfrontArcAgreementWebhook from './api/upfront-arc-webhook.js'
import upfrontProtection from './api/upfront-protection.js'
import {
  createCircleMarketplacePaymentHandler,
  createCircleMarketplaceResourceHandler,
  createCircleMarketplaceValidationHandler,
} from './api/circle-marketplace.js'

const app = express()
const port = Number(process.env.PORT || 10000)
const root = path.dirname(fileURLToPath(import.meta.url))
let draining = false
const readiness = createHashPayStreamReadinessHandler({ isDraining: () => draining })
const circleMarketplaceValidation = createCircleMarketplaceValidationHandler()
const circleMarketplacePayment = createCircleMarketplacePaymentHandler()
const circleMarketplaceResource = createCircleMarketplaceResourceHandler()

app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "object-src 'none'",
    "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
    "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
    "connect-src 'self' https://auth.privy.io wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '))
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})

app.use('/api/hashpaystream', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})
app.use('/api/hashpaystream', apiTelemetry)

app.all(
  '/api/hashpaystream/arc-agreement-webhook',
  rateLimit({ name: 'arc-webhook', windowMs: 60_000, max: 120 }),
  express.raw({ type: 'application/json', limit: '64kb' }),
  arcAgreementWebhook,
)
app.all(
  '/api/hashpaystream/v1/upfront/arc-agreement-webhook',
  rateLimit({ name: 'upfront-arc-webhook', windowMs: 60_000, max: 120 }),
  express.raw({ type: 'application/json', limit: '64kb' }),
  upfrontArcAgreementWebhook,
)
app.all(
  '/api/hashpaystream/v1/agent/arc-agreement-webhook',
  rateLimit({ name: 'agent-arc-webhook', windowMs: 60_000, max: 120 }),
  express.raw({ type: 'application/json', limit: '64kb' }),
  agentArcAgreementWebhook,
)
app.use(express.json({ limit: '64kb' }))
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'hashpaystream' }))
app.get('/readyz', rateLimit({ name: 'readiness', windowMs: 60_000, max: 120 }), readiness)
app.get('/api/hashpaystream/v2/agreements', rateLimit({ name: 'agreement-read', windowMs: 60_000, max: 120 }), agreementGateway)
app.post('/api/hashpaystream/v2/agreements', rateLimit({ name: 'agreement-write', windowMs: 60_000, max: 30 }), agreementGateway)
app.all('/api/hashpaystream/v2/agreements', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.get('/api/hashpaystream/v1/upfront/agreements', rateLimit({ name: 'upfront-agreement-read', windowMs: 60_000, max: 120 }), upfrontAgreementGateway)
app.post('/api/hashpaystream/v1/upfront/agreements', rateLimit({ name: 'upfront-agreement-write', windowMs: 60_000, max: 30 }), upfrontAgreementGateway)
app.all('/api/hashpaystream/v1/upfront/agreements', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.post('/api/hashpaystream/v1/upfront/assessments', rateLimit({ name: 'upfront-assessment', windowMs: 60_000, max: 10 }), upfrontAssessment)
app.post('/api/hashpaystream/v1/upfront/protection', rateLimit({ name: 'upfront-protection', windowMs: 60_000, max: 10 }), upfrontProtection)
app.all('/api/hashpaystream/v1/upfront/assessments', (_req, res) => {
  res.setHeader('Allow', 'POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.get('/api/hashpaystream/v1/agent/agreements', rateLimit({ name: 'agent-agreement-read', windowMs: 60_000, max: 120 }), agentAgreementGateway)
app.post('/api/hashpaystream/v1/agent/agreements', rateLimit({ name: 'agent-agreement-write', windowMs: 60_000, max: 30 }), agentAgreementGateway)
app.all('/api/hashpaystream/v1/agent/agreements', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.get(
  '/api/hashpaystream/v1/public/stats',
  rateLimit({ name: 'public-stats', windowMs: 60_000, max: 120 }),
  publicStats,
)
app.all('/api/hashpaystream/v1/public/stats', (_req, res) => {
  res.setHeader('Allow', 'GET')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.get(
  '/api/hashpaystream/v1/admin/analytics',
  rateLimit({ name: 'admin-analytics', windowMs: 60_000, max: 30 }),
  adminAnalytics,
)
app.all('/api/hashpaystream/v1/admin/analytics', (_req, res) => {
  res.setHeader('Allow', 'GET')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.post(
  '/api/hashpaystream/v1/circle-marketplace/agreement-plan',
  rateLimit({ name: 'circle-marketplace-plan', windowMs: 60_000, max: 30 }),
  circleMarketplaceValidation,
  circleMarketplacePayment,
  circleMarketplaceResource,
)
app.all('/api/hashpaystream/v1/circle-marketplace/agreement-plan', (_req, res) => {
  res.setHeader('Allow', 'POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.use('/api/hashpaystream', (_req, res) => res.status(404).json({ ok: false, error: 'API route not found.' }))

app.use(express.static(path.join(root, 'dist'), { index: false, maxAge: '1h' }))
app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))

const server = app.listen(port, () => console.log(`HashPayStream running on port ${port}`))
const shutdown = createHashPayStreamShutdown({
  server,
  onDraining: () => { draining = true },
  schedule: setTimeout,
  cancel: clearTimeout,
  exit: code => process.exit(code),
  log: event => {
    const line = JSON.stringify(event)
    if (event.event === 'shutdown_failed' || event.event === 'shutdown_forced') console.error(line)
    else console.log(line)
  },
})

process.once('SIGTERM', () => { shutdown('SIGTERM') })
process.once('SIGINT', () => { shutdown('SIGINT') })
