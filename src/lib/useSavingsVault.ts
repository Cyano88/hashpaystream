import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPublicClient, getAddress, http, isAddress, zeroAddress, type Address, type Hex } from 'viem'
import { upfrontXLayerChain } from './upfrontChains'
import { XLAYER_USDC_ADDRESS, useXLayerUsdcBalance } from './useXLayerUsdcBalance'
import { nextSavingsRelease } from './savingsSchedule'

export { nextSavingsRelease } from './savingsSchedule'

export const WEEKLY_SECONDS = 7 * 24 * 60 * 60
export const MONTHLY_SECONDS = 30 * 24 * 60 * 60
const PLAN_ID_PAGE_SIZE = 100n
const PLAN_READ_BATCH_SIZE = 20

const rawVault = String(import.meta.env.VITE_HASHPAYSTREAM_SAVINGS_VAULT_ADDRESS ?? '').trim()
export const SAVINGS_VAULT_ADDRESS: Address | undefined = isAddress(rawVault) && getAddress(rawVault) !== zeroAddress ? getAddress(rawVault) : undefined
const SAVINGS_CONFIG_PATH = '/api/hashpaystream/v1/savings/config'

type SavingsRuntimeConfig = {
  vaultAddress?: Address
  depositsEnabled: boolean
  status: 'active' | 'paused' | 'in_review'
}

function validAddress(value: unknown) {
  if (!isAddress(String(value ?? ''))) return undefined
  const candidate = getAddress(String(value))
  return candidate === zeroAddress ? undefined : candidate
}

function useSavingsRuntimeConfig() {
  const [runtime, setRuntime] = useState<SavingsRuntimeConfig>()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++sequence.current
    try {
      const response = await fetch(SAVINGS_CONFIG_PATH, { headers: { accept: 'application/json' } })
      const payload = await response.json().catch(() => undefined) as {
        ok?: unknown
        savings?: { chainId?: unknown; assetAddress?: unknown; vaultAddress?: unknown; depositsEnabled?: unknown; status?: unknown }
      } | undefined
      if (!response.ok || payload?.ok !== true || !payload.savings) throw new Error('Savings configuration is unavailable.')
      const vaultAddress = payload.savings.vaultAddress === null ? undefined : validAddress(payload.savings.vaultAddress)
      if (Number(payload.savings.chainId) !== upfrontXLayerChain.id) throw new Error('Savings network configuration is invalid.')
      if (getAddress(String(payload.savings.assetAddress)) !== XLAYER_USDC_ADDRESS) throw new Error('Savings asset configuration is invalid.')
      if (payload.savings.vaultAddress !== null && !vaultAddress) throw new Error('Savings vault configuration is invalid.')
      const status = payload.savings.status
      if (status !== 'active' && status !== 'paused' && status !== 'in_review') throw new Error('Savings launch status is invalid.')
      if (request === sequence.current) {
        setRuntime({ vaultAddress, depositsEnabled: payload.savings.depositsEnabled === true && status === 'active', status })
        setError('')
        setReady(true)
      }
    } catch {
      if (request === sequence.current) {
        setRuntime(current => current ? { ...current, depositsEnabled: false, status: 'paused' } : current)
        setError('New savings plans are temporarily unavailable.')
        setReady(true)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  const vaultAddress = runtime?.vaultAddress ?? SAVINGS_VAULT_ADDRESS
  const depositsEnabled = Boolean(
    runtime?.depositsEnabled
    && runtime.vaultAddress
    && vaultAddress
    && runtime.vaultAddress === vaultAddress,
  )
  return { vaultAddress, depositsEnabled, status: runtime?.status ?? 'in_review' as const, configReady: ready, configError: error, refreshConfig: refresh }
}

export const SAVINGS_VAULT_ABI = [
  { type: 'event', name: 'PlanCreated', inputs: [{ name: 'planId', type: 'bytes32', indexed: true }, { name: 'owner', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'releaseAmount', type: 'uint256', indexed: false }, { name: 'firstReleaseAt', type: 'uint48', indexed: false }, { name: 'interval', type: 'uint32', indexed: false }] },
  { type: 'event', name: 'SavingsWithdrawn', inputs: [{ name: 'planId', type: 'bytes32', indexed: true }, { name: 'owner', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'EmergencyExitRequested', inputs: [{ name: 'planId', type: 'bytes32', indexed: true }, { name: 'owner', type: 'address', indexed: true }, { name: 'availableAt', type: 'uint48', indexed: false }] },
  { type: 'event', name: 'EmergencyExitCancelled', inputs: [{ name: 'planId', type: 'bytes32', indexed: true }, { name: 'owner', type: 'address', indexed: true }] },
  { type: 'event', name: 'EmergencyExitCompleted', inputs: [{ name: 'planId', type: 'bytes32', indexed: true }, { name: 'owner', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'function', name: 'asset', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'planCount', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'planIdsPage', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'offset', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ type: 'bytes32[]' }] },
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
  const config = useSavingsRuntimeConfig()
  const [plans, setPlans] = useState<SavingsPlan[]>([])
  const [ready, setReady] = useState(false)
  const [vaultVerified, setVaultVerified] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const activeScope = useRef('')

  const refresh = useCallback(async () => {
    const request = ++sequence.current
    if (!wallet.ready || !config.configReady) return
    const owner = wallet.address?.toLowerCase() ?? ''
    const scope = `${owner}:${config.vaultAddress?.toLowerCase() ?? ''}`
    if (activeScope.current !== scope) {
      activeScope.current = scope
      setPlans([])
      setVaultVerified(false)
      setReady(false)
    }
    if (!config.vaultAddress || !wallet.address) {
      if (request === sequence.current) { setPlans([]); setVaultVerified(false); setReady(true); setError('') }
      return
    }
    const vaultAddress = config.vaultAddress
    try {
      const client = createPublicClient({ chain: upfrontXLayerChain, transport: http() })
      const snapshotBlock = await client.getBlockNumber()
      const [asset, count] = await Promise.all([
        client.readContract({ address: vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'asset', blockNumber: snapshotBlock }),
        client.readContract({ address: vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'planCount', args: [wallet.address], blockNumber: snapshotBlock }),
      ])
      if (getAddress(asset) !== XLAYER_USDC_ADDRESS) throw new Error('The savings vault is not configured for native X Layer USDC.')

      const ids: Hex[] = []
      for (let offset = 0n; offset < count; offset += PLAN_ID_PAGE_SIZE) {
        const page = await client.readContract({ address: vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'planIdsPage', args: [wallet.address, offset, PLAN_ID_PAGE_SIZE], blockNumber: snapshotBlock })
        ids.push(...page)
      }

      const next: SavingsPlan[] = []
      for (let offset = 0; offset < ids.length; offset += PLAN_READ_BATCH_SIZE) {
        const batch = await Promise.all(ids.slice(offset, offset + PLAN_READ_BATCH_SIZE).map(async id => {
          const [plan, remaining, withdrawable] = await Promise.all([
            client.readContract({ address: vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'plans', args: [id], blockNumber: snapshotBlock }),
            client.readContract({ address: vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'remaining', args: [id], blockNumber: snapshotBlock }),
            client.readContract({ address: vaultAddress, abi: SAVINGS_VAULT_ABI, functionName: 'withdrawable', args: [id], blockNumber: snapshotBlock }),
          ])
          return { id, deposited: plan[1], withdrawn: plan[2], releaseAmount: plan[3], firstReleaseAt: Number(plan[4]), interval: Number(plan[5]), emergencyExitAt: Number(plan[6]), remaining, withdrawable }
        }))
        next.push(...batch)
      }
      if (request === sequence.current) { setPlans(next); setVaultVerified(true); setReady(true); setError('') }
    } catch {
      if (request === sequence.current) { setVaultVerified(false); setReady(true); setError('Savings plans are temporarily unavailable.') }
    }
  }, [config.configReady, config.vaultAddress, wallet.address, wallet.ready])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 20_000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  const totals = useMemo(() => plans.reduce((sum, plan) => ({ saved: sum.saved + plan.remaining, available: sum.available + plan.withdrawable }), { saved: 0n, available: 0n }), [plans])
  const nextRelease = useMemo(() => plans.map(plan => nextSavingsRelease(plan)).filter(Boolean).sort((a, b) => a - b)[0] ?? 0, [plans])
  return {
    ...wallet,
    ...config,
    depositsEnabled: config.depositsEnabled && vaultVerified,
    configured: Boolean(config.vaultAddress),
    vaultVerified,
    plans,
    savingsReady: ready,
    savingsError: error,
    savedUnits: totals.saved,
    withdrawableUnits: totals.available,
    nextRelease,
    refreshSavings: refresh,
  }
}
