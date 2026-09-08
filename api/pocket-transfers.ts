import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { createPublicClient, getAddress, http, isAddress, parseAbi, type Hex } from 'viem'
import { mutateDurableJson, readDurableJson } from './durable-store.js'
import { recordVerifiedPocketTransfer, verifiedIdentity } from './stream-accounts.js'
import { circleJson, listCircleArcWallets } from './circle-wallet.js'
import { verifyTransfer } from '../src/lib/walletTransfer.js'

export type PocketTransfer = { id: string; actor: string; chainId: number; owner: `0x${string}`; asset: `0x${string}`; recipient: `0x${string}`; units: string; status: 'awaiting_approval' | 'processing' | 'successful' | 'failed' | 'needs_review'; createdAt: string; updatedAt: string; hash?: Hex; challengeId?: string; transactionId?: string; circlePrepared?: boolean; activityRecorded?: boolean; confirmedAt?: string; circleWalletId?: string; circlePageAfter?: string; legacy?: boolean }
type Store = { records: PocketTransfer[] }
const KEY = 'hashpaystream:pocket-transfers:v1'
const assets: Record<number, `0x${string}`> = { 5042002: '0x3600000000000000000000000000000000000000', 196: '0xB6CEceAB302E2E4948951eE7843FC24E92933061' }
const active = (row: PocketTransfer) => !['successful', 'failed'].includes(row.status)
const fail = (message: string, status = 409): never => { throw Object.assign(Error(message), { status }) }
function client(chainId: number) {
  const rpc = chainId === 5042002 ? process.env.HASHPAYSTREAM_ARC_RPC_URL || 'https://rpc.testnet.arc.network' : process.env.HASHPAYSTREAM_XLAYER_RPC_URL || 'https://rpc.xlayer.tech'
  return createPublicClient({ transport: http(rpc, { timeout: 8000, retryCount: 0 }) })
}
export async function inspectPocketTransfer(input: PocketTransfer): Promise<Partial<PocketTransfer>> {
  const row = { ...input }
  const patch: Partial<PocketTransfer> = {}
  if (!row.hash && row.circlePrepared && row.circleWalletId && !row.legacy) {
    const query = new URLSearchParams({ walletIds: row.circleWalletId, from: new Date(Date.parse(row.createdAt) - 60000).toISOString(), pageSize: '5' })
    if (row.circlePageAfter) query.set('pageAfter', row.circlePageAfter)
    const data = await circleJson(process.env, '/v1/w3s/transactions?' + query)
    const transactions = (data.transactions ?? []) as { id: string; refId?: string; walletId?: string; sourceAddress?: string; state?: string; txHash?: string }[]
    // Circle's live list response can omit refId; only transaction details
    // establish the server-bound intent. Five candidates bound each worker pass.
    const candidates = await Promise.all(transactions.map(async transaction => {
      if (transaction.refId || transaction.walletId !== row.circleWalletId || transaction.sourceAddress?.toLowerCase() !== row.owner.toLowerCase()) return transaction
      const detail = await circleJson(process.env, '/v1/w3s/transactions/' + encodeURIComponent(transaction.id))
      const resolved = detail.transaction as typeof transaction | undefined
      return resolved?.id === transaction.id ? resolved : transaction
    }))
    const matches = candidates.filter(transaction => transaction.refId === 'hashpaystream-pocket:' + row.id && transaction.walletId === row.circleWalletId && transaction.sourceAddress?.toLowerCase() === row.owner.toLowerCase())
    if (matches.length > 1) return { status: 'needs_review' }
    const transaction = matches[0]
    if (!transaction) return { circlePageAfter: transactions.length === 5 ? transactions[transactions.length - 1].id : undefined }
    patch.transactionId = transaction.id
    if (transaction.txHash && /^0x[0-9a-f]{64}$/i.test(transaction.txHash)) { row.hash = transaction.txHash as Hex; patch.hash = row.hash; patch.status = 'processing' }
    else if (['FAILED', 'CANCELLED', 'DENIED'].includes(transaction.state ?? '')) return { ...patch, status: 'failed' }
  }
  if (!row.hash) return patch
  try {
    const rpc = client(row.chainId)
    if (await rpc.getChainId() !== row.chainId) throw Error('Transfer network mismatch.')
    const receipt = await rpc.getTransactionReceipt({ hash: row.hash })
    const [head, block] = await Promise.all([rpc.getBlockNumber(), rpc.getBlock({ blockNumber: receipt.blockNumber })])
    if (receipt.blockHash !== block.hash || receipt.transactionHash.toLowerCase() !== row.hash.toLowerCase()) throw Error('Transfer receipt is not canonical.')
    if (head < receipt.blockNumber + 1n) return patch
    if (receipt.status === 'reverted') {
      const transaction = await rpc.getTransaction({ hash: row.hash })
      return { ...patch, status: transaction.from.toLowerCase() === row.owner.toLowerCase() || transaction.to?.toLowerCase() === row.owner.toLowerCase() ? 'failed' : 'needs_review' }
    }
    try { verifyTransfer(row, row, row.hash, receipt) }
    catch { return { ...patch, status: 'needs_review' } }
    return { ...patch, status: 'successful', confirmedAt: new Date(Number(block.timestamp) * 1000).toISOString() }
  } catch { return patch }
}
async function balance(chainId: number, owner: `0x${string}`) {
  const rpc = client(chainId)
  if (await rpc.getChainId() !== chainId) throw Error('Balance network mismatch.')
  return rpc.readContract({ address: assets[chainId], abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [owner] })
}
export function availablePocketUnits(records: PocketTransfer[], chainId: number, owner: string, units: bigint) {
  // Conservative until verified finality: an already-mined pending payment may
  // temporarily be deducted twice, but a stale balance cannot release its hold.
  const reserved = records.filter(row => active(row) && row.chainId === chainId && row.owner.toLowerCase() === owner.toLowerCase()).reduce((sum, row) => sum + BigInt(row.units), 0n)
  return units > reserved ? units - reserved : 0n
}
const defaults = { recordActivity: recordVerifiedPocketTransfer, identity: verifiedIdentity, circleWallets: listCircleArcWallets, balance, inspect: inspectPocketTransfer, read: () => readDurableJson<Store>(KEY), mutate: (fn: (current: Store | undefined) => Promise<Store> | Store) => mutateDurableJson<Store>(KEY, fn) }
export async function pocketCircleReference(email: string, id: string) {
  const actor = createHash('sha256').update(email.toLowerCase()).digest('hex')
  const row = (await defaults.read())?.records.find(item => item.actor === actor && item.id === id)
  return row && !row.legacy ? 'hashpaystream-pocket:' + id : 'hashpaystream-arc-send'
}

// Called only by the owned-wallet preparation API, before exposing approval.
export async function attachPocketCircleChallenge(email: string, id: string, owner: string, recipient: string, units: string, challengeId: string, circleWalletId: string) {
  const actor = createHash('sha256').update(email.toLowerCase()).digest('hex')
  await defaults.mutate(current => {
    const records = [...(current?.records ?? [])]
    const index = records.findIndex(row => row.actor === actor && row.id === id)
    if (index < 0) return { records } // Older clients did not create a tracking intent.
    const row = records[index]
    if (row.chainId !== 5042002 || row.owner.toLowerCase() !== owner.toLowerCase() || row.recipient.toLowerCase() !== recipient.toLowerCase() || row.units !== units || (row.challengeId && row.challengeId !== challengeId)) fail('Circle approval does not match this payment.')
    records[index] = { ...row, challengeId, circleWalletId, circlePrepared: true, updatedAt: new Date().toISOString() }
    return { records }
  })
}
export function createPocketTransfersHandler(overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides }
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const identity = await deps.identity(req, process.env)
      const actor = createHash('sha256').update(identity.email.toLowerCase()).digest('hex')
      if (req.method === 'GET') return res.json({ ok: true, transfers: ((await deps.read())?.records ?? []).filter(row => row.actor === actor).map(({ actor: _, ...row }) => row) })
      if (req.method !== 'POST') fail('Method not allowed.', 405)
      const body = req.body ?? {}
      const id = String(body.id ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(id)) fail('Payment reference is invalid.', 400)
      let output: PocketTransfer | undefined
      await deps.mutate(async current => {
        const records = [...(current?.records ?? [])]
        const index = records.findIndex(row => row.actor === actor && row.id === id)
        if (body.action === 'create' || body.action === 'import') {
          const chainId = Number(body.chainId)
          if (!assets[chainId] || !isAddress(body.owner) || !isAddress(body.recipient) || /^0x0{40}$/i.test(body.recipient) || (typeof body.units !== 'string' || !/^\d{1,78}$/.test(body.units)) || BigInt(body.units) <= 0n) fail('Payment details are invalid.', 400)
          if (index >= 0) {
            output = records[index]
            if (output.chainId !== chainId || output.owner.toLowerCase() !== body.owner.toLowerCase() || output.recipient.toLowerCase() !== body.recipient.toLowerCase() || output.units !== body.units) fail('Payment reference belongs to different details.')
            return { records }
          }
          const owner = getAddress(body.owner)
          const owned = chainId === 196 ? identity.wallets.some(address => address.toLowerCase() === owner.toLowerCase()) : (await deps.circleWallets(String(body.userToken ?? ''))).some(wallet => wallet.address.toLowerCase() === owner.toLowerCase())
          if (!owned) fail('This wallet is not owned by your signed-in session.', 403)
          if (records.filter(row => row.actor === actor && active(row)).length >= 20) fail('Review your pending payments in Activity before adding more.')
          if (body.action !== 'import' && BigInt(body.units) > availablePocketUnits(records, chainId, owner, await deps.balance(chainId, owner))) fail('Your available USDC is too low after pending payments.')
          const now = new Date().toISOString()
          output = { id, actor, chainId, owner, asset: assets[chainId], recipient: getAddress(body.recipient), units: body.units, status: 'awaiting_approval', createdAt: now, updatedAt: now }
          if (body.action === 'import') {
            output.legacy = true
            if (body.hash && /^0x[0-9a-f]{64}$/i.test(body.hash)) output.hash = body.hash
            if (body.challengeId && /^[0-9a-f-]{36}$/i.test(body.challengeId)) output.challengeId = body.challengeId
            if (body.transactionId && /^[0-9a-f-]{36}$/i.test(body.transactionId)) output.transactionId = body.transactionId
            if (output.hash || output.transactionId) output.status = 'processing'
          }
          records.push(output)
        } else {
          if (index < 0) fail('Payment was not found.', 404)
          const row = records[index]
          if (!active(row)) { output = row; return { records } }
          if (body.action === 'cancel_unsubmitted') {
            if (row.chainId !== 196 || row.status !== 'awaiting_approval' || row.hash || row.challengeId) fail('This payment may already be submitted. Check Activity.')
            output = { ...row, status: 'failed', updatedAt: new Date().toISOString() }; records[index] = output
            return { records }
          }
          if (body.action === 'reconcile_circle') {
            if (row.chainId !== 5042002 || !body.userToken) fail('Open your Circle wallet to check this payment.', 400)
            const wallets = await deps.circleWallets(String(body.userToken))
            if (!wallets.some(wallet => wallet.address.toLowerCase() === row.owner.toLowerCase())) fail('Payment wallet does not match this session.', 403)
            let transactionId = row.transactionId
            if (row.challengeId) {
              const data = await circleJson(process.env, `/v1/w3s/user/challenges/${encodeURIComponent(row.challengeId)}`, { userToken: body.userToken })
              const challenge = data.challenge as { status?: string; correlationIds?: string[] }
              if (row.circlePrepared && challenge.status === 'FAILED' && !challenge.correlationIds?.length) row.status = 'failed'
              if (challenge.correlationIds?.length === 1) transactionId = challenge.correlationIds[0]; else transactionId = undefined
            }
            if (transactionId) {
              const data = await circleJson(process.env, `/v1/w3s/transactions/${encodeURIComponent(transactionId)}`, { userToken: body.userToken })
              const transaction = data.transaction as { walletId?: string; sourceAddress?: string; state?: string; txHash?: string }
              if (!wallets.some(wallet => wallet.address.toLowerCase() === row.owner.toLowerCase() && wallet.id === transaction.walletId) || transaction.sourceAddress?.toLowerCase() !== row.owner.toLowerCase()) fail('Circle transaction does not match this payment wallet.')
              row.transactionId = transactionId
              if (transaction.txHash && /^0x[0-9a-f]{64}$/i.test(transaction.txHash)) { row.hash = transaction.txHash as Hex; row.status = 'processing' }
              else if (row.circlePrepared && ['FAILED', 'CANCELLED', 'DENIED'].includes(transaction.state ?? '')) row.status = 'failed'
            }
            output = { ...row, updatedAt: new Date().toISOString() }; records[index] = output
            return { records }
          }
          if (body.action !== 'track') fail('Payment action is invalid.', 400)
          const hash = body.hash ? String(body.hash) : undefined
          if (hash && !/^0x[0-9a-f]{64}$/i.test(hash)) fail('Transaction hash is invalid.', 400)
          if (hash && records.some(item => item.chainId === row.chainId && (item.id !== row.id || item.actor !== row.actor) && item.hash?.toLowerCase() === hash.toLowerCase())) fail('This transaction already belongs to a payment.')
          if (row.hash && hash && row.hash.toLowerCase() !== hash.toLowerCase()) fail('This payment already has a transaction reference.')
          const identifiers: Partial<PocketTransfer> = {}
          for (const field of ['challengeId', 'transactionId'] as const) {
            if (body[field]) { if (!/^[0-9a-f-]{36}$/i.test(body[field])) fail('Circle reference is invalid.', 400); if (row[field] && row[field] !== body[field]) fail('Circle reference cannot be replaced.'); identifiers[field] = body[field] }
          }
          output = { ...row, ...identifiers, ...(hash ? { hash: hash as Hex } : {}), ...(hash || body.accepted === true ? { status: 'processing' as const } : {}), updatedAt: new Date().toISOString() }
          records[index] = output
        }
        return { records }
      })
      const { actor: _, ...transfer } = output!
      return res.json({ ok: true, transfer })
    } catch (error) { const status = Number((error as { status?: number }).status) || 503; return res.status(status).json({ ok: false, error: status >= 500 ? 'Payment tracking is temporarily unavailable.' : (error as Error).message }) }
  }
}
export async function reconcilePocketTransfers(overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides }
  const records = (await deps.read())?.records ?? []
  const candidates = records.filter(row => (row.hash || (row.circlePrepared && row.circleWalletId && !row.legacy)) && (active(row) || (row.status === 'successful' && row.chainId === 5042002 && !row.activityRecorded))).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, 3)
  await Promise.all(candidates.map(async row => {
    const patch: Partial<PocketTransfer> = active(row) ? await deps.inspect(row).catch(() => ({})) : {}
    if ((patch.status ?? row.status) === 'successful' && row.chainId === 5042002 && !row.activityRecorded) {
      patch.activityRecorded = await deps.recordActivity({ ...row, ...patch, createdAt: patch.confirmedAt ?? row.confirmedAt ?? row.createdAt }).catch(() => false)
    }
    await deps.mutate(current => ({ records: (current?.records ?? []).map(item => item.actor === row.actor && item.id === row.id && item.hash === row.hash && (active(row) ? active(item) : item.status === 'successful') ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) }))
  }))
}
export function startPocketTransferWorker() {
  console.info(JSON.stringify({ event: 'pocket_confirmation_worker_started', intervalMs: 15000, batchSize: 3, canSign: false }))
  let running: Promise<void> | undefined
  const tick = () => { if (!running) running = reconcilePocketTransfers().catch(() => undefined).finally(() => { running = undefined }) }
  const timer = setInterval(tick, 15000); timer.unref(); tick()
  return async () => { clearInterval(timer); await running }
}
export default createPocketTransfersHandler()
