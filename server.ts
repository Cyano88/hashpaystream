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
import upfrontReviews from './api/upfront-reviews.js'
import upfrontAgreementGateway from './api/upfront-agreement-gateway.js'
import { createHashPayStreamUpfrontArcWebhookHandler } from './api/upfront-arc-webhook.js'
import upfrontProtection from './api/upfront-protection.js'
import upfrontOpportunities from './api/upfront-opportunities.js'
import fundingPartners from './api/funding-partners.js'
import streamAccounts from './api/stream-accounts.js'
import circleWallet from './api/circle-wallet.js'
import customerRequests from './api/customer-requests.js'
import serviceRequests from './api/service-requests.js'
import savingsConfig from './api/savings-config.js'
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
const upfrontArcAgreementWebhook = createHashPayStreamUpfrontArcWebhookHandler()

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
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "child-src https://auth.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org",
    "frame-src https://auth.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
    "connect-src 'self' https://auth.privy.io https://pw-auth.circle.com wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com https://rpc.xlayer.tech https://testrpc.xlayer.tech https://rpc.testnet.arc.network",
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
app.get('/api/hashpaystream/v1/human/agreements', rateLimit({ name: 'human-agreement-read', windowMs: 60_000, max: 120 }), agreementGateway)
app.post('/api/hashpaystream/v1/human/agreements', rateLimit({ name: 'human-agreement-write', windowMs: 60_000, max: 30 }), agreementGateway)
app.all('/api/hashpaystream/v1/human/agreements', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.get('/api/hashpaystream/v1/human/upfront/agreements', rateLimit({ name: 'human-upfront-agreement-read', windowMs: 60_000, max: 120 }), upfrontAgreementGateway)
app.post('/api/hashpaystream/v1/human/upfront/agreements', rateLimit({ name: 'human-upfront-agreement-write', windowMs: 60_000, max: 30 }), upfrontAgreementGateway)
app.all('/api/hashpaystream/v1/human/upfront/agreements', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.post('/api/hashpaystream/v1/upfront/assessments', rateLimit({ name: 'upfront-assessment', windowMs: 60_000, max: 10 }), upfrontAssessment)
app.get('/api/hashpaystream/v1/upfront/reviews', rateLimit({ name: 'upfront-review-read', windowMs: 60_000, max: 60 }), upfrontReviews)
app.post('/api/hashpaystream/v1/upfront/reviews', rateLimit({ name: 'upfront-review-write', windowMs: 60_000, max: 10 }), upfrontReviews)
app.all('/api/hashpaystream/v1/upfront/reviews', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.post('/api/hashpaystream/v1/upfront/protection', rateLimit({ name: 'upfront-protection', windowMs: 60_000, max: 10 }), upfrontProtection)
app.get('/api/hashpaystream/v1/upfront/opportunities', rateLimit({ name: 'upfront-opportunities-read', windowMs: 60_000, max: 60 }), upfrontOpportunities)
app.post('/api/hashpaystream/v1/upfront/opportunities', rateLimit({ name: 'upfront-opportunities-write', windowMs: 60_000, max: 20 }), upfrontOpportunities)
app.all('/api/hashpaystream/v1/upfront/opportunities', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.get('/api/hashpaystream/v1/funding-partners', rateLimit({ name: 'funding-partner-read', windowMs: 60_000, max: 60 }), fundingPartners)
app.post('/api/hashpaystream/v1/funding-partners', rateLimit({ name: 'funding-partner-write', windowMs: 60_000, max: 10 }), fundingPartners)
app.all('/api/hashpaystream/v1/funding-partners', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.get('/api/hashpaystream/v1/accounts', rateLimit({ name: 'account-read', windowMs: 60_000, max: 120 }), streamAccounts)
app.post('/api/hashpaystream/v1/accounts', rateLimit({ name: 'account-write', windowMs: 60_000, max: 30 }), streamAccounts)
app.all('/api/hashpaystream/v1/accounts', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.get('/api/hashpaystream/v1/savings/config', rateLimit({ name: 'savings-config', windowMs: 60_000, max: 120 }), savingsConfig)
app.all('/api/hashpaystream/v1/savings/config', (_req, res) => {
  res.setHeader('Allow', 'GET')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.post('/api/hashpaystream/v1/circle-wallet', rateLimit({ name: 'circle-wallet', windowMs: 60_000, max: 30 }), circleWallet)
app.all('/api/hashpaystream/v1/circle-wallet', (_req, res) => {
  res.setHeader('Allow', 'POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.get('/api/hashpaystream/v1/requests', rateLimit({ name: 'request-read', windowMs: 60_000, max: 120 }), customerRequests)
app.post('/api/hashpaystream/v1/requests', rateLimit({ name: 'request-write', windowMs: 60_000, max: 30 }), customerRequests)
app.all('/api/hashpaystream/v1/requests', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
app.get('/api/hashpaystream/v1/service-requests', rateLimit({ name: 'service-request-read', windowMs: 60_000, max: 120 }), serviceRequests)
app.post('/api/hashpaystream/v1/service-requests', rateLimit({ name: 'service-request-write', windowMs: 60_000, max: 30 }), serviceRequests)
app.all('/api/hashpaystream/v1/service-requests', (_req, res) => {
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
})
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

app.use('/assets', express.static(path.join(root, 'dist', 'assets'), { immutable: true, maxAge: '1y' }))
app.get('/assets/*', (_req, res) => res.status(404).type('text/plain').send('Asset not found.'))
app.use(express.static(path.join(root, 'dist'), { index: false, maxAge: '1h' }))
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  return res.sendFile(path.join(root, 'dist', 'index.html'))
})

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
