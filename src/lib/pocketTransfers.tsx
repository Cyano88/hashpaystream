import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { formatUnits } from 'viem'
import { useXLayerUsdcBalance, XLAYER_USDC_ADDRESS } from './useXLayerUsdcBalance'
import { useCircleWallet, type TransferReferences } from './circleWallet'
import { fetchWithTimeout } from './fetchWithTimeout'
import { readPendingTransfer, transferStorageKey, type TransferScope, type TransferIntent } from './walletTransfer'
import type { PocketTransfer as ServerTransfer } from '../../api/pocket-transfers'
export type PocketTransfer = Omit<ServerTransfer, 'actor'>
const API = '/api/hashpaystream/v1/pocket-transfers'
const terminal = (row: PocketTransfer) => row.status === 'successful' || row.status === 'failed'
const Context = createContext<ReturnType<typeof useTransfers> | null>(null)
function useTransfers() {
  const { user, authenticated, getAccessToken } = usePrivy()
  const wallet = useCircleWallet()
  const xlayer = useXLayerUsdcBalance()
  const actor = authenticated ? user?.id ?? '' : ''
  const current = useRef(actor); current.current = actor
  useEffect(() => { current.current = actor; return () => { if (current.current === actor) current.current = '' } }, [actor])
  const [snapshot, setSnapshot] = useState<{ actor: string; rows: PocketTransfer[] }>({ actor, rows: [] })
  const [readyActor, setReadyActor] = useState('')
  const [error, setError] = useState('')
  const rows = snapshot.actor === actor ? snapshot.rows : []
  const outboxKey = 'hashpaystream:transfer-outbox:' + actor
  const request = useCallback(async (payload?: Record<string, unknown>) => {
    if (!actor || current.current !== actor) throw Error('Your account changed. Reopen Pocket to continue.')
    const token = await getAccessToken()
    if (!token || current.current !== actor) throw Error('Sign in again to continue.')
    const response = await fetchWithTimeout(API, { method: payload ? 'POST' : 'GET', cache: 'no-store', headers: { authorization: `Bearer ${token}`, ...(payload ? { 'content-type': 'application/json' } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
    const data = await response.json()
    if (current.current !== actor) throw Error('Your account changed. Reopen Pocket to continue.')
    if (!response.ok) throw Error(data.error || 'Payment tracking is temporarily unavailable.')
    return data as { transfers: PocketTransfer[]; transfer: PocketTransfer }
  }, [actor, getAccessToken])
  const upsert = useCallback((row: PocketTransfer) => { if (current.current === actor) setSnapshot(previous => ({ actor, rows: [...(previous.actor === actor ? previous.rows.filter(item => item.id !== row.id) : []), row] })) }, [actor])
  const track = useCallback(async (id: string, references: TransferReferences) => {
    // Persist before the request: retrying a failed status write never resends money.
    const outbox = JSON.parse(localStorage.getItem(outboxKey) || '{}')
    outbox[id] = { ...outbox[id], ...references }
    localStorage.setItem(outboxKey, JSON.stringify(outbox))
    if (references.accepted || references.hash) setSnapshot(previous => ({ actor, rows: previous.actor === actor ? previous.rows.map(row => row.id === id && !terminal(row) ? { ...row, ...references, status: 'processing', updatedAt: new Date().toISOString() } : row) : [] }))
    const data = await request({ action: 'track', id, ...outbox[id] })
    const latest = JSON.parse(localStorage.getItem(outboxKey) || '{}')
    // A newer reference must survive an older response.
    if (JSON.stringify(latest[id]) === JSON.stringify(outbox[id])) { delete latest[id]; localStorage.setItem(outboxKey, JSON.stringify(latest)) }
    upsert(data.transfer)
    return data.transfer
  }, [outboxKey, request, upsert])
  const refresh = useCallback(async () => {
    const scopes: TransferScope[] = [
      ...(wallet.address ? [{ chainId: 5042002, owner: wallet.address as `0x${string}`, asset: '0x3600000000000000000000000000000000000000' as `0x${string}` }] : []),
      ...(xlayer.address ? [{ chainId: 196, owner: xlayer.address, asset: XLAYER_USDC_ADDRESS }] : []),
    ]
    for (const scope of scopes) {
      const storageKey = transferStorageKey(scope)
      if (!localStorage.getItem(storageKey)) continue
      const old = readPendingTransfer(scope)
      if (!old) continue
      const migrationKey = storageKey + ':migration-id'
      const id = localStorage.getItem(migrationKey) || (/^[0-9a-f-]{36}$/i.test(old.key) ? old.key : crypto.randomUUID())
      localStorage.setItem(migrationKey, id)
      await request({ action: 'import', id, ...scope, ...old, userToken: scope.chainId === 5042002 ? wallet.session?.userToken : undefined })
      localStorage.removeItem(storageKey)
      localStorage.removeItem(migrationKey)
    }
    const outbox = JSON.parse(localStorage.getItem(outboxKey) || '{}')
    for (const [id, references] of Object.entries(outbox)) await track(id, references as TransferReferences)
    const data = await request()
    if (data.transfers.some(row => terminal(row))) { void wallet.refreshBalance().catch(() => undefined); void xlayer.refresh().catch(() => undefined) }
    setSnapshot(previous => ({ actor, rows: data.transfers.map(row => { const newer = previous.actor === actor ? previous.rows.find(item => item.id === row.id && item.updatedAt > row.updatedAt) : undefined; return newer ?? row }) }))
    setReadyActor(actor); setError('')
    for (const row of data.transfers.filter(row => row.chainId === 5042002 && row.owner.toLowerCase() === wallet.address.toLowerCase() && !terminal(row) && !row.hash && (row.challengeId || row.transactionId)).sort((a,b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, 3)) {
      try { const result = await request({ action: 'reconcile_circle', id: row.id, userToken: wallet.session?.userToken }); upsert(result.transfer) } catch { /* Resume discovery when the wallet session is available. */ }
    }
  }, [actor, outboxKey, request, track, wallet.address, wallet.session?.userToken, wallet.refreshBalance, xlayer.address, xlayer.refresh, upsert])
  useEffect(() => {
    if (!actor) return
    let active = true, busy = false
    const tick = async () => { if (busy || !active) return; busy = true; try { await refresh() } catch (reason) { if (active && current.current === actor) setError(reason instanceof Error ? reason.message : 'Payment status is unavailable.') } finally { busy = false } }
    void tick(); const timer = window.setInterval(() => void tick(), 15000)
    window.addEventListener('focus', tick)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [actor, refresh])
  const begin = useCallback(async (scope: TransferScope, intent: TransferIntent) => {
    const key = 'hashpaystream:transfer-draft:' + actor + ':' + scope.chainId + ':' + scope.owner.toLowerCase() + ':' + intent.recipient.toLowerCase() + ':' + intent.units
    const id = localStorage.getItem(key) || crypto.randomUUID()
    localStorage.setItem(key, id)
    const data = await request({ action: 'create', id, ...scope, ...intent, userToken: scope.chainId === 5042002 ? wallet.session?.userToken : undefined })
    upsert(data.transfer)
    return { transfer: data.transfer, releaseDraft: () => localStorage.removeItem(key) }
  }, [actor, request, upsert, wallet.session?.userToken])
  const available = (scope: TransferScope, units: bigint) => {
    const reserved = rows.filter(row => !terminal(row) && row.chainId === scope.chainId && row.owner.toLowerCase() === scope.owner.toLowerCase()).reduce((sum, row) => sum + BigInt(row.units), 0n)
    return units > reserved ? units - reserved : 0n
  }
  const resume = async (row: PocketTransfer) => {
    if (row.chainId !== 5042002 || row.hash || row.status !== 'awaiting_approval') return
    if (wallet.address.toLowerCase() !== row.owner.toLowerCase()) throw Error('Open the wallet that owns this payment.')
    const found = await wallet.lookupTransfer(row)
    if (found.hash) { await track(row.id, found); return }
    const result = await wallet.sendUsdc(row.recipient, formatUnits(BigInt(row.units), 6), { id: row.id, challengeId: row.challengeId, onPrepared: async value => { await track(row.id, value) } })
    localStorage.removeItem('hashpaystream:transfer-draft:' + actor + ':' + row.chainId + ':' + row.owner.toLowerCase() + ':' + row.recipient.toLowerCase() + ':' + row.units)
    await track(row.id, result)
  }
  const cancelUnsubmitted = async (id: string) => { const result = await request({ action: 'cancel_unsubmitted', id }); upsert(result.transfer) }
  return { rows, cancelUnsubmitted, ready: Boolean(actor && readyActor === actor), error, begin, track, refresh, available, resume }
}
export function PocketTransfersProvider({ children }: { children: ReactNode }) { const value = useTransfers(); return <Context.Provider value={value}>{children}</Context.Provider> }
export function usePocketTransfers() { const value = useContext(Context); if (!value) throw Error('PocketTransfersProvider is missing.'); return value }
