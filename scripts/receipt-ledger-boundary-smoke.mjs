import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
const write='--confirm-staging-ledger-backfill', rollback='--confirm-rollback-only-ledger-check'
const base={...process.env,DATABASE_URL:'postgres://synthetic:synthetic@localhost/staging_audit',HASHPAYSTREAM_DATABASE_ENVIRONMENT:'staging',HASHPAYSTREAM_LEGACY_DATABASE_URL:'postgres://synthetic:synthetic@localhost/legacy',HASHPAYSTREAM_HASH_PAYLINK_DATABASE_URL:'postgres://synthetic:synthetic@localhost/paylink'}
for(const [args,env,error] of [
  [[],{},'EXACTLY_ONE_LEDGER_MODE_REQUIRED'],
  [[write,rollback],{},'EXACTLY_ONE_LEDGER_MODE_REQUIRED'],
  [[write],{DATABASE_URL:'postgres://synthetic:synthetic@localhost/production'},'STAGING_DATABASE_REQUIRED'],
  [[write],{HASHPAYSTREAM_DATABASE_ENVIRONMENT:'production'},'STAGING_DATABASE_REQUIRED'],
  [[write],{DATABASE_URL:'postgres://synthetic:synthetic@invalid.example/staging_audit'},'REMOTE_STAGING_NOT_ALLOWED'],
  [[rollback],{HASHPAYSTREAM_LEGACY_DATABASE_URL:'postgres://different:different@alias.example/staging_audit'},'PRODUCTION_SOURCE_TARGET_COLLISION'],
]) {
  const result=spawnSync(process.execPath,['--import','tsx','scripts/backfill-receipt-ledger.mjs',...args],{env:{...base,...env},encoding:'utf8',timeout:20000})
  assert.equal(result.status,1,result.stderr)
  assert.equal(JSON.parse(result.stderr.trim()).error,error)
  assert.doesNotMatch(result.stderr,/postgres:\/\//)
}
console.log('Receipt ledger staging-boundary checks passed (six rejected unsafe invocations).')
