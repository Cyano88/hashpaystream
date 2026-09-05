import { createHash } from 'node:crypto'
import { getAddress, isAddress, type Address } from 'viem'

export type IdentityDomain = 'human' | 'agent' | 'system'
export type LedgerSide = 'debit' | 'credit'
export type LedgerPurpose =
  | 'user_available'
  | 'agreement_protected'
  | 'agreement_refundable'
  | 'advance_deployed'
  | 'funder_receivable'
  | 'provider_receivable'
  | 'platform_receivable'
  | 'external_clearing'
  | 'suspense'

export type LedgerAccountInput = {
  accountId: string
  identityDomain: IdentityDomain
  ownerReference: string
  network: string
  assetAddress: string
  purpose: LedgerPurpose
}

export type LedgerEntryInput = {
  lineNumber: number
  accountId: string
  side: LedgerSide
  amountUnits: string
  memoCode: string
}

export type LedgerPostingInput = {
  postingId: string
  postingKey: string
  referenceType: string
  referenceId: string
  network: string
  assetAddress: string
  occurredAt: string
  entries: LedgerEntryInput[]
}

export type ValidatedLedgerPosting = Omit<LedgerPostingInput, 'assetAddress'> & {
  assetAddress: Address
  debitUnits: bigint
  creditUnits: bigint
  requestHash: string
}

export type SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> = {
  rowCount: number | null
  rows: Row[]
}

export type SqlClient = {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<SqlResult<Row>>
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,199}$/
const MEMO = /^[a-z0-9_.-]{3,80}$/
const NETWORK = /^[a-z0-9][a-z0-9_.-]{1,79}$/
const PURPOSES = new Set<LedgerPurpose>([
  'user_available',
  'agreement_protected',
  'agreement_refundable',
  'advance_deployed',
  'funder_receivable',
  'provider_receivable',
  'platform_receivable',
  'external_clearing',
  'suspense',
])

function identifier(value: unknown, label: string, maximum = 200) {
  const normalized = String(value ?? '').trim()
  if (!ID.test(normalized) || normalized.length > maximum) throw new Error(label)
  return normalized
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

function requestHash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function amount(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (!/^[1-9]\d{0,77}$/.test(normalized)) throw new Error('LEDGER_AMOUNT_INVALID')
  return BigInt(normalized)
}

function occurredAt(value: unknown) {
  const date = new Date(String(value ?? ''))
  if (!Number.isFinite(date.getTime())) throw new Error('LEDGER_OCCURRED_AT_INVALID')
  return date.toISOString()
}

export function validateLedgerAccount(input: LedgerAccountInput): LedgerAccountInput & { assetAddress: Address } {
  const identityDomain = input.identityDomain
  if (!['human', 'agent', 'system'].includes(identityDomain)) throw new Error('LEDGER_IDENTITY_DOMAIN_INVALID')
  const network = String(input.network ?? '').trim().toLowerCase()
  if (!NETWORK.test(network)) throw new Error('LEDGER_NETWORK_INVALID')
  if (!isAddress(input.assetAddress)) throw new Error('LEDGER_ASSET_INVALID')
  if (!PURPOSES.has(input.purpose)) throw new Error('LEDGER_PURPOSE_INVALID')
  return {
    accountId: identifier(input.accountId, 'LEDGER_ACCOUNT_ID_INVALID'),
    identityDomain,
    ownerReference: identifier(input.ownerReference, 'LEDGER_OWNER_REFERENCE_INVALID', 160),
    network,
    assetAddress: getAddress(input.assetAddress).toLowerCase() as Address,
    purpose: input.purpose,
  }
}

export function validateLedgerPosting(input: LedgerPostingInput): ValidatedLedgerPosting {
  const network = String(input.network ?? '').trim().toLowerCase()
  if (!NETWORK.test(network)) throw new Error('LEDGER_NETWORK_INVALID')
  if (!isAddress(input.assetAddress)) throw new Error('LEDGER_ASSET_INVALID')
  if (!Array.isArray(input.entries) || input.entries.length < 2 || input.entries.length > 32) {
    throw new Error('LEDGER_ENTRY_COUNT_INVALID')
  }

  const seenLines = new Set<number>()
  let debitUnits = 0n
  let creditUnits = 0n
  const entries = input.entries.map(entry => {
    if (!Number.isInteger(entry.lineNumber) || entry.lineNumber < 1 || entry.lineNumber > 32_767 || seenLines.has(entry.lineNumber)) {
      throw new Error('LEDGER_LINE_NUMBER_INVALID')
    }
    seenLines.add(entry.lineNumber)
    if (!['debit', 'credit'].includes(entry.side)) throw new Error('LEDGER_SIDE_INVALID')
    if (!MEMO.test(String(entry.memoCode ?? ''))) throw new Error('LEDGER_MEMO_INVALID')
    const units = amount(entry.amountUnits)
    if (entry.side === 'debit') debitUnits += units
    else creditUnits += units
    return {
      lineNumber: entry.lineNumber,
      accountId: identifier(entry.accountId, 'LEDGER_ACCOUNT_ID_INVALID'),
      side: entry.side,
      amountUnits: units.toString(),
      memoCode: entry.memoCode,
    }
  })

  if (debitUnits === 0n || debitUnits !== creditUnits) throw new Error('LEDGER_POSTING_UNBALANCED')

  const normalized = {
    postingId: identifier(input.postingId, 'LEDGER_POSTING_ID_INVALID'),
    postingKey: identifier(input.postingKey, 'LEDGER_POSTING_KEY_INVALID'),
    referenceType: identifier(input.referenceType, 'LEDGER_REFERENCE_TYPE_INVALID', 80),
    referenceId: identifier(input.referenceId, 'LEDGER_REFERENCE_ID_INVALID', 160),
    network,
    assetAddress: getAddress(input.assetAddress).toLowerCase() as Address,
    occurredAt: occurredAt(input.occurredAt),
    entries,
  }

  return {
    ...normalized,
    debitUnits,
    creditUnits,
    requestHash: requestHash(normalized),
  }
}

export async function registerLedgerAccount(client: SqlClient, input: LedgerAccountInput) {
  const account = validateLedgerAccount(input)
  await client.query(
    [
      'insert into hashpaystream.ledger_accounts',
      '(account_id, identity_domain, owner_reference, network, asset_address, purpose)',
      'values ($1, $2, $3, $4, $5, $6)',
      'on conflict (account_id) do nothing',
    ].join(' '),
    [account.accountId, account.identityDomain, account.ownerReference, account.network, account.assetAddress, account.purpose],
  )
  const existing = await client.query<{
    identity_domain: string
    owner_reference: string
    network: string
    asset_address: string
    purpose: string
  }>(
    [
      'select identity_domain, owner_reference, network, asset_address, purpose',
      'from hashpaystream.ledger_accounts where account_id = $1',
    ].join(' '),
    [account.accountId],
  )
  const stored = existing.rows[0]
  if (
    !stored
    || stored.identity_domain !== account.identityDomain
    || stored.owner_reference !== account.ownerReference
    || stored.network !== account.network
    || stored.asset_address.toLowerCase() !== account.assetAddress
    || stored.purpose !== account.purpose
  ) throw new Error('LEDGER_ACCOUNT_CONFLICT')
  return account
}

// callerTransaction is for atomic batches; the caller must begin and commit/roll back.
export async function postLedgerTransaction(client: SqlClient, input: LedgerPostingInput, options: { callerTransaction?: boolean } = {}) {
  const posting = validateLedgerPosting(input)
  if (!options.callerTransaction) await client.query('begin')
  try {
    const inserted = await client.query<{ posting_id: string }>(
      [
        'insert into hashpaystream.ledger_transactions',
        '(posting_id, posting_key, request_hash, reference_type, reference_id, network, asset_address, occurred_at)',
        'values ($1, $2, $3, $4, $5, $6, $7, $8)',
        'on conflict (posting_key) do nothing returning posting_id',
      ].join(' '),
      [
        posting.postingId,
        posting.postingKey,
        posting.requestHash,
        posting.referenceType,
        posting.referenceId,
        posting.network,
        posting.assetAddress,
        posting.occurredAt,
      ],
    )

    if (!inserted.rowCount) {
      const existing = await client.query<{ posting_id: string; request_hash: string; status: string }>(
        [
          'select posting_id, request_hash, status',
          'from hashpaystream.ledger_transactions where posting_key = $1',
        ].join(' '),
        [posting.postingKey],
      )
      const stored = existing.rows[0]
      if (!stored || stored.request_hash !== posting.requestHash) throw new Error('LEDGER_IDEMPOTENCY_CONFLICT')
      if (stored.status !== 'posted') throw new Error('LEDGER_POSTING_INCOMPLETE')
      if (!options.callerTransaction) await client.query('commit')
      return { postingId: stored.posting_id, status: 'duplicate' as const, requestHash: posting.requestHash }
    }

    for (const entry of posting.entries) {
      await client.query(
        [
          'insert into hashpaystream.ledger_entries',
          '(posting_id, line_number, account_id, side, amount_units, memo_code)',
          'values ($1, $2, $3, $4, $5, $6)',
        ].join(' '),
        [posting.postingId, entry.lineNumber, entry.accountId, entry.side, entry.amountUnits, entry.memoCode],
      )
    }

    const finalized = await client.query(
      [
        'update hashpaystream.ledger_transactions',
        "set status = 'posted', posted_at = now()",
        "where posting_id = $1 and status = 'draft'",
      ].join(' '),
      [posting.postingId],
    )
    if (finalized.rowCount !== 1) throw new Error('LEDGER_POSTING_STATE_CONFLICT')
    if (!options.callerTransaction) await client.query('commit')
    return { postingId: posting.postingId, status: 'posted' as const, requestHash: posting.requestHash }
  } catch (reason) {
    if (!options.callerTransaction) await client.query('rollback').catch(() => undefined)
    throw reason
  }
}
