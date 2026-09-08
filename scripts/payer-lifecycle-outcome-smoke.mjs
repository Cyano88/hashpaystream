import assert from 'node:assert/strict'
import { payerLifecycleOutcome } from '../src/lib/payerLifecycleOutcome.ts'
for (const status of ['failed','provider_failed','manual_review']) assert.equal(payerLifecycleOutcome({pending:false,lifecycleAction:{status}}),'failed')
for (const status of ['reserved','issued','transaction_pending','submitted']) assert.equal(payerLifecycleOutcome({pending:false,lifecycleAction:{status}}),'pending')
assert.equal(payerLifecycleOutcome({pending:false}),'pending')
assert.equal(payerLifecycleOutcome({lifecycleAction:{status:'confirmed'}}),'confirmed')
console.log('Only authoritative confirmation can show funds returned.')
