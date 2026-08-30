import { useCallback, useEffect, useState } from 'react'
import { usePrivy, useSignTypedData, useWallets } from '@privy-io/react-auth'
import { CheckCircleIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { formatUsdcBalance } from '../lib/useAgreements'
import { Link } from '../lib/router'
import { useStreamPayPath } from '../lib/useStreamPayPath'
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { upfrontXLayerChain } from '../lib/upfrontChains'

type FeeQuote = {
  fundingFeeBps: number
  advanceUsdcUnits: string
  totalFundingFeeUsdcUnits: string
  funderRepaymentUsdcUnits: string
  standardPlatformFeeUsdcUnits: string
  platformFeeUsdcUnits: string
  providerRemainderUsdcUnits: string
  providerTotalUsdcUnits: string
}
type FundingTerms = {
  domain: {
    name: 'HashPayStream Upfront'
    version: '1'
    chainId: number
    verifyingContract: Address
  }
  primaryType: 'FundingTerms'
  message: {
    offerHash: Hex
    funder: Address
    repaymentRecipient: Address
    providerArcRecipient: Address
    platformTreasury: Address
    advanceAmount: string
    funderRepaymentAmount: string
    platformFeeAmount: string
    deadline: number
    nonce: Hex
  }
  signature: Hex
  quote: FeeQuote
}
type Partner = {
  id: string
  name: string
  maximumRequestUsdcUnits: string
  canCoverFullRequest: boolean
  fundingTerms: FundingTerms
}
type Selection = {
  partnerId: string
  partnerName: string
  advanceUsdcUnits: string
  quote?: FeeQuote
  status:
    'pending' | 'declined' | 'funded' | 'released' | 'refunded' | 'expired'
}
const API = '/api/hashpaystream/v1/upfront/opportunities'
const EXPECTED_ESCROW = String(
  import.meta.env.VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS ?? '',
).trim()
const FUNDING_TERMS_TYPES = {
  FundingTerms: [
    { name: 'offerHash', type: 'bytes32' },
    { name: 'funder', type: 'address' },
    { name: 'repaymentRecipient', type: 'address' },
    { name: 'providerArcRecipient', type: 'address' },
    { name: 'platformTreasury', type: 'address' },
    { name: 'advanceAmount', type: 'uint256' },
    { name: 'funderRepaymentAmount', type: 'uint256' },
    { name: 'platformFeeAmount', type: 'uint256' },
    { name: 'deadline', type: 'uint48' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

function QuoteValue({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label}: {value}
    </span>
  )
}

function formatExactUsdc(units: string) {
  const value = BigInt(units)
  const whole = value / 1_000_000n
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '')
  return `${whole}${fraction ? `.${fraction}` : ''} USDC`
}

function PartnerQuote({
  partner,
  busy,
  onSelect,
}: {
  partner: Partner
  busy: boolean
  onSelect: () => void
}) {
  const quote = partner.fundingTerms.quote
  const totalFees = (
    BigInt(quote.totalFundingFeeUsdcUnits) +
    BigInt(quote.standardPlatformFeeUsdcUnits)
  ).toString()
  return (
    <button
      type={'button'}
      disabled={busy}
      onClick={onSelect}
      className={'stream-card w-full px-4 py-3.5 text-left disabled:opacity-50'}
    >
      <span className={'flex items-center gap-3'}>
        <span className={'min-w-0 flex-1'}>
          <span className={'block font-black'}>{partner.name}</span>
          <span className={'mt-1 block text-[10px] text-gray-400'}>
            {partner.canCoverFullRequest
              ? 'Can cover your full request'
              : `Can cover up to ${formatUsdcBalance(partner.maximumRequestUsdcUnits)}`}
          </span>
        </span>
        <ChevronRightIcon className={'h-4 w-4 text-gray-300'} />
      </span>
      <span className={'mt-3 grid grid-cols-3 gap-2 text-[10px]'}>
        <QuoteValue
          label={'Receive now'}
          value={formatExactUsdc(quote.advanceUsdcUnits)}
        />
        <QuoteValue
          label={'Receive later'}
          value={formatExactUsdc(quote.providerRemainderUsdcUnits)}
        />
        <QuoteValue
          label={'Total fees'}
          value={formatExactUsdc(totalFees)}
        />
      </span>
      <span className={'mt-2 block text-[9px] text-gray-400'}>
        Tap once to send your early-pay request.
      </span>
    </button>
  )
}

export default function FundingPartnerPicker({
  requestId,
}: {
  requestId: string
}) {
  const { getAccessToken } = usePrivy()
  const { signTypedData } = useSignTypedData()
  const { wallets } = useWallets()
  const useFundsTo = useStreamPayPath('/move/xlayer/send')
  const [partners, setPartners] = useState<Partner[]>([])
  const [selection, setSelection] = useState<Selection>()
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      setError('')
      try {
        const token = await getAccessToken()
        if (!token)
          throw new Error('Sign in again to choose a funding partner.')
        const response = await fetch(
          `${API}?view=partners&requestId=${encodeURIComponent(requestId)}`,
          { cache: 'no-store', headers: { authorization: `Bearer ${token}` } },
        )
        const body = (await response.json().catch(() => ({}))) as {
          partners?: Partner[]
          selection?: Selection
          error?: string
        }
        if (!response.ok)
          throw new Error(body.error || 'Funding partners could not be loaded.')
        setPartners(body.partners ?? [])
        setSelection(body.selection)
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Funding partners could not be loaded.',
        )
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [getAccessToken, requestId],
  )

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!selection || !['pending', 'funded'].includes(selection.status)) return
    const timer = window.setInterval(() => void load(true), 15_000)
    return () => window.clearInterval(timer)
  }, [load, selection?.status])

  async function select(partner: Partner) {
    setSelecting(partner.id)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to send this funding request.')
      const embedded = wallets.filter(
        (wallet) =>
          wallet.walletClientType === 'privy' ||
          wallet.walletClientType === 'privy-v2',
      )
      if (embedded.length !== 1)
        throw new Error('Your X Layer payout wallet is still connecting.')
      const signer = embedded[0]
      const account = getAddress(signer.address)
      const terms = partner.fundingTerms
      const advanceAmount = BigInt(terms.message.advanceAmount)
      const funderRepaymentAmount = BigInt(terms.message.funderRepaymentAmount)
      const platformFeeAmount = BigInt(terms.message.platformFeeAmount)
      if (
        terms.primaryType !== 'FundingTerms' ||
        terms.domain.chainId !== upfrontXLayerChain.id ||
        !isAddress(terms.domain.verifyingContract) ||
        !isAddress(EXPECTED_ESCROW) ||
        getAddress(terms.domain.verifyingContract) !== getAddress(EXPECTED_ESCROW) ||
        terms.message.advanceAmount !== partner.maximumRequestUsdcUnits ||
        terms.message.advanceAmount !== terms.quote.advanceUsdcUnits ||
        terms.message.funderRepaymentAmount !== terms.quote.funderRepaymentUsdcUnits ||
        terms.message.platformFeeAmount !== terms.quote.platformFeeUsdcUnits ||
        advanceAmount <= 0n ||
        funderRepaymentAmount <= advanceAmount ||
        platformFeeAmount <= 0n ||
        getAddress(terms.message.funder) !== getAddress(terms.message.repaymentRecipient) ||
        getAddress(terms.message.funder) === getAddress(terms.message.providerArcRecipient) ||
        getAddress(terms.message.funder) === getAddress(terms.message.platformTreasury) ||
        getAddress(terms.message.providerArcRecipient) === getAddress(terms.message.platformTreasury)
      )
        throw new Error('The funding quote is invalid.')
      await signer.switchChain(upfrontXLayerChain.id)
      const { signature: providerSignature } = await signTypedData({
        domain: terms.domain,
        types: { FundingTerms: [...FUNDING_TERMS_TYPES.FundingTerms] },
        primaryType: 'FundingTerms',
        message: terms.message,
      }, {
        address: account,
        uiOptions: { showWalletUIs: false },
      })
      const response = await fetch(API, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'select_partner',
          requestId,
          partnerId: partner.id,
          advanceUsdcUnits: partner.maximumRequestUsdcUnits,
          providerSignature,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        selection?: Selection
        error?: string
      }
      if (!response.ok || !body.selection)
        throw new Error(body.error || 'Your funding request could not be sent.')
      setSelection(body.selection)
      setPartners([])
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Your funding request could not be sent.',
      )
    } finally {
      setSelecting('')
    }
  }

  if (loading)
    return (
      <div className="mt-4 space-y-2" aria-label="Loading funding partners">
        <div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.05]" />
        <div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.05]" />
      </div>
    )
  if (selection && ['pending', 'funded', 'released'].includes(selection.status))
    return (
      <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black">
              {selection.status === 'pending'
                ? 'Funding request sent'
                : selection.status === 'funded'
                  ? 'Early pay funded'
                  : 'Early pay received'}
            </p>
            <p className="mt-1 text-[11px] leading-5 opacity-75">
              {selection.partnerName} /{' '}
              {formatUsdcBalance(selection.advanceUsdcUnits)}
            </p>
            {selection.status === 'pending' && (
              <p className="mt-1 text-[10px] opacity-60">
                Waiting for the partner to fund or decline.
              </p>
            )}
            {selection.status === 'funded' && (
              <p className="mt-1 text-[10px] opacity-60">
                The partner funded the protected release. Waiting for X Layer
                confirmation.
              </p>
            )}
            {selection.status === 'released' && (
              <>
                <p className="mt-1 text-[10px] opacity-70">
                  Confirmed on X Layer and available in your HashPayStream
                  wallet.
                </p>
                <Link
                  to={useFundsTo}
                  className="mt-3 inline-flex min-h-9 items-center rounded-full bg-emerald-900 px-4 text-[11px] font-black text-white dark:bg-emerald-300 dark:text-emerald-950"
                >
                  Use funds
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    )

  return (
    <div className="mt-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black text-gray-950 dark:text-white">
            Choose a funding partner
          </p>
          <p className="mt-1 text-[10px] leading-4 text-gray-400">
            Only partners who can cover part or all of this request appear.
          </p>
        </div>
        <span className="text-[10px] font-bold text-gray-400">
          {partners.length}
        </span>
      </div>
      {selection?.status === 'declined' && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[10px] text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
          The previous partner declined. Choose another available partner.
        </p>
      )}
      {partners.length ? (
        <div className="mt-3 space-y-2">
          {partners.map((partner) => (
            <PartnerQuote
              key={partner.id}
              partner={partner}
              busy={Boolean(selecting)}
              onSelect={() => void select(partner)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-gray-50 px-4 py-5 text-center text-xs leading-5 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
          No approved partner has enough available X Layer USDC right now.
        </p>
      )}
      {error && (
        <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-[11px] text-rose-700 dark:bg-rose-400/10 dark:text-rose-300">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-1 font-black underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
