import assert from 'node:assert/strict'
import express from 'express'
import stagingReceipts from '../api/staging-receipts.ts'
import {workflowDatabaseBoundary} from './receipt-workflow-source.mjs'
async function main(){
 if(!process.argv.includes('--confirm-read-only-auth-check'))throw Error('READ_ONLY_AUTH_CHECK_REQUIRED')
 workflowDatabaseBoundary()
 if(!process.env.PRIVY_APP_ID||!process.env.PRIVY_APP_SECRET)throw Error('PRIVY_CONFIGURATION_REQUIRED')
 process.env.HASHPAYSTREAM_STAGING_RECEIPTS_ENABLED='true'
 const app=express();app.all('/agreements/:agreementId/receipts',stagingReceipts)
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))})
 try{
 const url=`http://127.0.0.1:${server.address().port}/agreements/agr_synthetic12345/receipts`
 for(const headers of [{},{authorization:'Bearer malformed'}]){const response=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store')}
 console.log(JSON.stringify({ok:true,realAuthenticationAdapter:true,missingTokenRejected:true,malformedTokenRejected:true,validUserSessionTested:false,productionWrites:0}))
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(JSON.stringify({ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'AUTH_CHECK_FAILED',productionWrites:0}));process.exitCode=1})
