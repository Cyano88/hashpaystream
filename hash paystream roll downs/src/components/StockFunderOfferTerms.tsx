import { STOCK_FUNDER_RISK } from '../lib/stockFundingOffers'

/** Controlled fields for the existing funder checkout. Publishing must validate again server-side. */
export default function StockFunderOfferTerms({ feePercent, maxFeeBps, acceptedRisk, onFeeChange, onRiskChange, disabled = false }: {
  feePercent: string
  maxFeeBps?: number
  acceptedRisk: boolean
  onFeeChange: (value: string) => void
  onRiskChange: (value: boolean) => void
  disabled?: boolean
}) {
  const ceilingReady = Number.isInteger(maxFeeBps) && maxFeeBps! >= 0 && maxFeeBps! <= 10_000
  const valid = ceilingReady && /^\d+(?:\.\d{1,2})?$/.test(feePercent) && Number(feePercent) <= maxFeeBps! / 100
  return <div className="space-y-3">
    <label className="block text-[11px] font-bold">Early-payment fee (%)
      <input inputMode="decimal" value={feePercent} disabled={disabled || !ceilingReady}
        aria-invalid={Boolean(feePercent) && !valid}
        onChange={event => { onFeeChange(event.target.value); onRiskChange(false) }}
        className="mt-2 block w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.04]" />
    </label>
    <p className="text-[10px] text-gray-500 dark:text-gray-400">{ceilingReady ? `Maximum ${maxFeeBps! / 100}%. Charged once on the quoted USDC value.` : 'Stock offers are not available yet.'}</p>
    {feePercent && !valid && <p role="alert" className="text-xs text-rose-600">Enter a percentage within the limit, with up to two decimal places.</p>}
    <p className="text-[11px] leading-5 text-gray-500 dark:text-gray-400">{STOCK_FUNDER_RISK}</p>
    <label className="flex items-start gap-2 text-[11px] leading-5"><input type="checkbox" className="mt-1" disabled={disabled || !valid} checked={acceptedRisk && valid} onChange={event => onRiskChange(event.target.checked)} />I understand how and when I will be paid.</label>
  </div>
}
