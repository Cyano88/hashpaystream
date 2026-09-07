import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { command, checksum, encryptCommand, toolEnvironment } from './lib/encrypted-backup.mjs'
import { exportTradeBackup, tradeBackupTables } from './trade-backup.mjs'

const bin = process.env.HASHPAYSTREAM_POSTGRES_TEST_BIN
const age = process.env.HASHPAYSTREAM_AGE_PATH
if (!bin || !age) throw Error('Explicit PostgreSQL 18 and age executable paths required')
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hps-encrypted-backup-fixture-'))
const data = path.join(root, 'data'), backups = path.join(root, 'backups'), key = path.join(root, 'fixture-key.txt')
const exe = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''))
const keygen = path.join(path.dirname(age), 'age-keygen' + (process.platform === 'win32' ? '.exe' : ''))
let started = false, admin, trade, restored
async function run(file, args, env = process.env) {
  if (path.basename(file).startsWith('pg_ctl')) {
    await new Promise((resolve, reject) => {
      const child = spawn(file, args, { env, windowsHide: true, stdio: 'ignore', timeout: 90000 })
      child.once('error', () => reject(Error('FIXTURE_CONTROL_FAILED')))
      child.once('exit', code => code === 0 ? resolve() : reject(Error('FIXTURE_CONTROL_FAILED')))
    })
    return ''
  }
  const process = command(file, args, env)
  process.child.stdin.end()
  let output = ''
  for await (const chunk of process.child.stdout) output += chunk
  await process.done
  return output
}
async function manifest(client) {
  const out = {}
  for (const table of tradeBackupTables) out[table] = (await client.query('select row_to_json(t) as row from public.' + table + ' t order by id')).rows
  out.constraints = (await client.query("select c.relname, con.conname, pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,con.conname")).rows
  out.indexes = (await client.query("select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname")).rows
  return out
}
try {
  assert.equal(toolEnvironment({ PATH: 'fixture', PRIVATE_KEY: 'must-not-reach-child' }).PRIVATE_KEY, undefined)
  await fs.mkdir(backups)
  await run(keygen, ['-o', key])
  const recipient = (await run(keygen, ['-y', key])).trim()
  const password = randomBytes(24).toString('hex')
  const passfile = path.join(root, 'init-pass')
  await fs.writeFile(passfile, password, { mode: 0o600 })
  await run(exe('initdb'), ['-D', data, '-U', 'fixture_admin', '--auth=scram-sha-256', '--pwfile', passfile, '--encoding=UTF8', '--locale=C'])
  await fs.unlink(passfile)
  const socket = net.createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  await run(exe('pg_ctl'), ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', '-h 127.0.0.1 -p ' + port, '-w', 'start'])
  started = true
  console.log('Synthetic PostgreSQL started.')
  const connection = { host: '127.0.0.1', port, user: 'fixture_admin', password, database: 'postgres' }
  admin = new pg.Client(connection); await admin.connect()
  await admin.query("create role hashpaystream_trade_pilot_user login password '" + password + "'")
  await admin.query('create database hashpaystream_trade_pilot owner hashpaystream_trade_pilot_user')
  await admin.query('create database trade_restore_fixture owner hashpaystream_trade_pilot_user')
  trade = new pg.Client({ ...connection, user: 'hashpaystream_trade_pilot_user', database: 'hashpaystream_trade_pilot' })
  await trade.connect()
  await trade.query(`
    create table hashpaystream_trade_listings(id int primary key, data jsonb not null);
    create table hashpaystream_trade_threads(id int primary key, listing_id int references hashpaystream_trade_listings(id));
    create table hashpaystream_trade_messages(id int primary key, thread_id int references hashpaystream_trade_threads(id), body text not null);
    create table hashpaystream_trade_blocks(id int primary key, blocked text not null);
    create table hashpaystream_trade_reports(id int primary key, evidence jsonb not null);
    create index fixture_message_thread on hashpaystream_trade_messages(thread_id);
    insert into hashpaystream_trade_listings values(1,'{"title":"synthetic fixture","photos":["synthetic photo bytes"]}');
    insert into hashpaystream_trade_threads values(1,1);
    insert into hashpaystream_trade_messages values(1,1,'synthetic message');
    insert into hashpaystream_trade_blocks values(1,'synthetic account');
    insert into hashpaystream_trade_reports values(1,'{"fixture":true}');
  `)
  const env = {
    HASHPAYSTREAM_TRADE_DATABASE_URL: 'postgresql://hashpaystream_trade_pilot_user:' + password + '@127.0.0.1:' + port + '/hashpaystream_trade_pilot',
    HASHPAYSTREAM_TRADE_BACKUP_RECIPIENT: recipient,
    HASHPAYSTREAM_TRADE_BACKUP_DIRECTORY: backups,
    HASHPAYSTREAM_PG_DUMP_PATH: exe('pg_dump'), HASHPAYSTREAM_AGE_PATH: age,
  }
  await assert.rejects(exportTradeBackup({ ...env, HASHPAYSTREAM_TRADE_DATABASE_URL: env.HASHPAYSTREAM_TRADE_DATABASE_URL.replace('/hashpaystream_trade_pilot', '/financial_database') }), /TRADE_DATABASE_REQUIRED/)
  await assert.rejects(exportTradeBackup({ ...env, HASHPAYSTREAM_TRADE_BACKUP_RECIPIENT: '' }), /RECIPIENT/)
  await assert.rejects(exportTradeBackup({ ...env, HASHPAYSTREAM_TRADE_BACKUP_DIRECTORY: process.cwd() }), /REPOSITORY/)
  await trade.query('create table unexpected_financial_fixture(id int)')
  await assert.rejects(exportTradeBackup(env), /UNEXPECTED_TRADE_SCHEMA/)
  await trade.query('drop table unexpected_financial_fixture')
  const before = await manifest(trade)
  console.log('Scope guards passed; exporting synthetic data.')
  const result = await exportTradeBackup(env)
  console.log('Encrypted archive created; checking restore and failure cleanup.')
  assert.equal(await checksum(result.file), result.sha256)
  const files = await fs.readdir(backups)
  assert.equal(files.length, 2)
  assert.ok(files.every(name => name.endsWith('.dump.age') || name.endsWith('.sha256')))
  const plain = path.join(root, 'verified-fixture.dump')
  // Restore only after age finishes authenticating the entire archive.
  await run(age, ['--decrypt', '-i', key, '-o', plain, result.file])
  const localEnv = { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'hashpaystream_trade_pilot_user', PGPASSWORD: password, PGSSLMODE: 'disable' }
  await run(exe('pg_restore'), ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname=trade_restore_fixture', plain], localEnv)
  restored = new pg.Client({ ...connection, user: 'hashpaystream_trade_pilot_user', database: 'trade_restore_fixture' })
  await restored.connect()
  assert.deepEqual(await manifest(restored), before)
  assert.deepEqual(await manifest(trade), before, 'Export leaves source unchanged')
  const wrongKey = path.join(root, 'wrong-key.txt')
  await run(keygen, ['-o', wrongKey])
  await assert.rejects(run(age, ['--decrypt', '-i', wrongKey, '-o', path.join(root, 'wrong-key.dump'), result.file]))
  const corrupt = path.join(root, 'corrupt.age')
  const bytes = await fs.readFile(result.file); bytes[bytes.length - 1] ^= 1
  await fs.writeFile(corrupt, bytes)
  await assert.rejects(run(age, ['--decrypt', '-i', key, '-o', path.join(root, 'corrupt.dump'), corrupt]))
  const failureArgs = ['-e', "process.stdout.write('synthetic partial output');process.exit(7)"]
  await assert.rejects(encryptCommand({ source: { file: process.execPath, args: failureArgs, env: process.env }, age, recipient, directory: backups }))
  await assert.rejects(encryptCommand({ source: { file: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], env: process.env }, age, recipient, directory: backups, timeoutMs: 100 }))
  assert.deepEqual(await fs.readdir(backups), files, 'Failures leave no partial or completed backups')
  console.log('PASS: encrypted PostgreSQL 18 restore; all five tables, constraints and indexes match; source unchanged; wrong database/schema/destination rejected; corrupt archive rejected; failed and timed-out exports cleaned up.')
} finally {
  for (const client of [restored, trade, admin]) if (client) await client.end().catch(() => {})
  if (await fs.stat(path.join(data, 'postmaster.pid')).then(() => true, () => false)) await run(exe('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'])
  const real = await fs.realpath(root), temp = await fs.realpath(os.tmpdir())
  if (path.dirname(real) !== temp || !path.basename(real).startsWith('hps-encrypted-backup-fixture-')) throw Error('CLEANUP_SCOPE_MISMATCH')
  await fs.rm(real, { recursive: true, force: true })
  console.log('Synthetic database, archives and disposable recovery key removed.')
}
