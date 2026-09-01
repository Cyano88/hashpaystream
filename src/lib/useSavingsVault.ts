import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPublicClient, getAddress, http, isAddress, zeroAddress, type Address, type Hex } from 'viem'
import { upfrontXLayerChain } from './upfrontChains'
import { XLAYER_USDC_ADDRESS, useXLayerUsdcBalance } from './useXLayerUsdcBalance'
import { nextSavingsRelease } from './savingsSchedule'

export { nextSavingsRelease } from './savingsSchedule'

export const WEEKLY_SECONDS = 7 * 24 * 60 * 60
export const MONTHLY_SECONDS = 30 * 24 * 60 * 60

const rawVault = String(import.meta.env.VITE_HASHPAYSTREAM_SAVINGS_VAULT_ADDRESS ?? '').trim()
export const SAVINGS_VAULT_ADDRESS: Address | undefined = isAddress(rawVault) && getAddress(rawVault) !== zeroAddress ? getAddress(rawVault) : undefined

export const SAVINGS_VAULT_ABI = [
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'planIds', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'bytes32[]' }] },
  { type: 'function', name: 'plans', stateMutability: 'view', inputs: [{ name: 'planId', type: 'bytes32' }], outputs: [
    { name: 'owner', type: 'address' }, { name: 'deposited', type: 'uint256' }, { name: 'withdrawn', type: 'uint256' },
    { name: 'releaseAmount', type: 'uint256' }, { name: 'firstReleaseAt', type: 'uint48' },
    { name: 'interval', type: 'uint32' }, { name: 'emergencyExitAt', type: 'uint48' },
  ] },
  { type: 'function', name: 'remaining', stateMutability: 'view', inputs: [{ name: 'planId', type: 'bytes32' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'withdrawable', stateMutability: 'view', inputs: [{ name: 'planId', type: 'bytes32' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'createPlan', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'interval', type: 'uint32' }, { name: 'releaseAmount', type: 'uint256' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [{ name: 'planId', type: 'bytes32' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'requestEmergencyExit', stateMutability: 'nonpayable', inputs: [{ name: 'planId', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'cancelEmergencyExit', stateMutability: 'nonpayable', inputs: [{ name: 'planId', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'completeEmergencyExit', stateMutability: 'nonpayable', inputs: [{ name: 'planId', type: 'bytes32' }], outputs: [] },
] as const

export type SavingsPlan = {
  id: Hex
  deposited: bigint
  withdrawn: bigint
  remaining: bigint
  withdrawable: bigint
  releaseAmount: bigint
  firstReleaseAt: number
  interval: number
  emergencyExitAt: number
}


export function useSavingsVault() {
  const wallet = useXLayerUsdcBalance()
  const [plans, setPlans] = useState<SavingsPlan[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const activeOwner = useRef('')

  const refresh = useCallback(async () => {
    const request = ++sequence.current
    if (!wallet.ready) return
    const owner = wallet.address?.toLowerCase() ?? ''
    if (activeOwner.current !== owner) {
      activeOwner.current = owner
      setPlans([])
      setReady(false)
    }
    if (!SAVINGS_VAULT_ADDRESS || !wallet.address) {
      if (request === sequence.current) { setPlans([]); setReady(true); setError('') }
      return
    }
    try {
      const client = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const asset = await client.readContract({ address: SAVINGS_VAULT_ADDRESS, abi: SAVINGS_VAULT_ABI, functionName: 'asset' })
      if (getAddress(asset) !== XLAYER_USDC_ADDRESS) throw new Error('The savings vault is not configured for native X Layer USDC.')
      const ids = await client.readContract({ address: SAVINGS_VAULT_ADDRESS, abi: SAVINGS_VAULT_ABI, functionName: 'planIds', args: [wallet.address] })
      if (ids.length > 100) throw new Error('Too many savings plans are attached to this wallet.')
      const snapshotBlock = await client.getBlockNumber()
      const next = await Promise.all(ids.map(async id => {
        const [plan, remaining, withdrawable] = await Promise.all([
          client.readContract({ address: SAVINGS_VAULT_ADDRESS, abi: SAVINGS_VAULT_ABI, functionName: 'plans', args: [id], blockNumber: snapshotBlock }),
          client.readContract({ address: SAVINGS_VAULT_ADDRESS, abi: SAVINGS_VAULT_ABI, functionName: 'remaining', args: [id], blockNumber: snapshotBlock }),
          client.readContract({ address: SAVINGS_VAULT_ADDRESS, abi: SAVINGS_VAULT_ABI, functionName: 'withdrawable', args: [id], blockNumber: snapshotBlock }),
        ])
        return { id, deposited: plan[1], withdrawn: plan[2], releaseAmount: plan[3], firstReleaseAt: Number(plan[4]), interval: Number(plan[5]), emergencyExitAt: Number(plan[6]), remaining, withdrawable }
      }))
      if (request === sequence.current) { setPlans(next); setReady(true); setError('') }
    } catch (reason) {
      if (request === sequence.current) { setReady(true); setError(reason instanceof Error ? reason.message : 'Savings could not be loaded.') }
    }
  }, [wallet.address, wallet.ready])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 20_000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  const totals = useMemo(() => plans.reduce((sum, plan) => ({ saved: sum.saved + plan.remaining, available: sum.available + plan.withdrawable }), { saved: 0n, available: 0n }), [plans])
  const nextRelease = useMemo(() => plans.map(plan => nextSavingsRelease(plan)).filter(Boolean).sort((a, b) => a - b)[0] ?? 0, [plans])
  return { ...wallet, configured: Boolean(SAVINGS_VAULT_ADDRESS), vaultAddress: SAVINGS_VAULT_ADDRESS, plans, savingsReady: ready, savingsError: error, savedUnits: totals.saved, withdrawableUnits: totals.available, nextRelease, refreshSavings: refresh }
}
