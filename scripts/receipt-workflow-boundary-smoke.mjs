import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
const write='--confirm-staging-workflow-backfill',rollback='--confirm-rollback-only-workflow-check'
const env={...process.env,DATABASE_URL:'postgres://synthetic:synthetic@localhost/staging_audit',HASHPAYSTREAM_DATABASE_ENVIRONMENT:'staging',HASHPAYSTREAM_LEGACY_DATABASE_URL:'postgres://synthetic:synthetic@localhost/legacy',HASHPAYSTREAM_HASH_PAYLINK_DATABASE_URL:'postgres://synthetic:synthetic@localhost/paylink'}
for(const [args,overrides,code]of [
 [[],{},'EXACTLY_ONE_WORKFLOW_MODE_REQUIRED'],[[write,rollback],{},'EXACTLY_ONE_WORKFLOW_MODE_REQUIRED'],
 [[write],{DATABASE_URL:'postgres://synthetic:synthetic@localhost/production'},'STAGING_DATABASE_REQUIRED'],
 [[write],{HASHPAYSTREAM_DATABASE_ENVIRONMENT:'production'},'STAGING_DATABASE_REQUIRED'],
 [[write],{DATABASE_URL:'postgres://synthetic:synthetic@invalid.example/staging_audit'},'REMOTE_STAGING_NOT_ALLOWED'],
 [[rollback],{HASHPAYSTREAM_LEGACY_DATABASE_URL:'postgres://different:different@alias.example/staging_audit'},'PRODUCTION_SOURCE_TARGET_COLLISION']
]){const r=spawnSync(process.execPath,['--import','tsx','scripts/backfill-receipt-workflows.mjs',...args],{env:{...env,...overrides},encoding:'utf8',timeout:20000});assert.equal(r.status,1);assert.equal(JSON.parse(r.stderr.trim()).error,code);assert.doesNotMatch(r.stderr,/postgres:\/\//)}
console.log('Workflow staging boundary rejects six unsafe invocations.')
