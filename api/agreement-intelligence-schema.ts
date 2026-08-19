import { createHash, createHmac } from 'node:crypto'

export const AGREEMENT_INTELLIGENCE_REQUEST_SCHEMA = 'zeroscout.agreement-intelligence.request' as const
export const AGREEMENT_INTELLIGENCE_REQUEST_VERSION = '1.0.0' as const

const ADDRESS = /^0x[a-fA-F0-9]{40}$/
const MAX_USDC_UNITS = 1_000_000_000_000n

export type UpfrontDraftInput = {
  template: 'fixed_unlock'
  title: string
  description: string
  amount: string
  durationSeconds: number
  cancellationWindowSeconds: number
  providerPayoutAddress: string
  requestedAdvanceBps: number
}

export type AgreementIntelligenceRequest = {
  schema: typeof AGREEMENT_INTELLIGENCE_REQUEST_SCHEMA
  schemaVersion: typeof AGREEMENT_INTELLIGENCE_REQUEST_VERSION
  requestId: string
  issuedAt: string
  source: { product: 'hashpaystream'; environment: 'testnet'; providerReference: string }
  agreement: {
    state: 'draft'; template: 'fixed_unlock'; title: string; deliveryDescription: string
    amountUsdcUnits: string; durationSeconds: number; cancellationWindowSeconds: number
    releasePercentages: [100]; termsHash: string
  }
  advance: {
    requestedBps: number; requestedUsdcUnits: string; fundingNetwork: 'x-layer-testnet'
    fundingAsset: 'test-usdc'; providerPayoutAddress: string
  }
  settlement: {
    protectionNetwork: 'arc-testnet'; protectionAsset: 'test-usdc'
    recipientSelection: 'fixed-repayment-router'; assetBridgeRequired: false
  }
  evidence: {
    providerHistoryIncluded: false; sources: ['hashpaystream-agreement-draft']
    dataGaps: ['provider-history', 'payer-funding-confirmation', 'delivery-history']
  }
}

function clean(value: unknown, maximum: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function inputError(message: string): never {
  throw Object.assign(new Error(message), { status: 400 })
}

function parseUsdcUnits(value: unknown) {
  const normalized = clean(value, 32)
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) inputError('Amount must be a positive USDC value with up to 6 decimals.')
  const [whole, fraction = ''] = normalized.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  if (units <= 0n || units > MAX_USDC_UNITS) inputError('Amount is outside the supported Upfront range.')
  return units
}

function integer(value: unknown, minimum: number, maximum: number, label: string) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) inputError(label + ' is outside the supported range.')
  return parsed
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

export function validateUpfrontDraft(value: unknown): UpfrontDraftInput {
  const body = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  if (body.template !== 'fixed_unlock') inputError('The Upfront pilot supports one-release agreements only.')
  const title = clean(body.title, 140)
  const description = clean(body.description, 800)
  if (title.length < 3) inputError('Agreement title must contain at least 3 characters.')
  if (description.length < 10) inputError('Delivery description must contain at least 10 characters.')
  const durationSeconds = integer(body.durationSeconds, 3_600, 2_592_000, 'Agreement duration')
  const cancellationWindowSeconds = integer(body.cancellationWindowSeconds, 0, 86_400, 'Cancellation window')
  if (cancellationWindowSeconds >= durationSeconds) inputError('Cancellation window must end before the agreement expires.')
  const providerPayoutAddress = clean(body.providerPayoutAddress, 42)
  if (!ADDRESS.test(providerPayoutAddress) || /^0x0{40}$/i.test(providerPayoutAddress)) inputError('A valid X Layer payout address is required.')
  const requestedAdvanceBps = integer(body.requestedAdvanceBps, 1_000, 8_000, 'Requested advance')
  const amount = clean(body.amount, 32)
  parseUsdcUnits(amount)
  return { template: 'fixed_unlock', title, description, amount, durationSeconds, cancellationWindowSeconds, providerPayoutAddress, requestedAdvanceBps }
}

export function buildAgreementIntelligenceRequest(input: {
  requestId: string; issuedAt: string; providerIdentity: string
  providerReferenceSecret: string; draft: UpfrontDraftInput
}): AgreementIntelligenceRequest {
  const units = parseUsdcUnits(input.draft.amount)
  const terms = {
    template: input.draft.template,
    title: input.draft.title,
    deliveryDescription: input.draft.description,
    amountUsdcUnits: units.toString(),
    durationSeconds: input.draft.durationSeconds,
    cancellationWindowSeconds: input.draft.cancellationWindowSeconds,
    releasePercentages: [100] as [100],
  }
  return {
    schema: AGREEMENT_INTELLIGENCE_REQUEST_SCHEMA,
    schemaVersion: AGREEMENT_INTELLIGENCE_REQUEST_VERSION,
    requestId: input.requestId,
    issuedAt: input.issuedAt,
    source: {
      product: 'hashpaystream',
      environment: 'testnet',
      providerReference: 'hps_provider_' + createHmac('sha256', input.providerReferenceSecret).update('upfront\0' + input.providerIdentity).digest('hex').slice(0, 32),
    },
    agreement: { state: 'draft', ...terms, termsHash: 'sha256:' + createHash('sha256').update(canonical(terms)).digest('hex') },
    advance: {
      requestedBps: input.draft.requestedAdvanceBps,
      requestedUsdcUnits: (units * BigInt(input.draft.requestedAdvanceBps) / 10_000n).toString(),
      fundingNetwork: 'x-layer-testnet',
      fundingAsset: 'test-usdc',
      providerPayoutAddress: input.draft.providerPayoutAddress,
    },
    settlement: {
      protectionNetwork: 'arc-testnet',
      protectionAsset: 'test-usdc',
      recipientSelection: 'fixed-repayment-router',
      assetBridgeRequired: false,
    },
    evidence: {
      providerHistoryIncluded: false,
      sources: ['hashpaystream-agreement-draft'],
      dataGaps: ['provider-history', 'payer-funding-confirmation', 'delivery-history'],
    },
  }
}

export function agreementIntelligenceRequestHash(request: AgreementIntelligenceRequest) {
  return 'sha256:' + createHash('sha256').update(canonical(request)).digest('hex')
}

export function agreementIntelligencePayloadHash(request: AgreementIntelligenceRequest) {
  return 'sha256:' + createHash('sha256').update(canonical({
    source: request.source,
    agreement: request.agreement,
    advance: request.advance,
    settlement: request.settlement,
    evidence: request.evidence,
  })).digest('hex')
}
