import express from 'express'
import { createTradeRouter } from '../api/trade-listings.js'
import { configuredTradeStore } from '../api/trade-store.js'

const database = new URL(process.env.DATABASE_URL || 'postgres://invalid/invalid')
if (process.env.HASHPAYSTREAM_DATABASE_ENVIRONMENT !== 'trade-pilot' || database.pathname !== '/hashpaystream_trade_pilot') throw new Error('TRADE_PILOT_DATABASE_REQUIRED')
if (process.env.HASHPAYSTREAM_TRADE_ENABLED !== 'true') throw new Error('TRADE_PILOT_MUST_BE_ENABLED')
if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET || (process.env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET || '').length < 32) throw new Error('TRADE_PILOT_AUTH_REQUIRED')
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');next()})
app.get('/healthz',async (_req,res)=>{try{await configuredTradeStore().list();res.json({ok:true,service:'hashpaystream-trade-pilot'})}catch{res.status(503).json({ok:false})}})
app.use('/api/hashpaystream/v1/trade',createTradeRouter())
app.use((_req,res)=>res.status(404).json({ok:false,error:'Route not found.'}))
const server=app.listen(Number(process.env.PORT || 10000),'0.0.0.0',()=>console.log('Trade pilot listening'))
process.on('SIGTERM',()=>server.close(()=>process.exit(0)))
