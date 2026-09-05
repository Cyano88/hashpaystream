import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'

const { Pool } = pg
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const databaseUrl = String(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const confirmed = process.argv.includes('--confirm-additive-financial-core-migration')
const allowRemote = process.argv.includes('--allow-remote-staging-database')

function databaseBoundary(value) {
  let parsed
  try { parsed = new URL(value) } catch { throw new Error('DATABASE_URL_INVALID') }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('DATABASE_URL_INVALID')
  const databaseName = parsed.pathname.replace(/^\//, '').trim().toLowerCase()
  if (!databaseName) throw new Error('DATABASE_NAME_INVALID')
  const host = parsed.hostname.toLowerCase()
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (!local) {
    if (!allowRemote) throw new Error('REMOTE_DATABASE_NOT_ALLOWED')
    if (String(process.env.HASHPAYSTREAM_DATABASE_ENVIRONMENT ?? '').trim().toLowerCase() !== 'staging') {
      throw new Error('STAGING_DATABASE_ATTESTATION_REQUIRED')
    }
    if (!/(?:^|[_-])stag(?:ing)?(?:$|[_-])/.test(databaseName)) {
      throw new Error('STAGING_DATABASE_NAME_REQUIRED')
    }
  }
}

function sha256(value) {
  return createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex')
}

function fail(code) {
  console.error(JSON.stringify({ ok: false, error: code }))
  process.exitCode = 1
}

function resolveMigrationsDirectory() {
  return path.join(root, 'api', 'migrations')
}

if (!databaseUrl) {
  fail('database_not_configured')
} else if (!confirmed) {
  fail('migration_confirmation_required')
} else {
  const pool = new Pool({ ...renderDurableStoreConnectionConfig(databaseUrl), connectionTimeoutMillis: 10_000 })
  let client
  const applied = []
  const existing = []
  try {
    databaseBoundary(databaseUrl)
    client = await pool.connect()
    await client.query('begin')
    await client.query("select pg_advisory_xact_lock(hashtext('hashpaystream.financial-core.migrations'))")
    await client.query('create schema if not exists hashpaystream')
    await client.query([
      'create table if not exists hashpaystream.schema_migrations (',
      'version text primary key,',
      "checksum character(64) not null check (checksum ~ '^[a-f0-9]{64}$'),",
      'applied_at timestamptz not null default now()',
      ')',
    ].join(' '))

    const migrationFiles = readdirSync(resolveMigrationsDirectory())
      .filter(file => /^\d{3}_[a-z0-9_]+\.sql$/.test(file))
      .sort()

    for (const file of migrationFiles) {
      const version = file.replace(/\.sql$/, '')
      const sql = readFileSync(path.join(resolveMigrationsDirectory(), file), 'utf8')
      const checksum = sha256(sql)
      const prior = await client.query(
        'select checksum from hashpaystream.schema_migrations where version = $1',
        [version],
      )
      if (prior.rowCount) {
        if (prior.rows[0].checksum !== checksum) throw new Error('MIGRATION_CHECKSUM_MISMATCH')
        existing.push(version)
        continue
      }
      await client.query(sql)
      await client.query(
        'insert into hashpaystream.schema_migrations (version, checksum) values ($1, $2)',
        [version, checksum],
      )
      applied.push(version)
    }

    await client.query('commit')
    console.log(JSON.stringify({ ok: true, schema: 'hashpaystream', applied, existing }))
  } catch (reason) {
    if (client) await client.query('rollback').catch(() => undefined)
    fail(reason instanceof Error && /^[A-Z0-9_]{3,80}$/.test(reason.message) ? reason.message.toLowerCase() : 'migration_failed')
  } finally {
    client?.release()
    await pool.end().catch(() => undefined)
  }
}
