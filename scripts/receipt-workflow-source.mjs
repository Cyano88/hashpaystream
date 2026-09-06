import pg from 'pg'
import { renderDurableStoreConnectionConfig } from '../api/durable-store.ts'
const object=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{}
export function workflowDatabaseBoundary() {
 const target=new URL(process.env.DATABASE_URL||'')
 if(!['postgres:','postgresql:'].includes(target.protocol)||process.env.HASHPAYSTREAM_DATABASE_ENVIRONMENT!=='staging'||!/(?:^|[_-])stag(?:ing)?(?:$|[_-])/.test(target.pathname.slice(1)))throw Error('STAGING_DATABASE_REQUIRED')
 if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)&&!process.argv.includes('--allow-remote-staging-database'))throw Error('REMOTE_STAGING_NOT_ALLOWED')
 for(const key of ['HASHPAYSTREAM_LEGACY_DATABASE_URL','HASHPAYSTREAM_HASH_PAYLINK_DATABASE_URL']) {
  const source=new URL(process.env[key]||'')
  if(!['postgres:','postgresql:'].includes(source.protocol)||decodeURIComponent(source.pathname).toLowerCase()===decodeURIComponent(target.pathname).toLowerCase())throw Error('PRODUCTION_SOURCE_TARGET_COLLISION')
 }
 return target
}
async function read(url,keys) {
 const pool=new pg.Pool({...renderDurableStoreConnectionConfig(url),connectionTimeoutMillis:10000});let c
 try {c=await pool.connect();await c.query('begin isolation level repeatable read read only');await c.query("set local statement_timeout='20s'");const rows=(await c.query('select store_key,value from render_durable_kv where store_key=any($1::text[])',[keys])).rows;await c.query('rollback');return Object.fromEntries(rows.map(r=>[r.store_key,typeof r.value==='string'?JSON.parse(r.value):r.value]))}finally{c?.release();await pool.end()}
}
export async function loadWorkflowSources(observations) {
 const env=process.env
 const keys={humanEvents:env.HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY||'hashpaystream:arc-webhooks:v1',upfrontEvents:env.HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY||'hashpaystream:upfront-arc-webhooks:v1',accounts:env.HASHPAYSTREAM_ACCOUNT_STORE_KEY||'hashpaystream:accounts:v1',requests:env.HASHPAYSTREAM_SERVICE_REQUEST_STORE_KEY||'hashpaystream:service-requests:v1',human:env.HASHPAYSTREAM_HUMAN_AGREEMENT_STORE_KEY||'hashpaystream:human-agreement-owners:v1',upfront:env.HASHPAYSTREAM_UPFRONT_AGREEMENT_STORE_KEY||'hashpaystream:upfront-agreement-owners:v1',agent:env.HASHPAYSTREAM_AGENT_AGREEMENT_STORE_KEY||'hashpaystream:agent-agreement-owners:v1',assessments:env.HASHPAYSTREAM_UPFRONT_STORE_KEY||'hashpaystream:upfront-assessments:v1'}
 if(new Set(Object.values(keys)).size!==Object.keys(keys).length)throw Error('WORKFLOW_SOURCE_DOMAINS_NOT_DISTINCT')
 const [legacy,authoritative]=await Promise.all([read(env.HASHPAYSTREAM_LEGACY_DATABASE_URL,Object.values(keys)),read(env.HASHPAYSTREAM_HASH_PAYLINK_DATABASE_URL,['hashpaylink:arc-agreements:v1','hashpaylink:arc-agreement-activation-attempts:v1'])])
 for(const store of Object.values(legacy))if(store.schema!==1)throw Error('WORKFLOW_SOURCE_SCHEMA_INVALID')
 for(const [key,collection]of [['hashpaylink:arc-agreements:v1','agreements'],['hashpaylink:arc-agreement-activation-attempts:v1','attempts']])if(!authoritative[key]?.[collection]||Array.isArray(authoritative[key][collection])||typeof authoritative[key][collection]!=='object')throw Error('WORKFLOW_AUTHORITATIVE_COLLECTION_INVALID')
 return {events:Object.values({...object(legacy[keys.humanEvents]?.events),...object(legacy[keys.upfrontEvents]?.events)}),accounts:object(legacy[keys.accounts]?.accounts),requests:Object.values(object(legacy[keys.requests]?.requests)),owners:['human','upfront','agent'].flatMap(domain=>Object.values(object(legacy[keys[domain]]?.agreements)).map(o=>({...o,domain}))),drafts:object(authoritative['hashpaylink:arc-agreements:v1']?.agreements),attempts:Object.values(object(authoritative['hashpaylink:arc-agreement-activation-attempts:v1']?.attempts)),assessments:Object.values(object(legacy[keys.assessments]?.records)),observations,secret:env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET||''}
}
