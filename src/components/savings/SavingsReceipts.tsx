import { useEffect, useState } from 'react'
import { createPublicClient, http } from 'viem'
import UnifiedReceipt from '../UnifiedReceipt'
import { upfrontXLayerChain } from '../../lib/upfrontChains'
import { XLAYER_USDC_ADDRESS } from '../../lib/useXLayerUsdcBalance'
import { readSavingsReceiptReferences, type PendingSavingsTransaction } from '../../lib/savingsTransaction'
import { savingsPaymentReceipt } from '../../lib/savingsReceipt'
import type { PaylinkReceipt } from '../../lib/paymentReceiptPdf'
import type { useSavingsVault } from '../../lib/useSavingsVault'

export default function SavingsReceipts({ savings }: { savings: ReturnType<typeof useSavingsVault> }) {
  const [references, setReferences] = useState<PendingSavingsTransaction[]>([])
  const [error, setError] = useState('')
  const scopeKey = `${savings.address}:${savings.vaultAddress}`
  useEffect(() => {
    setReferences([]); setError('')
    if (!savings.address || !savings.vaultAddress) return
    try { setReferences(readSavingsReceiptReferences({ chainId: 196, owner: savings.address, vault: savings.vaultAddress, asset: XLAYER_USDC_ADDRESS })) }
    catch { setError('Saved receipt references could not be loaded on this device.') }
  }, [scopeKey, savings.plans, savings.hasPendingTransaction])
  if (!savings.address || !savings.vaultAddress || (!references.length && !error)) return null
  const scope = { chainId: 196, owner: savings.address, vault: savings.vaultAddress, asset: XLAYER_USDC_ADDRESS }
  return <section className='mt-7'><h2 className='text-sm font-black'>Savings receipts</h2><p className='mt-1 text-[11px] text-zinc-500'>Recent transactions saved on this device.</p>{error && <p role='alert' className='mt-2 text-xs text-red-500'>{error}</p>}<div className='mt-3 space-y-3'>{references.map(reference => <SavingsReceiptEntry key={`${scopeKey}:${reference.hash}`} reference={reference} scope={scope} />)}</div></section>
}

function SavingsReceiptEntry({ reference, scope }: { reference: PendingSavingsTransaction; scope: Parameters<typeof savingsPaymentReceipt>[0] }) {
  const [receipt, setReceipt] = useState<PaylinkReceipt>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function verify() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const client = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const transaction = await client.getTransactionReceipt({ hash: reference.hash })
      const [block, head] = await Promise.all([client.getBlock({ blockNumber: transaction.blockNumber }), client.getBlockNumber()])
      if (head < transaction.blockNumber + 1n) throw new Error('Awaiting confirmation')
      setReceipt(savingsPaymentReceipt(scope, reference, transaction, block))
    } catch { setError('Receipt could not be verified. Try again.') }
    finally { setBusy(false) }
  }
  return <div className='rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-[#151515]'><p className='text-xs font-bold'>{reference.intent.action === 'createPlan' ? 'Savings deposit' : 'Savings withdrawal'}</p><p className='mt-1 truncate font-mono text-[10px] text-zinc-500'>{reference.hash}</p>{receipt ? <UnifiedReceipt receipt={receipt} compact className='mt-3' /> : <button type='button' disabled={busy} onClick={() => void verify()} className='mt-3 text-xs font-bold disabled:opacity-50'>{busy ? 'Verifying receipt...' : 'View receipt'}</button>}{error && <p role='alert' className='mt-2 text-xs text-red-500'>{error}</p>}</div>
}
