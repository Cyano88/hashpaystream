import { createHash } from 'node:crypto'
import pg from 'pg'
import { createPublicClient, fallback, http, parseAbi } from 'viem'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'
import { verifyConfirmedReceipt } from '../api/chain-receipt-evidence.ts'
import { planReceiptLedger } from '../api/chain-receipt-ledger.ts'
import { postLedgerTransaction, registerLedgerAccount } from '../api/financial-core.ts'
import { loadTransactionReceipt } from './chain-receipt-rpc.mjs'

const write = process.argv.includes('--confirm-staging-ledger-backfill')
const rollbackOnly = process.argv.includes('--confirm-rollback-only-ledger-check')
const sourceSql = 'select observation_id, network, chain_id::text, transaction_hash, log_index, observation_type, block_number::text, block_hash, contract_address, event_name, payload_hash, payload from hashpaystream.chain_observations order by network, block_number, transaction_hash, log_index'
const fingerprint = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex')
const balanceAbi = parseAbi(['function balanceOf(address) view returns (uint256)'])
const specs = {
  'arc-testnet': { chainId: 5042002, urls: ['https://rpc.testnet.arc.network', 'https://rpc.blockdaemon.testnet.arc.network', 'https://rpc.drpc.testnet.arc.network', 'https://rpc.quicknode.testnet.arc.network'] },
  'xlayer-mainnet': { chainId: 196, urls: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'] },
}
function boundary() {
  if (write === rollbackOnly) throw new Error('EXACTLY_ONE_LEDGER_MODE_REQUIRED')
  const target = new URL(process.env.DATABASE_URL || '')
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('TARGET_DATABASE_INVALID')
  const name = decodeURIComponent(target.pathname.slice(1)).toLowerCase()
  if (!/(?:^|[_-])stag(?:ing)?(?:$|[_-])/.test(name) || process.env.HASHPAYSTREAM_DATABASE_ENVIRONMENT !== 'staging') throw new Error('STAGING_DATABASE_REQUIRED')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) && !process.argv.includes('--allow-remote-staging-database')) throw new Error('REMOTE_STAGING_NOT_ALLOWED')
  for (const key of ['HASHPAYSTREAM_LEGACY_DATABASE_URL', 'HASHPAYSTREAM_HASH_PAYLINK_DATABASE_URL']) {
    const source = new URL(process.env[key] || '')
    // Database-name comparison also rejects source aliases or changed credentials.
    if (decodeURIComponent(source.pathname.slice(1)).toLowerCase() === name) throw new Error('PRODUCTION_SOURCE_TARGET_COLLISION')
  }
  return { target: target.toString(), name }
}
async function main() {
  const config = boundary()
  const pool = new pg.Pool({ ...renderDurableStoreConnectionConfig(config.target), connectionTimeoutMillis:10000, query_timeout:30000 })
  let client, open = false
  try {
    client = await pool.connect()
    const database = await client.query('select current_database() as name')
    if (database.rows[0].name !== config.name) throw new Error('ACTUAL_DATABASE_NAME_MISMATCH')
    await client.query('begin read only')
    const rows = (await client.query(sourceSql)).rows
    await client.query('rollback')
    if (!rows.length || rows.some(row => row.observation_type !== 'confirmed')) throw new Error('RECEIPT_SET_NOT_CONFIRMED')
    const sourceHash = fingerprint(rows)
    const networks = new Map()
    for (const network of [...new Set(rows.map(row=>row.network))]) {
      const spec = specs[network]
      if (!spec) throw new Error('NETWORK_UNSUPPORTED')
      const clients = spec.urls.map(url=>createPublicClient({transport:http(url,{timeout:10000,retryCount:0})}))
      const chain = createPublicClient({transport:fallback(spec.urls.map(url=>http(url,{timeout:10000,retryCount:0})),{retryCount:0})})
      if (await chain.getChainId() !== spec.chainId) throw new Error('RPC_CHAIN_MISMATCH')
      const head = await chain.getBlock({blockTag:'latest'})
      networks.set(network,{chain,clients,head,blocks:new Map(),receipts:new Map()})
    }
    const verified = []
    console.log(JSON.stringify({stage:'ledger_receipt_reverification',observations:rows.length,productionWrites:0}))
    for (const row of rows) {
      const n = networks.get(row.network), p = row.payload
      if (Number(row.chain_id) !== specs[row.network].chainId || p.network !== row.network || Number(p.chainId) !== Number(row.chain_id) || p.contractAddress !== row.contract_address || p.eventName !== row.event_name) throw new Error('OBSERVATION_METADATA_MISMATCH')
      if (!n.receipts.has(row.transaction_hash)) n.receipts.set(row.transaction_hash, await loadTransactionReceipt(n.chain,row.transaction_hash,n.clients))
      const transaction = n.receipts.get(row.transaction_hash)
      if (!n.blocks.has(row.block_number)) n.blocks.set(row.block_number,await n.chain.getBlock({blockNumber:BigInt(row.block_number)}))
      const block = n.blocks.get(row.block_number)
      if (block.hash !== row.block_hash) throw new Error('RECEIPT_REORG_DETECTED')
      const receipt = verifyConfirmedReceipt(transaction,{...p, expectedBlockNumber:BigInt(row.block_number),expectedBlockHash:block.hash,headBlockNumber:n.head.number})
      if (!receipt.verified || receipt.payloadHash !== row.payload_hash || receipt.logIndex !== row.log_index) throw new Error('INDEXED_RECEIPT_REVERIFICATION_FAILED')
      verified.push({observationId:row.observation_id,receipt,occurredAt:new Date(Number(block.timestamp)*1000).toISOString()})
    }
    const plan = planReceiptLedger(verified)
    const chainBalances = new Map()
    for (const account of plan.accounts.filter(a=>a.controlled)) {
      const n = networks.get(account.network)
      const observed = await n.chain.readContract({address:account.assetAddress,abi:balanceAbi,functionName:'balanceOf',args:[account.address],blockNumber:n.head.number})
      let reconstructed = 0n
      for (const {receipt} of verified) if (receipt.payload.network === account.network && receipt.payload.tokenAddress.toLowerCase() === account.assetAddress) for (const transfer of receipt.payload.transfers) {
        if (transfer.to.toLowerCase() === account.address) reconstructed += BigInt(transfer.amountUnits)
        if (transfer.from.toLowerCase() === account.address) reconstructed -= BigInt(transfer.amountUnits)
      }
      if (observed !== reconstructed || observed !== plan.balances.get(account.accountId)) throw new Error('ONCHAIN_LEDGER_PLAN_BALANCE_MISMATCH')
      chainBalances.set(account.accountId, observed)
    }
    for (const {chain,head} of networks.values()) if ((await chain.getBlock({blockNumber:head.number})).hash !== head.hash) throw new Error('AUDIT_HEAD_REORG_DETECTED')
    console.log(JSON.stringify({stage:'ledger_plan_verified',postings:plan.postings.length,accounts:plan.accounts.length,controlledAccounts:chainBalances.size,productionWrites:0}))
    await client.query('begin isolation level serializable'); open = true
    await client.query("set local statement_timeout='30s'")
    await client.query("set local lock_timeout='5s'")
    await client.query("select pg_advisory_xact_lock(hashtext('hashpaystream.receipt-ledger.v1'))")
    if (fingerprint((await client.query(sourceSql)).rows) !== sourceHash) throw new Error('RECEIPT_SET_CHANGED_DURING_AUDIT')
    const before = Number((await client.query('select count(*)::int as count from hashpaystream.ledger_transactions')).rows[0].count)
    for (const account of plan.accounts) await registerLedgerAccount(client,account)
    async function pass() {
      const counts = {posted:0,duplicate:0}
      for (const posting of plan.postings) counts[(await postLedgerTransaction(client,posting,{callerTransaction:true})).status]++
      return counts
    }
    const first = await pass(), second = await pass()
    if (second.posted !== 0 || second.duplicate !== plan.postings.length) throw new Error('LEDGER_SECOND_PASS_NOT_IDEMPOTENT')
    const stored = (await client.query('select p.posting_id, p.reference_id, p.status, e.line_number, e.account_id, e.side, e.amount_units::text, e.memo_code from hashpaystream.ledger_transactions p join hashpaystream.ledger_entries e using(posting_id) order by p.posting_id,e.line_number')).rows
    const expected = new Map(plan.postings.flatMap(p=>p.entries.map(e=>[`${p.postingId}:${e.lineNumber}`,{p,e}])))
    if (stored.length !== expected.size) throw new Error('LEDGER_ENTRY_COVERAGE_MISMATCH')
    for (const row of stored) {
      const match=expected.get(`${row.posting_id}:${row.line_number}`)
      if (!match || row.status !== 'posted' || row.reference_id !== match.p.referenceId || row.account_id !== match.e.accountId || row.side !== match.e.side || row.amount_units !== match.e.amountUnits || row.memo_code !== match.e.memoCode) throw new Error('LEDGER_STORED_ENTRY_MISMATCH')
    }
    const actual = (await client.query("select account_id,sum(case when side='credit' then amount_units else -amount_units end)::text as balance from hashpaystream.ledger_entries group by account_id")).rows
    if (actual.length !== plan.accounts.length || actual.some(row=>BigInt(row.balance)!==plan.balances.get(row.account_id))) throw new Error('LEDGER_ACCOUNT_RECONCILIATION_FAILED')
    const transactions = Number((await client.query("select count(*)::int as count from hashpaystream.ledger_transactions where status='posted'")).rows[0].count)
    if (transactions !== plan.postings.length) throw new Error('LEDGER_POSTING_COVERAGE_MISMATCH')
    // A deliberate altered duplicate must fail and leave the surrounding batch intact.
    await client.query('savepoint duplicate_conflict_check')
    let rejected=false
    try {
      await postLedgerTransaction(client,{...plan.postings[0],occurredAt:'2000-01-01T00:00:00.000Z'},{callerTransaction:true})
    } catch(e) { if(e.message!=='LEDGER_IDEMPOTENCY_CONFLICT') throw e; rejected=true }
    await client.query('rollback to savepoint duplicate_conflict_check')
    if(!rejected) throw new Error('ALTERED_DUPLICATE_NOT_REJECTED')
    await client.query(rollbackOnly?'rollback':'commit'); open=false
    const after=Number((await client.query('select count(*)::int as count from hashpaystream.ledger_transactions')).rows[0].count)
    if(after !== (rollbackOnly?before:plan.postings.length)) throw new Error('LEDGER_PERSISTENCE_CHECK_FAILED')
    console.log(JSON.stringify({ok:true,mode:rollbackOnly?'rollback-only':'staging-write',observations:verified.length,postings:plan.postings.length,entries:expected.size,accounts:plan.accounts.length,controlledAccounts:chainBalances.size,firstPass:first,secondPass:second,entryReconciliation:'matched',accountReconciliation:'matched',onchainReconciliation:'matched',alteredDuplicateRejected:rejected,persistedPostings:after,productionWrites:0}))
  } finally {if(client&&open)await client.query('rollback').catch(()=>{});client?.release();await pool.end()}
}
main().catch(e=>{console.error(JSON.stringify({ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'LEDGER_BACKFILL_FAILED',productionWrites:0}));process.exitCode=1})