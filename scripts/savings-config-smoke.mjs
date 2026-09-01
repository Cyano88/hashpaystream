import assert from 'node:assert/strict'
import { createSavingsConfigHandler, XLAYER_MAINNET_CHAIN_ID, XLAYER_NATIVE_USDC_ADDRESS } from '../api/savings-config.ts'

const VAULT = '0x1111111111111111111111111111111111111111'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

function call(env, method = 'GET') {
  const response = responseRecorder()
  createSavingsConfigHandler({ env: () => env })({ method }, response)
  return response
}

const inReview = call({})
assert.equal(inReview.statusCode, 200)
assert.equal(inReview.headers['cache-control'], 'no-store')
assert.deepEqual(inReview.body, {
  ok: true,
  savings: {
    chainId: XLAYER_MAINNET_CHAIN_ID,
    assetAddress: XLAYER_NATIVE_USDC_ADDRESS,
    vaultAddress: null,
    depositsEnabled: false,
    status: 'in_review',
  },
})

const paused = call({ HASHPAYSTREAM_SAVINGS_VAULT_ADDRESS: VAULT })
assert.equal(paused.body.savings.vaultAddress, VAULT)
assert.equal(paused.body.savings.depositsEnabled, false)
assert.equal(paused.body.savings.status, 'paused')

const active = call({
  HASHPAYSTREAM_SAVINGS_VAULT_ADDRESS: VAULT,
  HASHPAYSTREAM_SAVINGS_DEPOSITS_ENABLED: 'true',
})
assert.equal(active.body.savings.depositsEnabled, true)
assert.equal(active.body.savings.status, 'active')

const invalidAddress = call({
  HASHPAYSTREAM_SAVINGS_VAULT_ADDRESS: 'not-an-address',
  HASHPAYSTREAM_SAVINGS_DEPOSITS_ENABLED: 'true',
})
assert.equal(invalidAddress.body.savings.vaultAddress, null)
assert.equal(invalidAddress.body.savings.depositsEnabled, false)
assert.equal(invalidAddress.body.savings.status, 'in_review')

const invalidMethod = call({}, 'POST')
assert.equal(invalidMethod.statusCode, 405)
assert.equal(invalidMethod.headers.allow, 'GET')

console.log('HashPayStream savings configuration smoke checks passed.')
