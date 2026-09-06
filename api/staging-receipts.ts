import { createHmac } from 'node:crypto'
import type { Request,Response } from 'express'
import pg from 'pg'
import { verifiedIdentity } from './service-requests.js'
import { renderDurableStoreConnectionConfig } from './durable-store.js'
import { readStagingReceiptWorkflow } from './receipt-workflow-store.js'
import type { SqlClient } from './financial-core.js'
import { receiptSyncHealth } from './receipt-sync-health.js'

type Dependencies={env:()=>NodeJS.ProcessEnv;identity:typeof verifiedIdentity;withClient:<T>(env:NodeJS.ProcessEnv,fn:(client:SqlClient)=>Promise<T>)=>Promise<T>}
const defaultWithClient:Dependencies['withClient']=async(env,fn)=>{
  const pool=new pg.Pool({...renderDurableStoreConnectionConfig(env.DATABASE_URL!),connectionTimeoutMillis:10000,query_timeout:15000})
  let client:pg.PoolClient|undefined
  try{client=await pool.connect();await client.query('begin isolation level repeatable read read only');const result=await fn(client);await client.query('rollback');return result}
  finally{if(client){await client.query('rollback').catch(()=>{});client.release()}await pool.end()}
}
export function createStagingReceiptHandler(overrides:Partial<Dependencies>={}) {
  const dependencies:Dependencies={env:()=>process.env,identity:verifiedIdentity,withClient:defaultWithClient,...overrides}
  return async(req:Request,res:Response)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Authorization')
    const env=dependencies.env()
    if(env.HASHPAYSTREAM_DATABASE_ENVIRONMENT!=='staging'||env.HASHPAYSTREAM_STAGING_RECEIPTS_ENABLED!=='true')return res.status(404).json({ok:false,error:'Not found.'})
    if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'Method not allowed.'})}
    try{
      const target=new URL(env.DATABASE_URL||'')
      if(!['postgres:','postgresql:'].includes(target.protocol)||!/(?:^|[_-])stag(?:ing)?(?:$|[_-])/.test(decodeURIComponent(target.pathname.slice(1))))throw Error('STAGING_DATABASE_REQUIRED')
      const secret=env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET||''
      if(secret.length<32)throw Error('OWNERSHIP_CONFIGURATION_REQUIRED')
      const identity=await dependencies.identity(req,env)
      if(!identity.userId||!identity.email)throw Object.assign(Error('AUTHENTICATION_REQUIRED'),{status:401})
      const accountReference=createHmac('sha256',secret).update('hashpaystream.account\0'+identity.email.toLowerCase()).digest('hex')
      const agreementId=String(req.params.agreementId||'')
      if(!/^agr_[a-z0-9]{12,64}$/i.test(agreementId))return res.status(404).json({ok:false,error:'Not found.'})
      const view=await dependencies.withClient(env,async client=>{
        const health=(await client.query<{state:string;verified_at:Date|string}>('select state,verified_at from hashpaystream.receipt_sync_health where singleton=true')).rows[0]
        if(!receiptSyncHealth(health).ready)throw Error('STAGING_RECEIPTS_NOT_READY')
        return readStagingReceiptWorkflow(client,{identityDomain:'human',accountReference},agreementId)
      })
      return view?res.status(200).json({ok:true,...view}):res.status(404).json({ok:false,error:'Not found.'})
    }catch(reason){const status=(reason as {status?:number})?.status===401?401:503;return res.status(status).json({ok:false,error:status===401?'Sign in to continue.':'Verified receipts are temporarily unavailable.'})}
  }
}
export default createStagingReceiptHandler()
