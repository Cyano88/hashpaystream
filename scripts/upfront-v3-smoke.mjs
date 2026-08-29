import assert from 'node:assert/strict'
import {
  requireUpfrontSettlementV3,
  upfrontSettlementV3Enabled,
} from '../api/upfront-v3.ts'

assert.equal(upfrontSettlementV3Enabled({}), false)
assert.equal(upfrontSettlementV3Enabled({ HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED: 'false' }), false)
assert.equal(upfrontSettlementV3Enabled({ HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED: ' TRUE ' }), true)
assert.throws(
  () => requireUpfrontSettlementV3({ HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED: 'false' }),
  error => error instanceof Error
    && error.message === 'Early pay is paused while the settlement upgrade is verified.'
    && error.status === 503,
)
assert.doesNotThrow(() => requireUpfrontSettlementV3({ HASHPAYSTREAM_FEE_SETTLEMENT_V3_ENABLED: 'true' }))

console.log('HashPayStream V3 activation boundary checks passed.')
