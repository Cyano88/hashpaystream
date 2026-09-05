import { createHash } from 'node:crypto'
import { getAddress } from 'viem'
import { validateLedgerPosting, type LedgerAccountInput, type LedgerPostingInput } from './financial-core.js'
import type { VerifiedChainReceipt } from './chain-receipt-index.js'

export type LedgerReceipt = { observationId: string; receipt: VerifiedChainReceipt; occurredAt: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const addr = (value: string) => getAddress(value).toLowerCase()
const assets = { 'arc-testnet': '0x3600000000000000000000000000000000000000', 'xlayer-mainnet': '0xb6ceceab302e2e4948951ee7843fc24e92933061' }
const networks = { 'arc-testnet': 5042002, 'xlayer-mainnet': 196 }
const agreementEvents = new Set(['AgreementActivated', 'StepReleased', 'AgreementRefunded', 'AgreementCancelled'])
const advanceEvents = new Set(['AdvanceFunded', 'AdvanceReleased', 'AdvanceRefunded'])

function checkTransfers(receipt: VerifiedChainReceipt) {
  const p = receipt.payload
  if (!receipt.verified || receipt.codes.length || p.chainId !== networks[p.network] || addr(p.tokenAddress) !== assets[p.network]) throw new Error('LEDGER_RECEIPT_NOT_VERIFIED')
  if (!agreementEvents.has(p.eventName) && !advanceEvents.has(p.eventName) && p.eventName !== 'RepaymentSettled') throw new Error('LEDGER_EVENT_UNSUPPORTED')
  if (advanceEvents.has(p.eventName) ? p.network !== 'xlayer-mainnet' : p.network !== 'arc-testnet') throw new Error('LEDGER_EVENT_NETWORK_MISMATCH')
  if (p.eventName === 'RepaymentSettled') {
    if (p.transfers.length !== 3) throw new Error('LEDGER_SPLIT_INVALID')
    for (const [i, role] of ['funder', 'provider', 'treasury'].entries()) {
      const t = p.transfers[i]
      if (addr(t.from) !== addr(p.contractAddress) || addr(t.to) !== addr(p.eventAddresses[role]) || t.amountUnits !== p.eventAmounts[`${role}Amount`]) throw new Error('LEDGER_SPLIT_INVALID')
    }
  } else {
    if (p.transfers.length !== 1) throw new Error('LEDGER_TRANSFER_INVALID')
    const t = p.transfers[0]
    const incoming = p.eventName === 'AgreementActivated' || p.eventName === 'AdvanceFunded'
    const amount = advanceEvents.has(p.eventName) ? p.eventAmounts.advanceAmount : p.eventName === 'AgreementActivated' || p.eventName === 'StepReleased' ? p.eventAmounts.amount : p.eventAmounts.refundedAmount
    if (addr(incoming ? t.to : t.from) !== addr(p.contractAddress) || t.amountUnits !== amount) throw new Error('LEDGER_TRANSFER_INVALID')
    const role = p.eventName === 'AdvanceReleased' ? 'provider' : p.eventName === 'AdvanceFunded' || p.eventName === 'AdvanceRefunded' ? 'funder' : undefined
    if (role && addr(incoming ? t.from : t.to) !== addr(p.eventAddresses[role])) throw new Error('LEDGER_TRANSFER_INVALID')
  }
  for (const t of p.transfers) if (!/^[1-9]\d{0,77}$/.test(t.amountUnits) || addr(t.from) === addr(t.to)) throw new Error('LEDGER_TRANSFER_INVALID')
}

// Credit-normal token-movement accounts. External wallets are clearing accounts,
// not inferred human/agent identities or spendable app balances.
export function planReceiptLedger(input: LedgerReceipt[]) {
  if (!input.length) throw new Error('LEDGER_RECEIPTS_EMPTY')
  const roles = new Map<string, LedgerAccountInput['purpose']>()
  const key = (network: string, token: string, address: string) => [network, addr(token), addr(address)].join(':')
  const sources = new Set<string>()
  for (const { receipt } of input) {
    checkTransfers(receipt)
    const p = receipt.payload
    const identity = [p.network, p.chainId, receipt.transactionHash, receipt.logIndex].join(':')
    if (sources.has(identity)) throw new Error('LEDGER_SOURCE_DUPLICATE_OR_REORG')
    sources.add(identity)
    const role = advanceEvents.has(p.eventName) ? 'advance_deployed' : 'agreement_protected'
    const k = key(p.network, p.tokenAddress, p.contractAddress)
    if (roles.has(k) && roles.get(k) !== role) throw new Error('LEDGER_CONTRACT_ROLE_CONFLICT')
    roles.set(k, role)
  }
  const accounts = new Map<string, LedgerAccountInput & { address: string; controlled: boolean }>()
  function account(network: string, token: string, address: string) {
    const k = key(network, token, address)
    const accountId = `chainacct_${hash(k)}`
    if (!accounts.has(accountId)) accounts.set(accountId, { accountId, identityDomain: 'system', ownerReference: `chain-address:${addr(address)}`, network, assetAddress: addr(token), purpose: roles.get(k) || 'external_clearing', address: addr(address), controlled: roles.has(k) })
    return accountId
  }
  const postings: LedgerPostingInput[] = input.map(({ observationId, receipt, occurredAt }) => {
    const p = receipt.payload
    const identity = [p.network, p.chainId, receipt.transactionHash, receipt.logIndex].join(':')
    const entries = p.transfers.flatMap((t, i) => {
      const memoCode = p.eventName === 'RepaymentSettled' ? `receipt.repayment.${['funder', 'provider', 'platform'][i]}` : `receipt.${p.eventName.toLowerCase()}`
      return [
        { lineNumber: 2 * i + 1, accountId: account(p.network, p.tokenAddress, t.from), side: 'debit' as const, amountUnits: t.amountUnits, memoCode },
        { lineNumber: 2 * i + 2, accountId: account(p.network, p.tokenAddress, t.to), side: 'credit' as const, amountUnits: t.amountUnits, memoCode },
      ]
    })
    const posting = { postingId: `chainpost_${hash(identity)}`, postingKey: `receipt-ledger:v1:${hash(identity)}`, referenceType: 'chain_observation', referenceId: observationId, network: p.network, assetAddress: p.tokenAddress, occurredAt, entries }
    validateLedgerPosting(posting)
    return posting
  })
  const balances = new Map<string, bigint>()
  for (const p of postings) for (const e of p.entries) balances.set(e.accountId, (balances.get(e.accountId) || 0n) + (e.side === 'credit' ? 1n : -1n) * BigInt(e.amountUnits))
  return { accounts: [...accounts.values()], postings, balances }
}