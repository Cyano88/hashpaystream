import assert from 'node:assert/strict'
import { compactEvidenceReference, reconcileFundingPositions, reconcileUpdatedSnapshots, settlementRetryReady, SETTLEMENT_RETRY_DELAY_MS } from '../src/lib/stableSnapshots.ts'

const current = [{ id: 'agreement-1', updatedAt: '2026-08-31T19:14:25.000Z', status: 'completed', releaseRequest: { id: 'delivery-1' } }]
const stale = [{ id: 'agreement-1', updatedAt: '2026-08-31T19:12:00.000Z', status: 'active', releaseRequest: null }]
assert.deepEqual(reconcileUpdatedSnapshots(current, stale), current)

const sameTimeWithoutDelivery = [{ id: 'agreement-1', updatedAt: current[0].updatedAt, status: 'completed', releaseRequest: null }]
const reconciled = reconcileUpdatedSnapshots(current, sameTimeWithoutDelivery, (previous, incoming) => ({ ...incoming, releaseRequest: incoming.releaseRequest ?? previous.releaseRequest }))
assert.deepEqual(reconciled[0].releaseRequest, { id: 'delivery-1' })

const completedFunding = [{ id: 'position-1', positionStatus: 'settled' }]
assert.deepEqual(reconcileFundingPositions(completedFunding, [{ id: 'position-1', positionStatus: 'released' }]), completedFunding)
assert.equal(reconcileFundingPositions([{ id: 'position-1', positionStatus: 'released' }], completedFunding)[0].positionStatus, 'settled')

const observed = Date.parse('2026-08-31T19:14:25.000Z')
assert.equal(settlementRetryReady(observed, observed + SETTLEMENT_RETRY_DELAY_MS - 1), false)
assert.equal(settlementRetryReady(observed, observed + SETTLEMENT_RETRY_DELAY_MS), true)
assert.equal(settlementRetryReady(null, observed + SETTLEMENT_RETRY_DELAY_MS), false)
assert.equal(compactEvidenceReference('https://delivery.example/projects/canary/final-proof.pdf', 32), 'delivery.example/projects/can...')
assert.equal(compactEvidenceReference('not-a-url'), 'Submitted work')

console.log('Stable lifecycle snapshots, evidence links, and settlement fallback checks passed.')
