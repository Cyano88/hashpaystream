import type { EarlyPaySettlement } from '../lib/serviceRequests'

function formatUsdc(units: string) {
  try {
    const value = BigInt(units || '0')
    const whole = value / 1_000_000n
    const decimal = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
    return `${decimal ? `${whole}.${decimal}` : whole} USDC`
  } catch {
    return '0 USDC'
  }
}

const STATUS_LABEL: Record<EarlyPaySettlement['status'], string> = {
  requested: 'Funding requested',
  ready_to_release: 'Funding confirmed',
  received: 'Early payment received',
  completed: 'Payment completed',
  refunded: 'Funding returned',
}

export default function EarlyPaySettlementSummary({ settlement }: { settlement: EarlyPaySettlement }) {
  return (
    <details className="group mt-4 rounded-2xl bg-gray-50 px-3.5 py-3 dark:bg-white/[0.04]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[11px] font-black text-gray-950 dark:text-white">Payment split</span>
          <span className="mt-0.5 block truncate text-[10px] text-gray-400">{settlement.partnerName} {'\u00b7'} {STATUS_LABEL[settlement.status]}</span>
        </span>
        <span className="shrink-0 text-[10px] font-bold text-gray-400 group-open:hidden">View</span>
        <span className="hidden shrink-0 text-[10px] font-bold text-gray-400 group-open:inline">Hide</span>
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-200 pt-3 dark:border-white/[0.08]">
        {settlement.status === 'refunded' ? <><Metric label="Funding returned" value={settlement.advanceUsdcUnits} /><Metric label="Partner profit" value="0" /><Metric label="HashPayStream fee" value="0" /></> : <>
        <Metric label="Early payment" value={settlement.advanceUsdcUnits} />
        <Metric label="Provider receives later" value={settlement.providerRemainderUsdcUnits} />
        <Metric label="Provider total" value={settlement.providerTotalUsdcUnits} />
        <Metric label="Partner receives" value={settlement.funderRepaymentUsdcUnits} />
        <Metric label="Partner earns" value={settlement.funderProfitUsdcUnits} />
        <Metric label="HashPayStream fee" value={settlement.platformFeeUsdcUnits} />
        </>}
      </div>
    </details>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.08em] text-gray-400">{label}</p><p className="mt-1 truncate text-[11px] font-black tabular-nums text-gray-950 dark:text-white">{formatUsdc(value)}</p></div>
}
