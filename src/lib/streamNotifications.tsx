import {
  BellIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import type { ServiceRequest } from './serviceRequests'
import type { AgreementSummary } from './useAgreements'

export type StreamNotice = {
  id: string
  role: 'Worker' | 'Customer' | 'Payment' | 'HashPayStream'
  title: string
  detail: string
  occurredAt: string
  tone: string
  Icon: typeof BellIcon
}

function agreementEventNotice(agreement: AgreementSummary, event: { id: string; event: string; createdAt: string; receivedAt?: string }): StreamNotice {
  const occurredAt = event.createdAt || event.receivedAt || ''
  const base = { id: `event:${agreement.id}:${event.id}`, detail: agreement.title || 'Agreement', occurredAt }
  switch (event.event) {
    case 'delivery.submitted': return { ...base, role: 'Worker', title: 'Worker submitted delivery', tone: 'text-blue-600', Icon: BriefcaseIcon }
    case 'delivery.updated': return { ...base, role: 'Worker', title: 'Worker updated delivery', tone: 'text-blue-600', Icon: BriefcaseIcon }
    case 'delivery.release_approved': return { ...base, role: 'Customer', title: 'Customer approved release', tone: 'text-violet-600', Icon: ShieldCheckIcon }
    case 'delivery.issue_reported': return { ...base, role: 'Customer', title: 'Customer reported a concern', tone: 'text-violet-600', Icon: ExclamationTriangleIcon }
    case 'agreement.activated': return { ...base, role: 'Payment', title: 'Customer funded agreement', tone: 'text-emerald-600', Icon: CheckCircleIcon }
    case 'agreement.step_released': return { ...base, role: 'Payment', title: 'Payment released', tone: 'text-emerald-600', Icon: CheckCircleIcon }
    case 'agreement.completed': return { ...base, role: 'Payment', title: 'Agreement completed', tone: 'text-emerald-600', Icon: CheckCircleIcon }
    case 'agreement.refunded': return { ...base, role: 'Payment', title: 'Remaining payment returned', tone: 'text-amber-600', Icon: CheckCircleIcon }
    case 'agreement.cancelled': return { ...base, role: 'HashPayStream', title: 'Agreement cancelled', tone: 'text-gray-500', Icon: BellIcon }
    case 'agreement.expired': return { ...base, role: 'HashPayStream', title: 'Agreement protection ended', tone: 'text-amber-600', Icon: BellIcon }
    default: return { ...base, role: 'HashPayStream', title: 'Agreement updated', tone: 'text-gray-500', Icon: BellIcon }
  }
}

export function buildStreamNotices(agreements: AgreementSummary[], requests: ServiceRequest[]) {
  const requestNotices: StreamNotice[] = requests.flatMap(item => item.events.map(event => {
    const terms = item.terms.find(value => value.version === event.version) ?? item.terms[item.terms.length - 1]
    const providerView = item.role === 'provider'
    const labels: Record<string, { title: string; role: StreamNotice['role'] }> = {
      'request.created': { title: providerView ? 'New job request' : 'Job request sent', role: 'Customer' },
      'request.provider_accept': { title: 'Provider accepted the terms', role: 'Worker' },
      'request.provider_counter': { title: 'Provider proposed new terms', role: 'Worker' },
      'request.provider_decline': { title: 'Provider declined the request', role: 'Worker' },
      'request.customer_accept': { title: 'Customer accepted the final terms', role: 'Customer' },
      'request.customer_cancel': { title: 'Customer cancelled the request', role: 'Customer' },
      'request.funded': { title: 'Customer funded the agreement', role: 'Payment' },
    }
    const label = labels[event.type] ?? { title: 'Request updated', role: 'HashPayStream' as const }
    return { id: `request:${item.id}:${event.id}`, role: label.role, title: label.title, detail: terms?.title ?? 'Job request', occurredAt: event.createdAt, tone: event.type.includes('decline') || event.type.includes('cancel') ? 'text-gray-500' : 'text-blue-600', Icon: event.type.includes('accept') ? CheckCircleIcon : BriefcaseIcon }
  }))
  const agreementNotices = agreements.flatMap(agreement => {
    const customerResponse: StreamNotice[] = agreement.customerRequest?.decision === 'declined' ? [{
      id: `customer:${agreement.id}:declined`,
      role: 'Customer',
      title: 'Customer declined request',
      detail: agreement.title || 'Agreement',
      occurredAt: agreement.customerRequest.updatedAt,
      tone: 'text-gray-500',
      Icon: ExclamationTriangleIcon,
    }] : []
    const events = [...(agreement.timeline || []), ...(agreement.deliveryTimeline || [])]
      .map(event => agreementEventNotice(agreement, event))
    return [...customerResponse, ...events]
  })
  return [...requestNotices, ...agreementNotices]
    .filter(item => item.occurredAt)
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
}

const READ_EVENT = 'hashpaystream:notifications-read'

function storageKey(userId: string) {
  return `hashpaystream.notifications.read.v1:${userId}`
}

function readIds(userId: string) {
  if (!userId || typeof window === 'undefined') return new Set<string>()
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(userId)) || '[]')
    return new Set(Array.isArray(value) ? value.filter(item => typeof item === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

export function useNotificationReadState(notices: StreamNotice[]) {
  const { user } = usePrivy()
  const userId = user?.id || ''
  const [read, setRead] = useState(() => readIds(userId))
  useEffect(() => {
    const refresh = () => setRead(readIds(userId))
    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener(READ_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(READ_EVENT, refresh)
    }
  }, [userId])
  const unreadCount = useMemo(() => notices.reduce((count, notice) => count + (read.has(notice.id) ? 0 : 1), 0), [notices, read])
  const markAllRead = useCallback(() => {
    if (!userId || typeof window === 'undefined') return
    const ids = notices.map(notice => notice.id).slice(0, 300)
    window.localStorage.setItem(storageKey(userId), JSON.stringify(ids))
    setRead(new Set(ids))
    window.dispatchEvent(new Event(READ_EVENT))
  }, [notices, userId])
  return { unreadCount, markAllRead }
}
