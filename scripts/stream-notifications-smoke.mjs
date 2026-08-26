import assert from 'node:assert/strict'
import { buildStreamNotices } from '../src/lib/streamNotifications.tsx'

const agreement = {
  id: 'agr_notification123456',
  title: 'Mobile app delivery',
  status: 'active',
  chain: null,
  updatedAt: '2026-08-25T09:00:00.000Z',
  customerRequest: { decision: 'declined', updatedAt: '2026-08-25T09:05:00.000Z' },
  timeline: [
    { id: 'evt_activated', event: 'agreement.activated', createdAt: '2026-08-25T09:01:00.000Z', receivedAt: '2026-08-25T09:01:01.000Z' },
    { id: 'evt_expired', event: 'agreement.expired', createdAt: '2026-08-25T09:02:00.000Z', receivedAt: '2026-08-25T09:02:01.000Z' },
  ],
  deliveryTimeline: [
    { id: 'evt_delivery', event: 'delivery.submitted', createdAt: '2026-08-25T09:03:00.000Z' },
    { id: 'evt_concern', event: 'delivery.issue_reported', createdAt: '2026-08-25T09:04:00.000Z' },
  ],
}
const request = {
  id: 'req_customer12345678',
  role: 'provider',
  direction: 'received',
  counterparty: 'Customer',
  status: 'sent',
  activeVersion: 1,
  terms: [{ version: 1, title: 'Logo design', description: 'Create the final logo package.', amount: '0.1', amountUsdcUnits: '100000', durationSeconds: 86400, cancellationWindowSeconds: 900, upfrontRequested: false, proposedBy: 'customer', createdAt: '2026-08-25T09:06:00.000Z' }],
  events: [{ id: 'req_customer12345678:1', type: 'request.created', actor: 'customer', createdAt: '2026-08-25T09:06:00.000Z', version: 1 }],
  createdAt: '2026-08-25T09:06:00.000Z',
  updatedAt: '2026-08-25T09:06:00.000Z',
  agreementId: '',
  payerReviewPath: '',
}

const notices = buildStreamNotices([agreement], [request])
assert.equal(notices[0].title, 'New job request')
assert.equal(notices[0].role, 'Customer')
assert.equal(notices.find(item => item.id === 'customer:agr_notification123456:declined')?.role, 'Customer')
assert.equal(notices.find(item => item.id.includes('evt_delivery'))?.role, 'Worker')
assert.equal(notices.find(item => item.id.includes('evt_concern'))?.role, 'Customer')
assert.equal(notices.find(item => item.id.includes('evt_activated'))?.role, 'Payment')
assert.equal(notices.find(item => item.id.includes('evt_expired'))?.role, 'HashPayStream')
assert.equal(new Set(notices.map(item => item.id)).size, notices.length)

console.log('HashPayStream role-labelled notification classification checks passed.')
