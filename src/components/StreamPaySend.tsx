import { useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { formatUnits, getAddress, isAddress, parseUnits, zeroAddress } from 'viem'
import { Link } from '../lib/router'
import { usePocketTransfers } from '../lib/pocketTransfers'
import { useCircleWallet } from '../lib/circleWallet'
import { useStreamAccount } from '../lib/streamAccount'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { formatUsdcBalance } from '../lib/useAgreements'
import { AgreementSignInLanding } from './agreements/AgreementSignInLanding'

type Mode = 'pocket' | 'address'

export default function StreamPaySend() {
  const { user } = usePrivy()
  return <SendForm key={user?.id ?? 'signed-out'} />
}

function SendForm() {
  const { authenticated } = usePrivy()
  const account = useStreamAccount()
  const wallet = useCircleWallet()
  const transfers = usePocketTransfers()
  const [mode, setMode] = useState<Mode>('pocket')
  const [pocketId, setPocketId] = useState('')
  const [address, setAddress] = useState('')
  const [resolvedName, setResolvedName] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const resolving = useRef(0)
  const submitting = useRef(false)
  const scope = wallet.address ? { chainId: 5042002, owner: getAddress(wallet.address), asset: getAddress('0x3600000000000000000000000000000000000000') } : undefined
  const available = scope ? transfers.available(scope, parseUnits(wallet.balance || '0', 6)) : 0n
  const homeTo = useStreamPayPath('/home')
  if (!authenticated)
    return <AgreementSignInLanding />

  async function resolve() {
    const sequence = ++resolving.current
    setAddress('')
    setError('')
    setResolvedName('')
    try {
      if (!/^\d{6,12}$/.test(pocketId))
        throw new Error('Enter a 6 to 12 digit Pocket ID.')
      const recipient = await account.resolvePocketId(pocketId)
      if (sequence !== resolving.current) return
      setAddress(recipient.walletAddress)
      setResolvedName(recipient.displayName)
    } catch (reason) {
      if (sequence !== resolving.current) return
      setAddress('')
      setError(
        reason instanceof Error ? reason.message : 'Pocket ID was not found.',
      )
    }
  }

  async function send() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const recipient = address.trim()
      const sendAmount = amount
      if (!/^\d+(?:\.\d{1,6})?$/.test(sendAmount)) throw new Error('Enter a valid USDC amount with up to 6 decimals.')
      if (!isAddress(recipient) || getAddress(recipient) === zeroAddress)
        throw new Error(
          mode === 'pocket'
            ? 'Verify the Pocket ID first.'
            : 'Enter a valid Arc wallet address.',
        )
      const units = parseUnits(sendAmount, 6)
      if (units <= 0n) throw new Error('Enter an amount greater than zero.')
      if (!wallet.session) throw new Error('Your Circle wallet is not ready.')
      if (!scope || !transfers.ready) throw Error('Wait for your pending payments to load.')
      const operation = await transfers.begin(scope, { recipient: getAddress(recipient), units: units.toString() })
      if (operation.transfer.status !== 'awaiting_approval' || operation.transfer.hash || operation.transfer.challengeId) {
        operation.releaseDraft()
        setNotice('This payment is already in Activity. You can start another transfer.')
      } else {
        const result = await wallet.sendUsdc(getAddress(recipient), sendAmount, { id: operation.transfer.id, onPrepared: async value => { await transfers.track(operation.transfer.id, value) } })
        operation.releaseDraft()
        setNotice('Transfer processing. Follow its progress in Activity.')
        try { await transfers.track(operation.transfer.id, result) } catch { /* Durable local outbox retries references, never the payment. */ }
      }
      setAmount(''); setAddress(''); setPocketId(''); setResolvedName('')
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Arc USDC could not be sent.',
      )
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <section className="stream-screen w-full max-w-md py-5 sm:py-8">
      <div className="flex items-center gap-3">
        <Link to={homeTo} aria-label="Back home" className="stream-icon-button">
          <ArrowLeftIcon className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-gray-950 dark:text-white">
            Send Arc USDC
          </h1>
          <p className="text-[11px] text-gray-400">Arc Testnet</p>
        </div>
      </div>
      <div className="stream-card mt-5 space-y-4 p-5">
        <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 dark:bg-white/[0.04]">
          <span className="text-xs font-semibold text-gray-500">Available</span>
          <span className="text-sm font-black tabular-nums">
            {!wallet.balanceReady
              ? 'Checking…'
              : formatUsdcBalance(available)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/[0.06]">
          {(['pocket', 'address'] as Mode[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                ++resolving.current
                setMode(value)
                setAddress('')
                setResolvedName('')
                setError('')
              }}
              className={`min-h-12 rounded-full text-xs font-bold ${mode === value ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950' : 'text-gray-500 dark:text-gray-400'}`}
            >
              {value === 'pocket' ? 'Pocket ID' : 'Wallet address'}
            </button>
          ))}
        </div>
        {mode === 'pocket' ? (
          <label className="block">
            <span className="text-[11px] font-bold text-gray-500">
              Recipient Pocket ID
            </span>
            <div className="mt-2 flex gap-2">
              <input
                inputMode="numeric"
                value={pocketId}
                onChange={(event) => {
                  ++resolving.current
                  setPocketId(
                    event.target.value.replace(/\D/g, '').slice(0, 12),
                  )
                  setAddress('')
                  setResolvedName('')
                }}
                placeholder="6 to 12 digit ID"
                className="min-w-0 flex-1 rounded-2xl border border-gray-200 px-4 py-3.5 text-sm font-bold outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]"
              />
              <button
                type="button"
                disabled={!/^\d{6,12}$/.test(pocketId) || busy}
                onClick={() => void resolve()}
                className="min-h-12 rounded-2xl bg-gray-100 px-4 text-xs font-bold text-gray-700 disabled:opacity-40 dark:bg-white/[0.08] dark:text-white"
              >
                Verify
              </button>
            </div>
            {resolvedName && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <CheckCircleIcon className="h-4 w-4" />
                {resolvedName}
              </p>
            )}
          </label>
        ) : (
          <label className="block">
            <span className="text-[11px] font-bold text-gray-500">
              Recipient Arc address
            </span>
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value.trim())}
              placeholder="0x…"
              className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3.5 font-mono text-xs outline-none focus:border-blue-400 dark:border-white/10 dark:bg-white/[0.04]"
            />
          </label>
        )}
        <label className="block">
          <span className="flex items-center justify-between text-[11px] font-bold text-gray-500">
            <span>Amount</span>
            <button
              type="button"
              onClick={() => setAmount(formatUnits(available, 6))}
              className="text-blue-600"
            >
              Max
            </button>
          </span>
          <span className="mt-2 flex items-center rounded-2xl border border-gray-200 px-4 dark:border-white/10">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/[^\d.]/g, ''))
              }
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent py-4 text-base font-bold outline-none"
            />
            <b className="text-xs text-gray-400">USDC</b>
          </span>
        </label>
        {notice && <p role="status" className="text-xs font-semibold text-blue-600">{notice} <Link to={homeTo.replace('/home', '/activity')} className="underline">Activity</Link></p>}
        {(error || account.error || transfers.error) && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200"
          >
            {error || account.error || transfers.error}
          </p>
        )}
        <button
          type="button"
          disabled={busy || !transfers.ready || !amount || !address}
          onClick={() => void send()}
          className="w-full rounded-full bg-gray-950 px-5 py-4 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950"
        >
          {busy ? 'Confirming on Arc…' : 'Confirm send'}
        </button>
        <p className="text-center text-[10px] leading-4 text-gray-400">
          Circle will ask you to approve before test USDC moves.
        </p>
      </div>
    </section>
  )
}
