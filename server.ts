import path from 'node:path'
import {fileURLToPath} from 'node:url'
import express from 'express'
import {rateLimit} from './api/rate-limit.js'
import {createTradeRouter} from './api/trade-listings.js'
import {checkTradeReadiness} from './api/trade-readiness.js'
import {createHashPayStreamShutdown} from './api/graceful-shutdown.js'
import circleWallet from './api/circle-wallet.js'
import streamAccounts from './api/stream-accounts.js'
import hostedAccount from './api/hosted-account.js'
const app=express(),port=Number(process.env.PORT||10000),root=path.dirname(fileURLToPath(import.meta.url))
let draining=false
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://cdn.prod.website-files.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "child-src https://auth.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org",
    "frame-src https://auth.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
    "connect-src 'self' https://auth.privy.io https://pw-auth.circle.com wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com https://rpc.xlayer.tech https://testrpc.xlayer.tech https://rpc.testnet.arc.network",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '))
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})


app.get('/healthz',(_req,res)=>res.json({ok:true,service:'trade'}))
app.get('/readyz',async(_req,res)=>{try{if(draining||process.env.HASHPAYSTREAM_TRADE_ENABLED!=='true')throw Error('Trade unavailable');await checkTradeReadiness(process.env);res.json({ok:true,service:'trade'})}catch{res.status(503).json({ok:false,error:'Trade is unavailable.'})}})
app.use('/api/hashpaystream/v1/trade',createTradeRouter())
app.use(express.json({limit:'64kb'}))
const retired=(_req:express.Request,res:express.Response)=>res.status(410).json({ok:false,code:'PRODUCT_RETIRED',error:'This service is no longer available.'})
const authActions=new Set(['configuration','request_email_otp','refresh_session','initialize_user','create_wallet','receive_details','list_wallets','get_balance','get_challenge','get_transaction'])
app.post('/api/hashpaystream/v1/circle-wallet',rateLimit({name:'trade-wallet-auth',windowMs:60000,max:30}),(req,res)=>authActions.has(req.body?.action)?circleWallet(req,res):retired(req,res))
app.all('/api/hashpaystream/v1/accounts',rateLimit({name:'trade-wallet-link',windowMs:60000,max:30}),(req,res)=>req.method==='GET'||(req.method==='POST'&&req.body?.action==='register_wallet')?streamAccounts(req,res):retired(req,res))
app.all('/api/hashpaystream/v1/hosted-account',rateLimit({name:'trade-checkout-link',windowMs:60000,max:20}),hostedAccount)
app.use('/api',retired)
app.use('/assets', express.static(path.join(root, 'dist', 'assets'), { immutable: true, maxAge: '1y' }))
app.get('/assets/*', (_req, res) => res.status(404).type('text/plain').send('Asset not found.'))
app.use(express.static(path.join(root, 'dist'), { index: false, maxAge: '1h' }))
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  return res.sendFile(path.join(root, 'dist', 'index.html'))
})


const server=app.listen(port,()=>console.log(`Trade running on port ${port}`))
const shutdown=createHashPayStreamShutdown({server,onDraining:()=>{draining=true},drain:async()=>{},schedule:setTimeout,cancel:clearTimeout,exit:code=>process.exit(code),log:event=>console.log(JSON.stringify(event))})
process.once('SIGTERM',()=>{shutdown('SIGTERM')});process.once('SIGINT',()=>{shutdown('SIGINT')})
