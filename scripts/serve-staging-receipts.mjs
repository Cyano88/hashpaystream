import express from 'express'
import stagingReceipts from '../api/staging-receipts.ts'
async function main(){
 const target=new URL(process.env.DATABASE_URL||'')
 if(!['postgres:','postgresql:'].includes(target.protocol)||process.env.HASHPAYSTREAM_DATABASE_ENVIRONMENT!=='staging'||process.env.HASHPAYSTREAM_STAGING_RECEIPTS_ENABLED!=='true'||!/(?:^|[_-])stag(?:ing)?(?:$|[_-])/.test(decodeURIComponent(target.pathname.slice(1))))throw Error('STAGING_RECEIPT_SERVER_CONFIGURATION_REQUIRED')
 const app=express();app.disable('x-powered-by')
 app.all('/api/hashpaystream/staging/agreements/:agreementId/receipts',stagingReceipts)
 app.use((_req,res)=>res.status(404).json({ok:false,error:'Not found.'}))
 const port=Number(process.env.HASHPAYSTREAM_STAGING_RECEIPTS_PORT||5180)
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('STAGING_RECEIPT_SERVER_PORT_INVALID')
 const server=app.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({ok:true,component:'staging-receipt-reader',port,loopbackOnly:true,productionWrites:0})))
 server.on('error',()=>{console.error(JSON.stringify({ok:false,error:'STAGING_RECEIPT_SERVER_FAILED'}));process.exitCode=1})
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close())
}
main().catch(e=>{console.error(JSON.stringify({ok:false,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'STAGING_RECEIPT_SERVER_FAILED'}));process.exitCode=1})
