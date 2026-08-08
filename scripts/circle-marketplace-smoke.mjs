import assert from 'node:assert/strict'
import {
  circleMarketplaceConfiguration,
  createCircleMarketplacePaymentHandler,
  createCircleMarketplaceResourceHandler,
  createCircleMarketplaceValidationHandler,
  validateCircleMarketplacePlan,
} from '../api/circle-marketplace.ts'

function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    locals: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

const validBody = {
  template: 'fixed_unlock',
  title: 'Verified research delivery',
  description: 'Deliver a cited research brief for payer review.',
  amount: '0.10',
  recipient: '0x1111111111111111111111111111111111111111',
  durationSeconds: 86_400,
  cancellationWindowSeconds: 900,
}

assert.equal(validateCircleMarketplacePlan(validBody).ok, true)
assert.deepEqual(validateCircleMarketplacePlan({ ...validBody, amount: '0' }), {
  ok: false,
  error: 'Amount must be a positive USDC value with at most 6 decimals.',
})
assert.equal(validateCircleMarketplacePlan({ ...validBody, recipient: '0x0000000000000000000000000000000000000000' }).ok, false)
assert.equal(validateCircleMarketplacePlan({ ...validBody, template: 'milestone' }).ok, false)
assert.equal(validateCircleMarketplacePlan({ ...validBody, cancellationWindowSeconds: 86_400 }).ok, false)

const env = {
  HASHPAYSTREAM_CIRCLE_MARKETPLACE_SELLER_ADDRESS: '0x2222222222222222222222222222222222222222',
  HASHPAYSTREAM_CIRCLE_MARKETPLACE_PRICE_USD: '0.01',
}
assert.deepEqual(circleMarketplaceConfiguration(env), {
  sellerAddress: '0x2222222222222222222222222222222222222222',
  facilitatorUrl: 'https://gateway-api-testnet.circle.com',
  networks: ['eip155:5042002'],
  price: '$0.01',
})
assert.equal(circleMarketplaceConfiguration({ ...env, HASHPAYSTREAM_CIRCLE_MARKETPLACE_SELLER_ADDRESS: 'invalid' }), undefined)
assert.equal(circleMarketplaceConfiguration({ ...env, HASHPAYSTREAM_CIRCLE_MARKETPLACE_PRICE_USD: '0' }), undefined)
assert.equal(circleMarketplaceConfiguration({ ...env, HASHPAYSTREAM_CIRCLE_MARKETPLACE_FACILITATOR_URL: 'http://example.com' }), undefined)

const validation = createCircleMarketplaceValidationHandler()
const invalidResponse = response()
let invalidNext = false
validation({ body: { ...validBody, title: '' } }, invalidResponse, () => { invalidNext = true })
assert.equal(invalidResponse.statusCode, 400)
assert.equal(invalidNext, false)

const validResponse = response()
let validNext = false
validation({ body: validBody }, validResponse, () => { validNext = true })
assert.equal(validNext, true)
assert.equal(validResponse.locals.circleMarketplacePlan.title, validBody.title)

let gatewayCalls = 0
let requiredPrice = ''
const paymentHandler = createCircleMarketplacePaymentHandler({
  env: () => env,
  gateway: config => {
    gatewayCalls += 1
    assert.equal(config.networks[0], 'eip155:5042002')
    return {
      require: price => {
        requiredPrice = price
        return (_req, res) => res.status(402).json({ paymentRequired: true })
      },
    }
  },
  logError: () => undefined,
})
const unpaidResponse = response()
paymentHandler({ body: validBody }, unpaidResponse, () => assert.fail('Unpaid request must not continue.'))
assert.equal(unpaidResponse.statusCode, 402)
assert.equal(requiredPrice, '$0.01')
paymentHandler({ body: validBody }, response(), () => assert.fail('Unpaid request must not continue.'))
assert.equal(gatewayCalls, 1)

const missingConfigResponse = response()
createCircleMarketplacePaymentHandler({
  env: () => ({}),
  gateway: () => assert.fail('Gateway must not initialize without configuration.'),
  logError: () => undefined,
})({}, missingConfigResponse, () => assert.fail('Missing configuration must not continue.'))
assert.equal(missingConfigResponse.statusCode, 503)

const rejectedPaymentResponse = response()
await createCircleMarketplacePaymentHandler({
  env: () => env,
  gateway: () => ({
    require: () => async () => {
      throw new Error('facilitator unavailable')
    },
  }),
  logError: () => undefined,
})(
  {},
  rejectedPaymentResponse,
  () => assert.fail('Rejected payment middleware must not continue.'),
)
assert.equal(rejectedPaymentResponse.statusCode, 503)
assert.deepEqual(rejectedPaymentResponse.body, {
  ok: false,
  error: 'Circle marketplace payments are unavailable.',
})

const resource = createCircleMarketplaceResourceHandler()
resource({
  payment: {
    verified: true,
    payer: '0x3333333333333333333333333333333333333333',
    amount: '10000',
    network: 'eip155:5042002',
    transaction: `0x${'4'.repeat(64)}`,
  },
}, validResponse, () => undefined)
assert.equal(validResponse.statusCode, 200)
assert.equal(validResponse.body.ok, true)
assert.equal(validResponse.body.plan.marketplacePaymentFundsEscrow, false)
assert.equal(validResponse.body.plan.fundingRequired, '0.10 USDC')
assert.equal(validResponse.body.payment.amountAtomic, '10000')
assert.equal(JSON.stringify(validResponse.body).includes('0x3333333333333333333333333333333333333333'), false)
assert.match(validResponse.body.plan.id, /^hpp_[a-f0-9]{24}$/)

const unverifiedResponse = response()
unverifiedResponse.locals.circleMarketplacePlan = validResponse.locals.circleMarketplacePlan
resource({ payment: { verified: false } }, unverifiedResponse, () => undefined)
assert.equal(unverifiedResponse.statusCode, 502)

console.log('HashPayStream Circle marketplace smoke checks passed.')
