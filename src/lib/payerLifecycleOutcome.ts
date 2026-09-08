export function payerLifecycleOutcome(result: { pending?: boolean; lifecycleAction?: { status: string } | null }) {
  const status = result.lifecycleAction?.status
  if (status === 'confirmed') return 'confirmed'
  if (status === 'failed' || status === 'provider_failed' || status === 'manual_review') return 'failed'
  return 'pending'
}
