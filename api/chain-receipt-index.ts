import { createHash } from 'node:crypto'
import type { SqlClient } from './financial-core.js'
import type { verifyConfirmedReceipt } from './chain-receipt-evidence.js'

export type VerifiedChainReceipt = ReturnType<typeof verifyConfirmedReceipt>

function observationId(receipt: VerifiedChainReceipt) {
  const value = [
    receipt.payload.network,
    String(receipt.payload.chainId),
    receipt.transactionHash,
    String(receipt.logIndex),
    receipt.blockHash,
  ].join('\0')
  return `obs_${createHash('sha256').update(value).digest('hex')}`
}

export async function indexVerifiedChainReceipt(client: SqlClient, receipt: VerifiedChainReceipt) {
  if (!receipt.verified || receipt.codes.length > 0) throw new Error('CHAIN_RECEIPT_NOT_VERIFIED')
  if (!Number.isInteger(receipt.logIndex) || Number(receipt.logIndex) < 0) throw new Error('CHAIN_RECEIPT_LOG_INDEX_INVALID')
  const id = observationId(receipt)
  const inserted = await client.query<{ observation_id: string }>([
    'insert into hashpaystream.chain_observations',
    '(observation_id, network, chain_id, transaction_hash, log_index, observation_type, block_number, block_hash, contract_address, event_name, payload_hash, payload)',
    "values ($1, $2, $3, $4, $5, 'confirmed', $6, $7, $8, $9, $10, $11::jsonb)",
    'on conflict (observation_id) do nothing returning observation_id',
  ].join(' '), [
    id,
    receipt.payload.network,
    String(receipt.payload.chainId),
    receipt.transactionHash,
    receipt.logIndex,
    receipt.blockNumber,
    receipt.blockHash,
    receipt.payload.contractAddress,
    receipt.payload.eventName,
    receipt.payloadHash,
    JSON.stringify(receipt.payload),
  ])
  if (inserted.rowCount) return { observationId: id, status: 'indexed' as const }

  const existing = await client.query<{
    payload_hash: string
    transaction_hash: string
    block_hash: string
    log_index: number
    observation_type: string
  }>([
    'select payload_hash, transaction_hash, block_hash, log_index, observation_type',
    'from hashpaystream.chain_observations where observation_id = $1',
  ].join(' '), [id])
  const stored = existing.rows[0]
  if (!stored
    || stored.payload_hash !== receipt.payloadHash
    || stored.transaction_hash !== receipt.transactionHash
    || stored.block_hash !== receipt.blockHash
    || stored.log_index !== receipt.logIndex
    || stored.observation_type !== 'confirmed') throw new Error('CHAIN_OBSERVATION_IDEMPOTENCY_CONFLICT')
  return { observationId: id, status: 'duplicate' as const }
}
