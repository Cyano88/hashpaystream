import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import agreementGateway from './api/agreement-gateway.js'
import arcAgreementWebhook from './api/arc-agreement-webhook.js'
import { rateLimit } from './api/rate-limit.js'

const app = express()
const port = Number(process.env.PORT || 10000)
const root = path.dirname(fileURLToPath(import.meta.url))

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

app.post(
  '/api/hashpaystream/arc-agreement-webhook',
  rateLimit({ name: 'arc-webhook', windowMs: 60_000, max: 120 }),
  express.raw({ type: 'application/json', limit: '64kb' }),
  arcAgreementWebhook,
)
app.use(express.json({ limit: '64kb' }))
app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'hashpaystream' }))
app.get('/api/hashpaystream/v2/agreements', rateLimit({ name: 'agreement-read', windowMs: 60_000, max: 120 }), agreementGateway)
app.post('/api/hashpaystream/v2/agreements', rateLimit({ name: 'agreement-write', windowMs: 60_000, max: 30 }), agreementGateway)

app.use(express.static(path.join(root, 'dist'), { index: false, maxAge: '1h' }))
app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))

app.listen(port, () => console.log(`HashPayStream running on port ${port}`))
