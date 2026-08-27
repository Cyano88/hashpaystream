import { useEffect, useState } from 'react'
import { ArrowLeftIcon, CheckCircleIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { useCircleWallet } from '../lib/circleWallet'
import type { ServiceRequest } from '../lib/serviceRequests'

type FundingAttempt = {
  status: 'awaiting_approval' | 'approval_submitted' | 'ready_to_activate' | 'activation_submitted' | 'active' | 'approval_failed' | 'activation_failed' | 'reconciliation_failed'
}

type FundingReview = {
  ok: true
  agreement: { id: string; title: string; description: string; amount: string; durationSeconds: number }
  payer: { walletLinked: boolean; walletAddress: string | null }
  attempt: FundingAttempt | null
  recovery?: { stage: 'approval' | 'activation'; pending: true; chainSubmitted: boolean } | null
  lifecycle?: { refund?: { eligible: boolean; reason: string | null } } | null
}

type FundingAction = { ok: true; attempt: FundingAttempt; challengeId?: string; pending?: boolean; recovered?: boolean }
type LifecycleAction = { ok: true; challengeId?: string; pending?: boolean; lifecycleAction?: { status: string } | null }

export default function StreamPayFundRequest({ item, onBack, payer, onFunded }: {
  item: ServiceRequest
  onBack: () => void
  payer: <T>(payload: Record<string, unknown>) => Promise<T>
  onFunded: () => void
}) {
  const wallet = useCircleWallet()
  const [review, setReview] = useState<FundingReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [refundPending, setRefundPending] = useState(false)
  const [refundSubmitted, setRefundSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (wallet.state !== 'ready' || !wallet.session) return
    let cancelled = false
    const load = async () => {
      setBusy(true)
      setError('')
      try {
        let next = await payer<FundingReview>({ action: 'payer_review', requestId: item.id })
        if (!next.payer.walletLinked) {
          await payer({
            action: 'payer_link_wallet',
            requestId: item.id,
            circleUserToken: wallet.session!.userToken,
            wallet: wallet.session!.wallet,
          })
          next = await payer<FundingReview>({ action: 'payer_review', requestId: item.id })
        }
        if (!cancelled) setReview(next)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Agreement funding could not open.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [item.id, payer, wallet.session, wallet.state])

  useEffect(() => {
    const pending = Boolean(review?.recovery?.pending)
      || review?.attempt?.status === 'approval_submitted'
      || review?.attempt?.status === 'activation_submitted'
    if (!pending) return
    const poll = () => void (review?.recovery?.pending && wallet.session
      ? payer<FundingAction>({
          action: 'payer_recover',
          requestId: item.id,
          stage: review.recovery.stage,
          circleUserToken: wallet.session.userToken,
        })
      : payer<FundingAction>({ action: 'payer_status', requestId: item.id })
    ).then(result => {
      const stillRecovering = Boolean(result.pending)
        && ['awaiting_approval', 'approval_failed', 'ready_to_activate', 'activation_failed'].includes(result.attempt.status)
      setReview(current => current ? {
        ...current,
        attempt: result.attempt,
        recovery: stillRecovering && review?.recovery
          ? { ...review.recovery, chainSubmitted: Boolean(result.recovered) || review.recovery.chainSubmitted }
          : null,
      } : current)
      if (result.attempt.status === 'active') onFunded()
    }).catch(reason => {
      setError(reason instanceof Error ? reason.message : 'Circle confirmation could not be recovered.')
      void payer<FundingReview>({ action: 'payer_review', requestId: item.id })
        .then(next => setReview(next))
        .catch(() => undefined)
    })
    poll()
    const timer = window.setInterval(poll, 6_000)
    return () => window.clearInterval(timer)
  }, [item.id, onFunded, payer, review?.attempt?.status, review?.recovery?.chainSubmitted, review?.recovery?.pending, review?.recovery?.stage, wallet.session])

  useEffect(() => {
    if (!refundPending || !wallet.session) return
    const poll = () => void payer<LifecycleAction>({ action: refundSubmitted ? 'payer_lifecycle_status' : 'payer_lifecycle_recover', requestId: item.id, circleUserToken: wallet.session!.userToken }).then(result => {
      const status = result.lifecycleAction?.status
      if (status === 'submitted') setRefundSubmitted(true)
      if (status === 'confirmed' || result.pending === false) { setRefundPending(false); onFunded() }
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Refund confirmation could not be recovered.'))
    poll(); const timer = window.setInterval(poll, 6_000)
    return () => window.clearInterval(timer)
  }, [item.id, onFunded, payer, refundPending, refundSubmitted, wallet.session])

  async function confirm() {
    if (!wallet.session) {
      await wallet.reconnect()
      return
    }
    setBusy(true)
    setError('')
    try {
      let attempt = review?.attempt ?? null
      if (!attempt) {
        const prepared = await payer<FundingAction>({
          action: 'payer_prepare',
          requestId: item.id,
          circleUserToken: wallet.session.userToken,
        })
        attempt = prepared.attempt
        setReview(current => current ? { ...current, attempt } : current)
      }
      const stage = attempt.status === 'awaiting_approval' || attempt.status === 'approval_failed'
        ? 'approval'
        : attempt.status === 'ready_to_activate' || attempt.status === 'activation_failed'
          ? 'activation'
          : null
      if (!stage) return
      const challenge = await payer<FundingAction>({
        action: 'payer_challenge',
        requestId: item.id,
        stage,
        circleUserToken: wallet.session.userToken,
      })
      if (!challenge.challengeId) throw new Error('Circle confirmation is unavailable.')
      const execution = await wallet.executeChallenge(challenge.challengeId)
      const result = execution.transactionHash
        ? await payer<FundingAction>({
            action: 'payer_record',
            requestId: item.id,
            stage,
            transactionHash: execution.transactionHash,
            circleUserToken: wallet.session.userToken,
          })
        : await payer<FundingAction>({
            action: 'payer_recover',
            requestId: item.id,
            stage,
            circleUserToken: wallet.session.userToken,
          })
      const stillRecovering = Boolean(result.pending)
        && ['awaiting_approval', 'approval_failed', 'ready_to_activate', 'activation_failed'].includes(result.attempt.status)
      setReview(current => current ? {
        ...current,
        attempt: result.attempt,
        recovery: stillRecovering ? { stage, pending: true, chainSubmitted: Boolean(result.recovered) } : null,
      } : current)
      if (result.attempt.status === 'active') onFunded()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Circle confirmation did not complete.')
    } finally {
      setBusy(false)
    }
  }

  async function refund() {
    if (busy || refundPending) return
    if (!wallet.session) { await wallet.reconnect(); return }
    setBusy(true); setError('')
    try {
      const challenge = await payer<LifecycleAction>({ action: 'payer_lifecycle_challenge', requestId: item.id, lifecycleAction: 'refund', circleUserToken: wallet.session.userToken })
      if (!challenge.challengeId) throw new Error('Circle refund confirmation is unavailable.')
      const execution = await wallet.executeChallenge(challenge.challengeId)
      const result = execution.transactionHash
        ? await payer<LifecycleAction>({ action: 'payer_lifecycle_record', requestId: item.id, transactionHash: execution.transactionHash, circleUserToken: wallet.session.userToken })
        : await payer<LifecycleAction>({ action: 'payer_lifecycle_recover', requestId: item.id, circleUserToken: wallet.session.userToken })
      setRefundSubmitted(Boolean(execution.transactionHash) || result.lifecycleAction?.status === 'submitted')
      setRefundPending(Boolean(result.pending))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The refund could not be submitted.') }
    finally { setBusy(false) }
  }

  const terms = item.terms.find(value => value.version === item.activeVersion) ?? item.terms[item.terms.length - 1]
  const attempt = review?.attempt
  const expired = Boolean(review?.lifecycle?.refund?.eligible) || item.status === 'expired'
  const active = attempt?.status === 'active' && !expired
  const pending = Boolean(review?.recovery?.pending)
    || attempt?.status === 'approval_submitted'
    || attempt?.status === 'activation_submitted'
  const approval = !attempt || attempt.status === 'awaiting_approval' || attempt.status === 'approval_failed'
  const actionLabel = active
    ? 'Agreement funded'
    : pending
      ? 'Confirming on Arc...'
      : approval
        ? 'Approve USDC - Step 1 of 2'
        : 'Fund and start - Step 2 of 2'
  const visibleError = error || (wallet.state === 'error' ? wallet.error : '')

  return <section className="w-full max-w-md py-5 sm:py-8">
    <div className="flex items-center gap-3">
      <button onClick={onBack} aria-label="Back to request" className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-white/[0.06]">
        <ArrowLeftIcon className="h-4 w-4" />
      </button>
      <h1 className="text-xl font-extrabold">Review and fund</h1>
    </div>
    <div className="mt-5 rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-gray-950 dark:text-white">{review?.agreement.title ?? terms.title}</h2>
          <p className="mt-1 text-xs leading-5 text-gray-400">{review?.agreement.description ?? terms.description}</p>
        </div>
        <p className="shrink-0 text-base font-black">{review?.agreement.amount ?? terms.amount} USDC</p>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]">
        <LockClosedIcon className="h-5 w-5 text-blue-600" />
        <div>
          <p className="text-xs font-bold">Protected on Arc</p>
          <p className="mt-0.5 text-[10px] text-gray-400">Paid only under the accepted agreement terms.</p>
        </div>
      </div>
      {active && <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-600"><CheckCircleIcon className="h-5 w-5" />Funding confirmed</div>}
      {expired && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">This agreement ended. Return the remaining USDC to your Circle wallet.</p>}
      {visibleError && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">{visibleError}</p>}
      {!review && !visibleError && <div className="mt-5 h-12 animate-pulse rounded-full bg-gray-100 dark:bg-white/[0.06]" />}
      {wallet.state === 'error' && <button onClick={() => void wallet.reconnect()} className="mt-4 min-h-11 w-full rounded-full border border-gray-200 text-xs font-bold dark:border-white/10">Try Circle wallet again</button>}
      {review && expired && <button disabled={busy || refundPending} onClick={() => void refund()} className="mt-5 min-h-12 w-full rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-45 dark:bg-white dark:text-gray-950">{busy ? 'Please wait...' : refundPending ? 'Returning USDC...' : 'Return remaining USDC'}</button>}
      {review && !expired && <button disabled={busy || active || pending} onClick={() => void confirm()} className="mt-5 min-h-12 w-full rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-45 dark:bg-white dark:text-gray-950">{busy ? 'Please wait...' : actionLabel}</button>}
    </div>
  </section>
}
