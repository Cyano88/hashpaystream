import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'
import { checkedDirectory, command, encryptCommand, toolEnvironment } from './lib/encrypted-backup.mjs'

export const tradeBackupTables = ['hashpaystream_trade_blocks', 'hashpaystream_trade_listings', 'hashpaystream_trade_messages', 'hashpaystream_trade_reports', 'hashpaystream_trade_threads']

export async function exportTradeBackup(env = process.env) {
  const url = new URL(env.HASHPAYSTREAM_TRADE_DATABASE_URL || '')
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || url.pathname !== '/hashpaystream_trade_pilot'
    || decodeURIComponent(url.username) !== 'hashpaystream_trade_pilot_user'
    || [...url.searchParams.keys()].some(key => key !== 'sslmode')
    || url.hash) throw Error('TRADE_DATABASE_REQUIRED')
  const recipient = env.HASHPAYSTREAM_TRADE_BACKUP_RECIPIENT
  if (!/^age1[0-9a-z]{58}$/.test(recipient ?? '')) throw Error('AGE_PUBLIC_RECIPIENT_REQUIRED')
  const directory = await checkedDirectory(env.HASHPAYSTREAM_TRADE_BACKUP_DIRECTORY)
  const dump = env.HASHPAYSTREAM_PG_DUMP_PATH, age = env.HASHPAYSTREAM_AGE_PATH
  for (const executable of [dump, age]) {
    if (!executable || !path.isAbsolute(executable)) throw Error('BACKUP_EXECUTABLE_REQUIRED')
    await fs.access(executable)
  }
  const version = command(dump, ['--version'], toolEnvironment())
  version.child.stdin.end()
  let versionText = ''
  for await (const chunk of version.child.stdout) {
    versionText += chunk
    if (versionText.length > 1024) { version.child.kill(); throw Error('PG_DUMP_VERSION_INVALID') }
  }
  await version.done
  if (!/^pg_dump \(PostgreSQL\) 18\./.test(versionText)) throw Error('PG_DUMP_18_REQUIRED')
  const connection = renderDurableStoreConnectionConfig(url.toString(), env)
  const client = new pg.Client({ ...connection, connectionTimeoutMillis: 15000, statement_timeout: 30000 })
  try {
    await client.connect()
    await client.query('begin isolation level repeatable read read only')
    const identity = (await client.query('select current_database() as db, session_user as role, current_setting(\'server_version_num\')::int as version')).rows[0]
    if (identity.db !== 'hashpaystream_trade_pilot' || identity.role !== 'hashpaystream_trade_pilot_user' || Math.floor(identity.version / 10000) !== 18) throw Error('TRADE_DATABASE_REQUIRED')
    const role = (await client.query('select rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname=session_user')).rows[0]
    if (!role || role.rolsuper || role.rolcreatedb || role.rolcreaterole) throw Error('RESTRICTED_TRADE_ROLE_REQUIRED')
    const tables = (await client.query("select schemaname, tablename from pg_tables where schemaname not in ('pg_catalog','information_schema') and schemaname not like 'pg_%' order by tablename")).rows
    if (JSON.stringify(tables) !== JSON.stringify(tradeBackupTables.map(tablename => ({ schemaname: 'public', tablename })))) throw Error('UNEXPECTED_TRADE_SCHEMA')
    const snapshot = (await client.query('select pg_export_snapshot() as id')).rows[0].id
    // Strip inherited libpq overrides; the dedicated Trade URL is the only source.
    const dumpEnv = toolEnvironment()
    Object.assign(dumpEnv, {
      PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: identity.db,
      PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
      PGCONNECT_TIMEOUT: '15', PGSSLMODE: connection.ssl === false ? 'disable' : 'verify-full',
      PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=120000',
    })
    if (connection.ssl !== false) dumpEnv.PGSSLROOTCERT = env.HASHPAYSTREAM_TRADE_BACKUP_CA_FILE || 'system'
    return await encryptCommand({
      source: { file: dump, args: ['--format=custom', '--no-owner', '--no-acl', '--no-password', '--strict-names', '--snapshot', snapshot, ...tradeBackupTables.flatMap(table => ['--table', 'public.' + table])], env: dumpEnv },
      age, recipient, directory,
    })
  } finally {
    await client.query('rollback').catch(() => {})
    await client.end().catch(() => {})
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportTradeBackup().then(result => console.log(JSON.stringify({ ok: true, ...result })))
    .catch(() => { console.error(JSON.stringify({ ok: false, error: 'TRADE_ENCRYPTED_BACKUP_FAILED' })); process.exitCode = 1 })
}
