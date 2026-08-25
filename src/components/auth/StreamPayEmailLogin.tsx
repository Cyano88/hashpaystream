import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLoginWithEmail } from '@privy-io/react-auth'
import { ArrowLeftIcon, ArrowRightIcon, EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { LoadingRing } from '../ui/LoadingRing'

const CODE_LENGTH = 6
const RESEND_SECONDS = 30

function readableError(error: unknown, action: 'send' | 'verify') {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('rate') || message.includes('too many')) return 'Too many attempts. Wait a moment before trying again.'
  if (action === 'verify' && (message.includes('invalid') || message.includes('expired') || message.includes('code'))) {
    return 'That code is invalid or expired. Request a new code and try again.'
  }
  return action === 'send'
    ? 'HashPayStream could not send the code. Check your connection and try again.'
    : 'HashPayStream could not verify the code. Check your connection and try again.'
}

export function StreamPayEmailLogin({ className = '' }: { className?: string }) {
  const { sendCode, loginWithCode } = useLoginWithEmail()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [codeFocused, setCodeFocused] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = window.setInterval(() => setResendIn(value => Math.max(0, value - 1)), 1_000)
    return () => window.clearInterval(timer)
  }, [resendIn])

  useEffect(() => {
    if (step !== 'code') return
    const frame = window.requestAnimationFrame(() => codeInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [step])

  async function requestCode(event?: FormEvent) {
    event?.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalized)) return setError('Enter a valid email address.')
    setBusy(true)
    setError('')
    setEmail(normalized)
    setCode('')
    setResendIn(RESEND_SECONDS)
    setStep('code')
    try {
      await sendCode({ email: normalized })
    } catch (nextError) {
      setResendIn(0)
      setError(readableError(nextError, 'send'))
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault()
    if (code.length !== CODE_LENGTH) {
      setError('Enter the six-digit code sent to your email.')
      return codeInputRef.current?.focus()
    }
    setBusy(true)
    setError('')
    try {
      await loginWithCode({ code })
    } catch (nextError) {
      setError(readableError(nextError, 'verify'))
      setCode('')
      window.requestAnimationFrame(() => codeInputRef.current?.focus())
    } finally {
      setBusy(false)
    }
  }

  function changeEmail() {
    if (busy) return
    setStep('email')
    setCode('')
    setError('')
  }

  if (step === 'code') return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Verify your email" className="fixed inset-0 z-[150] overflow-y-auto bg-[#F5F5F7] px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-gray-950">
      <button type="button" disabled={busy} onClick={changeEmail} aria-label="Back to email" className="fixed left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-950 shadow-sm transition active:scale-95 disabled:opacity-50">
        <ArrowLeftIcon className="h-5 w-5" />
      </button>
      <main className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-[430px] flex-col justify-center py-4">
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-[-0.045em]">Check your email</h1>
          <p className="mt-3 text-sm font-medium leading-6 text-gray-500">Enter the code sent to<strong className="mx-auto mt-1.5 block max-w-full break-all text-base font-extrabold leading-6 text-gray-950">{email}</strong></p>
        </div>
        <form onSubmit={verifyCode} className="mt-8">
          <label className="sr-only" htmlFor="hashpaystream-email-code">Six-digit email code</label>
          <div className="relative" onClick={() => codeInputRef.current?.focus()}>
            <div className="grid grid-cols-6 gap-2" aria-hidden="true">
              {Array.from({ length: CODE_LENGTH }, (_, index) => (
                <span key={index} className={`flex aspect-square items-center justify-center rounded-2xl border-2 text-2xl font-black shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition ${code[index] ? 'border-gray-950 bg-gray-950 text-white' : codeFocused && index === code.length ? 'border-blue-600 bg-white text-gray-950 ring-4 ring-blue-500/15' : 'border-gray-300 bg-white text-gray-950'}`}>{code[index] ?? ''}</span>
              ))}
            </div>
            <input ref={codeInputRef} id="hashpaystream-email-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={CODE_LENGTH} value={code} disabled={busy} onFocus={() => setCodeFocused(true)} onBlur={() => setCodeFocused(false)} onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH)); setError('') }} className="absolute inset-0 h-full w-full cursor-text opacity-[0.01]" />
          </div>
          {error && <p role="alert" className="mt-4 text-center text-sm font-semibold leading-5 text-red-600">{error}</p>}
          <button type="submit" disabled={busy || code.length !== CODE_LENGTH} className="mt-6 flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-6 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45">
            {busy ? <LoadingRing className="h-5 w-5" label="Verifying code" /> : 'Continue'}
          </button>
        </form>
        <div className="mt-5 flex items-center justify-center gap-4 text-xs font-semibold">
          <button type="button" disabled={busy || resendIn > 0} onClick={() => void requestCode()} className="text-blue-600 disabled:text-gray-400">{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}</button>
          <span className="h-3 w-px bg-gray-300" aria-hidden="true" />
          <button type="button" disabled={busy} onClick={changeEmail} className="text-gray-600">Change email</button>
        </div>
        <div className="mt-9 text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-500"><LockClosedIcon className="h-4 w-4" />HashPayStream will never ask you to share this code.</p>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400" aria-label="Secured by Privy">
            <span>Secured by</span>
            <img src="/privy-mark-logo.png" alt="" aria-hidden="true" className="h-3.5 w-3.5 object-contain" />
            <span>Privy</span>
          </p>
        </div>
      </main>
    </div>,
    document.body,
  )

  return (
    <form onSubmit={requestCode} className={`space-y-2.5 ${className}`}>
      <label className="sr-only" htmlFor="hashpaystream-sign-in-email">Email address</label>
      <div className="relative">
        <EnvelopeIcon className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input id="hashpaystream-sign-in-email" type="email" inputMode="email" autoComplete="email" spellCheck={false} required value={email} disabled={busy} onChange={event => { setEmail(event.target.value); setError('') }} placeholder="Email address" className="min-h-14 w-full rounded-full border border-gray-200 bg-white px-12 text-sm font-semibold text-gray-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.055] dark:text-white" />
      </div>
      {error && <p role="alert" className="px-3 text-center text-xs font-semibold text-red-600">{error}</p>}
      <button type="submit" disabled={busy || !email.trim()} className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-gray-950">
        <span>{busy ? 'Sending code' : 'Continue with email'}</span>
        <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5 dark:bg-black/[0.06]">{busy ? <LoadingRing className="h-4 w-4" label="Sending code" /> : <ArrowRightIcon className="h-4 w-4" />}</span>
      </button>
    </form>
  )
}
