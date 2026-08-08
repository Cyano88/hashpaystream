import { createHash } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server'
import { isAddress } from 'viem'

const ARC_TESTNET_NETWORK = 'eip155:5042002'
const DEFAULT_FACILITATOR_URL = 'https://gateway-api-testnet.circle.com'
const DEFAULT_PRICE = '$0.01'

type MarketplacePayment = {
  verified: boolean
  payer: string
  amount: string
  network: string
  transaction?: string
}

type PaidRequest = Request & { payment?: MarketplacePayment }

export type CircleMarketplacePlan = {
  template: 'fixed_unlock'
  title: string
  description: string
  amount: string
  recipient: `0x${string}`
  durationSeconds: number
  cancellationWindowSeconds: number
}

export type CircleMarketplaceConfiguration = {
  sellerAddress: `0x${string}`
  facilitatorUrl: string
  networks: string[]
  price: string
}

type GatewayLike = { require: (price: string) => RequestHandler }

export type CircleMarketplaceDependencies = {
  env: () => NodeJS.ProcessEnv
  gateway: (config: CircleMarketplaceConfiguration) => GatewayLike
  logError: (event: {
    component: 'hashpaystream-circle-marketplace'
    event: 'configuration_unavailable' | 'payment_middleware_failed'
    status: 503
  }) => void
}

const defaults: CircleMarketplaceDependencies = {
  env: () => process.env,
  gateway: config => createGatewayMiddleware({
    sellerAddress: config.sellerAddress,
    facilitatorUrl: config.facilitatorUrl,
    networks: config.networks,
    description: 'HashPayStream fixed USDC agreement plan',
  }),
  logError: event => console.error(JSON.stringify(event)),
}

function clean(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maximum) : ''
}

function decimalAmount(value: unknown) {
  const normalized = clean(value, 80)
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) return ''
  const [whole, fraction = ''] = normalized.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  return units > 0n ? normalized : ''
}

function integer(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : Number.NaN
}

function marketplacePrice(value: unknown) {
  const normalized = clean(value, 40).replace(/^\$/, '')
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) return ''
  const [whole, fraction = ''] = normalized.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  return units >= 1n && units <= 100_000_000n ? `$${normalized}` : ''
}

export function circleMarketplaceConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): CircleMarketplaceConfiguration | undefined {
  const sellerAddress = clean(env.HASHPAYSTREAM_CIRCLE_MARKETPLACE_SELLER_ADDRESS, 80)
  const facilitatorUrl = clean(
    env.HASHPAYSTREAM_CIRCLE_MARKETPLACE_FACILITATOR_URL ?? DEFAULT_FACILITATOR_URL,
    240,
  )
  const price = marketplacePrice(env.HASHPAYSTREAM_CIRCLE_MARKETPLACE_PRICE_USD ?? DEFAULT_PRICE)
  if (!isAddress(sellerAddress) || /^0x0{40}$/i.test(sellerAddress)) return undefined
  try {
    const parsed = new URL(facilitatorUrl)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined
  } catch {
    return undefined
  }
  if (!price) return undefined
  return {
    sellerAddress: sellerAddress as `0x${string}`,
    facilitatorUrl,
    networks: [ARC_TESTNET_NETWORK],
    price,
  }
}

export function validateCircleMarketplacePlan(value: unknown):
  | { ok: true; plan: CircleMarketplacePlan }
  | { ok: false; error: string } {
  const body = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const template = clean(body.template ?? 'fixed_unlock', 40)
  const title = clean(body.title, 120)
  const description = clean(body.description, 2_000)
  const amount = decimalAmount(body.amount)
  const recipient = clean(body.recipient, 80)
  const durationSeconds = integer(body.durationSeconds)
  const cancellationWindowSeconds = integer(body.cancellationWindowSeconds)

  if (template !== 'fixed_unlock') {
    return { ok: false, error: 'The Circle marketplace pilot currently supports fixed-release agreements only.' }
  }
  if (title.length < 3) return { ok: false, error: 'Title must contain at least 3 characters.' }
  if (description.length < 10) return { ok: false, error: 'Description must contain at least 10 characters.' }
  if (!amount) return { ok: false, error: 'Amount must be a positive USDC value with at most 6 decimals.' }
  if (!isAddress(recipient) || /^0x0{40}$/i.test(recipient)) {
    return { ok: false, error: 'Recipient must be a non-zero EVM address.' }
  }
  if (durationSeconds < 3_600 || durationSeconds > 31_536_000) {
    return { ok: false, error: 'Duration must be a whole number from 3600 to 31536000 seconds.' }
  }
  if (cancellationWindowSeconds < 0 || cancellationWindowSeconds >= durationSeconds) {
    return { ok: false, error: 'Cancellation window must be a whole number from 0 up to, but not including, the duration.' }
  }
  return {
    ok: true,
    plan: {
      template: 'fixed_unlock',
      title,
      description,
      amount,
      recipient: recipient as `0x${string}`,
      durationSeconds,
      cancellationWindowSeconds,
    },
  }
}

export function createCircleMarketplaceValidationHandler(): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    const validation = validateCircleMarketplacePlan(req.body)
    if (!validation.ok) return res.status(400).json({ ok: false, error: validation.error })
    res.locals.circleMarketplacePlan = validation.plan
    next()
  }
}

export function createCircleMarketplacePaymentHandler(
  overrides: Partial<CircleMarketplaceDependencies> = {},
): RequestHandler {
  const dependencies = { ...defaults, ...overrides }
  let cached: { key: string; middleware: RequestHandler } | undefined
  return (req, res, next) => {
    const config = circleMarketplaceConfiguration(dependencies.env())
    if (!config) {
      try {
        dependencies.logError({
          component: 'hashpaystream-circle-marketplace',
          event: 'configuration_unavailable',
          status: 503,
        })
      } catch {
        // Logging must never change the response.
      }
      return res.status(503).json({ ok: false, error: 'Circle marketplace payments are unavailable.' })
    }
    try {
      const key = JSON.stringify(config)
      if (!cached || cached.key !== key) {
        cached = { key, middleware: dependencies.gateway(config).require(config.price) }
      }
      const result = cached.middleware(req, res, next)
      if (result && typeof (result as Promise<void>).catch === 'function') {
        return Promise.resolve(result).catch(() => {
          try {
            dependencies.logError({
              component: 'hashpaystream-circle-marketplace',
              event: 'payment_middleware_failed',
              status: 503,
            })
          } catch {
            // Logging must never change the response.
          }
          if (!res.headersSent) {
            res.status(503).json({ ok: false, error: 'Circle marketplace payments are unavailable.' })
          }
        })
      }
      return result
    } catch {
      try {
        dependencies.logError({
          component: 'hashpaystream-circle-marketplace',
          event: 'payment_middleware_failed',
          status: 503,
        })
      } catch {
        // Logging must never change the response.
      }
      return res.status(503).json({ ok: false, error: 'Circle marketplace payments are unavailable.' })
    }
  }
}

export function createCircleMarketplaceResourceHandler(): RequestHandler {
  return (req: PaidRequest, res: Response, _next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store')
    const plan = res.locals.circleMarketplacePlan as CircleMarketplacePlan | undefined
    const payment = req.payment
    if (!plan || payment?.verified !== true) {
      return res.status(502).json({ ok: false, error: 'A verified Circle marketplace payment is required.' })
    }
    const planId = `hpp_${createHash('sha256').update(JSON.stringify(plan)).digest('hex').slice(0, 24)}`
    return res.status(200).json({
      ok: true,
      service: 'hashpaystream-fixed-agreement-plan',
      plan: {
        id: planId,
        ...plan,
        asset: 'USDC',
        agreementNetwork: ARC_TESTNET_NETWORK,
        fundingRequired: `${plan.amount} USDC`,
        marketplacePaymentFundsEscrow: false,
        safeguards: [
          'Escrow funding requires a separate wallet-authorized action.',
          'Release requires confirmed delivery review under the agreement policy.',
          'Cancellation and refund remain subject to authoritative onchain eligibility.',
        ],
      },
      payment: {
        verified: true,
        amountAtomic: payment.amount,
        network: payment.network,
        ...(payment.transaction ? { transaction: payment.transaction } : {}),
      },
      nextAction: 'Use an approved HashPayStream pilot integration to create and fund this agreement.',
    })
  }
}
