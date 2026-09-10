import { randomBytes, randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/node'
import { getAddress, isAddress, hashTypedData, type Address, type Hex } from 'viem'
import { readDurableJson, mutateDurableJson, hasRenderDurableStore } from './durable-store.js'
import { fundingPartnerAccountKey, type FundingPartnerStore } from './funding-partners.js'
import { readStockConfig, publicStockConfig, stockFailure as fail, type StockConfig } from './stock-early-pay-config.js'
import { createStockChain, readStockMarket, stockMarketEvidence, type StockChain, type StockMarketSnapshot, type StockReceiptProof } from './stock-early-pay-chain.js'
import { STOCK_OFFER_TYPES, stockDomain, stockOfferMessage, type StockOfferWire } from '../src/lib/stockEarlyPayProtocol.js'
import { stockOfferUnavailableReason, stockFeeUnits, rankFundingOffers, type StockOffer, type StockEligibilityContext } from '../src/lib/stockFundingOffers.js'

export type StockIdentity = { userId:string; wallet:Address; emails:string[] }
type RegisteredEarnings = { id:Hex; employerId:string; title:string }
type StockRequest = { id:string; earningsId:Hex; workerId:string; principal:string }
type StoredOffer = { id:Hex; requestId:string; funderId:string; funderUserId:string; funderName:string; offer:StockOfferWire; signature?:Hex; delivery?:StockReceiptProof; repayment?:StockReceiptProof }
export type StockStore = { schema:1; earnings:Record<string,RegisteredEarnings>; requests:Record<string,StockRequest>; offers:Record<string,StoredOffer> }
export type StockDependencies = {
 env:()=>NodeJS.ProcessEnv; identity:(req:Request,env:NodeJS.ProcessEnv)=>Promise<StockIdentity>;
 hasStore:()=>boolean; read:(key:string)=>Promise<StockStore|undefined>;
 mutate:(key:string,fn:(store:StockStore|undefined)=>StockStore)=>Promise<StockStore>;
 partners:()=>Promise<FundingPartnerStore|undefined>; chain:(c:StockConfig)=>Promise<StockChain>;
 market:(c:StockConfig)=>Promise<StockMarketSnapshot>
}
function empty(value?:StockStore):StockStore {
 if(value&&value.schema!==1)fail('Stock payment storage requires review.',503)
 return value ? structuredClone(value) : {schema:1,earnings:{},requests:{},offers:{}}
}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
function hex(value:unknown):Hex { if(typeof value!=='string'||!/^0x[a-fA-F0-9]{64}$/.test(value))fail('Invalid stock payment reference.',400);return value.toLowerCase() as Hex }
function amount(value:unknown) { if(typeof value!=='string'||!/^[1-9][0-9]{0,77}$/.test(value))fail('Enter a valid USDC amount.',400);return BigInt(value) }
function requestId(value:unknown) { if(typeof value!=='string'||!/^sreq_[a-f0-9-]{36}$/.test(value))fail('Invalid stock request.',400);return value }
function signature(value:unknown):Hex { if(typeof value!=='string'||!/^0x(?:[a-fA-F0-9]{2}){1,2048}$/.test(value))fail('A signed offer is required.',400);return value as Hex }
function fee(value:unknown,c:StockConfig) { if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>c.maxFeeBps)fail('The fee exceeds the allowed percentage.',400);return value }
async function verifiedStockIdentity(req:Request,env:NodeJS.ProcessEnv):Promise<StockIdentity> {
 const token=String(req.headers.authorization??'').match(/^Bearer (\S+)$/i)?.[1]
 if(!token)fail('Sign in to continue.',401)
 const appId=env.PRIVY_APP_ID??env.VITE_PRIVY_APP_ID, appSecret=env.PRIVY_APP_SECRET
 if(!appId||!appSecret)fail('Stock payment authentication is unavailable.',503)
 try {
  const privy=new PrivyClient({appId,appSecret}),claims=await privy.utils().auth().verifyAccessToken(token)
  if(!claims.user_id)throw Error()
  const user=await privy.users()._get(claims.user_id)
  const wallets=[...new Set(user.linked_accounts.flatMap(a=>a.type==='wallet'&&a.chain_type==='ethereum'&&a.wallet_client_type==='privy'&&a.connector_type==='embedded'&&isAddress(a.address)?[getAddress(a.address)]:[]))]
  const emails=user.linked_accounts.flatMap(a=>a.type==='email'?[a.address.toLowerCase().trim()]:[])
  if(wallets.length!==1||!emails.length)fail('Connect your verified HashPayStream wallet.',409)
  return {userId:claims.user_id,wallet:wallets[0],emails}
 } catch(error) { if((error as {status?:number}).status===409)throw error;fail('Your session expired. Sign in again.',401) }
}
const defaults:StockDependencies={
 env:()=>process.env,identity:verifiedStockIdentity,hasStore:hasRenderDurableStore,
 read:key=>readDurableJson<StockStore>(key),
 mutate:(key,fn)=>mutateDurableJson<StockStore>(key,fn),
 partners:()=>readDurableJson<FundingPartnerStore>(process.env.HASHPAYSTREAM_FUNDING_PARTNER_STORE_KEY?.trim()||'hashpaystream:funding-partners:v1'),
 chain:createStockChain,market:readStockMarket,
}
function publicOffer(record:StoredOffer,c:StockConfig):StockOffer {
 const o=record.offer
 return {id:record.id,funderId:record.funderId,funderName:record.funderName,asset:o.asset,chainId:c.chainId,tokenUnits:o.tokenAmount,principalUsdcUnits:o.principal,feeBps:o.feeBps,repayAt:o.payAt,expiresAt:o.expiresAt}
}
export function createStockEarlyPayHandler(overrides:Partial<StockDependencies>={}) {
 const d={...defaults,...overrides}
 return async (req:Request,res:Response)=>{
  res.setHeader('Cache-Control','no-store')
  res.setHeader('Vary','Authorization')
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,error:'Method not allowed.'})}
  try {
   const env=d.env(), actor=await d.identity(req,env), c=readStockConfig(env)
   if(!c.participantIds.includes(actor.userId))fail('This account is not eligible for the stock pilot.',403)
   if(!d.hasStore())fail('Stock payment storage is unavailable.',503)
   const chain=await d.chain(c), key=`hashpaystream:stock-early-pay:v1:${c.chainId}:${c.escrow.toLowerCase()}`
   const store=empty(await d.read(key)), profiles=await d.partners()
   const keys=actor.emails.map(email=>fundingPartnerAccountKey(c.ownershipSecret,email))
   const profile=Object.values(profiles?.applications??{}).find(p=>p.status==='approved'&&keys.includes(p.accountKey)&&p.walletAddress&&same(p.walletAddress,actor.wallet))
   const approvedProfiles=Object.values(profiles?.applications??{}).filter(p=>p.status==='approved'&&p.walletAddress)
   const body=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body as Record<string,unknown>:{}
   const action=req.method==='GET'?String(req.query.view??'worker'):String(body.action??'')
   const ownRequest=async(id:string)=>{
    const request=store.requests[id]
    if(!request||request.workerId!==actor.userId)fail('Stock request was not found.',404)
    const earnings=await chain.earnings(request.earningsId)
    if(!same(earnings.worker,actor.wallet))fail('Stock request was not found.',404)
    return {request,earnings}
   }
   const approvedFunder=async()=>{
    if(!profile)fail('An approved funding profile and its verified wallet are required.',403)
    const capacity=await chain.capacity(actor.wallet)
    if(!capacity.allowed)fail('This funder is not authorized on the stock escrow.',403)
    return {profile,capacity}
   }
   const contextFor=async(record:StoredOffer,request:StockRequest,earnings:Awaited<ReturnType<StockChain['earnings']>>,market:StockMarketSnapshot,expectedWorker=actor.wallet)=>{
    const p=approvedProfiles.find(p=>p.id===record.funderId&&same(p.walletAddress!,record.offer.funder))
    const capacity=await chain.capacity(record.offer.funder)
    const evidence=stockMarketEvidence(c,market,BigInt(record.offer.tokenAmount),chain.now)
    const context:StockEligibilityContext={now:chain.now,repayAt:earnings.payAt,requestedPrincipalUsdcUnits:request.principal,unreservedEarningsUsdcUnits:earnings.available,
     inventoryTokenUnits:capacity.inventory,funderApproved:Boolean(p)&&capacity.allowed,workerEligible:earnings.approved&&same(earnings.worker,expectedWorker),
     policy:c.policy,evidence}
    const reason=stockOfferUnavailableReason(publicOffer(record,c),context)
    if(reason)fail(reason)
    if(await chain.used(record.id))fail('This offer is no longer available.')
    return context
   }
   if(req.method==='GET'&&action==='config')return res.json({ok:true,config:publicStockConfig(c),paused:chain.paused})
   if(req.method==='GET'&&action==='worker'){
    const earnings=[]
    for(const item of Object.values(store.earnings)){
     const current=await chain.earnings(item.id)
     if(same(current.worker,actor.wallet))earnings.push({...current,title:item.title,request:Object.values(store.requests).find(r=>r.earningsId===item.id&&r.workerId===actor.userId)??null})
    }
    return res.json({ok:true,config:publicStockConfig(c),paused:chain.paused,earnings})
   }
   if(req.method==='GET'&&action==='desk'){
    const {capacity}=await approvedFunder(), requests=[]
    for(const request of Object.values(store.requests)){
     const e=await chain.earnings(request.earningsId)
     if(e.approved&&e.payAt>chain.now&&BigInt(e.available)>=BigInt(request.principal)&&!same(e.worker,actor.wallet)&&!same(e.employer,actor.wallet)){
      requests.push({id:request.id,earningsId:request.earningsId,title:store.earnings[request.earningsId]?.title??'Approved earnings',principal:request.principal,payAt:e.payAt})
     }
    }
    const offers=Object.values(store.offers).filter(o=>o.funderUserId===actor.userId&&same(o.offer.funder,actor.wallet)).map(o=>({id:o.id,requestId:o.requestId,offer:o.offer,published:Boolean(o.signature)}))
    return res.json({ok:true,config:publicStockConfig(c),paused:chain.paused,inventory:capacity.inventory,requests,offers})
   }
   if(req.method==='POST'&&action==='register_earnings'){
    const id=hex(body.earningsId), e=await chain.earnings(id)
    if(!same(e.employer,actor.wallet))fail('Only the funding employer can register these earnings.',403)
    const title=String(body.title??'Approved earnings').replace(/\s+/g,' ').trim().slice(0,120)
    if(!title)fail('An earnings title is required.',400)
    await d.mutate(key,value=>{
     const next=empty(value)
     if(next.earnings[id]&&next.earnings[id].employerId!==actor.userId)fail('These earnings are already registered.',409)
     if(!next.earnings[id]&&Object.keys(next.earnings).length>=500)fail('The pilot registration limit has been reached.')
     next.earnings[id]={id,employerId:actor.userId,title};return next
    })
    return res.status(201).json({ok:true,earnings:e})
   }
   if(req.method==='POST'&&action==='approval'){
    const id=hex(body.earningsId), e=await chain.earnings(id)
    if(store.earnings[id]?.employerId!==actor.userId||!same(e.employer,actor.wallet))fail('Employer approval is not available for this account.',403)
    chain.assertOpen()
    if(e.approved||BigInt(e.available)===0n||e.payAt<=chain.now)fail('These earnings cannot be approved.')
    return res.json({ok:true,config:publicStockConfig(c),earningsId:id})
   }
   if(req.method==='POST'&&action==='request_stock'){
    chain.assertOpen()
    const id=hex(body.earningsId), principal=amount(body.principal), e=await chain.earnings(id)
    if(!store.earnings[id]||!same(e.worker,actor.wallet))fail('Funded earnings were not found.',404)
    if(!e.approved||e.payAt<=chain.now||BigInt(e.available)<principal)fail('Choose fully funded approved earnings.')
    let result:StockRequest
    await d.mutate(key,value=>{
     const next=empty(value),existing=Object.values(next.requests).find(r=>r.earningsId===id)
     if(existing){if(existing.workerId!==actor.userId||existing.principal!==principal.toString())fail('These earnings already have a different stock request.');result=existing;return next}
     result={id:`sreq_${randomUUID()}`,earningsId:id,workerId:actor.userId,principal:principal.toString()}
     next.requests[result.id]=result;return next
    })
    return res.status(201).json({ok:true,request:result!})
   }
   if(req.method==='POST'&&action==='prepare_offer'){
    chain.assertOpen()
    const {profile,capacity}=await approvedFunder(), id=requestId(body.requestId), request=store.requests[id]
    if(!request)fail('Stock request was not found.',404)
    const e=await chain.earnings(request.earningsId), feeBps=fee(body.feeBps,c)
    if(!e.approved||e.payAt<=chain.now||same(e.worker,actor.wallet)||same(e.employer,actor.wallet))fail('This request is not eligible for your funding.')
    const market=await d.market(c)
    stockMarketEvidence(c,market,1n,chain.now)
    const tokenAmount=BigInt(request.principal)*10n**BigInt(c.assetDecimals)/BigInt(market.unitPriceUsdcUnits)
    const offer:StockOfferWire={earningsId:e.id,funder:actor.wallet,asset:c.asset,tokenAmount:tokenAmount.toString(),principal:request.principal,feeBps,payAt:e.payAt,
     expiresAt:Math.min(chain.now+c.quoteTtlSeconds,e.payAt,market.eligibleUntil),nonce:`0x${randomBytes(32).toString('hex')}`}
    const offerId=hashTypedData({domain:stockDomain(c.chainId,c.escrow),types:STOCK_OFFER_TYPES,primaryType:'StockOffer',message:stockOfferMessage(offer)})
    const record:StoredOffer={id:offerId,requestId:id,funderId:profile.id,funderUserId:actor.userId,funderName:profile.name,offer}
    const ctx:StockEligibilityContext={now:chain.now,repayAt:e.payAt,requestedPrincipalUsdcUnits:request.principal,unreservedEarningsUsdcUnits:e.available,inventoryTokenUnits:capacity.inventory,
     funderApproved:true,workerEligible:true,policy:c.policy,evidence:stockMarketEvidence(c,market,tokenAmount,chain.now)}
    const reason=stockOfferUnavailableReason(publicOffer(record,c),ctx);if(reason)fail(reason)
    await d.mutate(key,value=>{const next=empty(value);if(Object.keys(next.offers).length>=2000)fail('The pilot offer limit has been reached.');next.offers[offerId]=record;return next})
    return res.status(201).json({ok:true,config:publicStockConfig(c),offerId,offer,domain:stockDomain(c.chainId,c.escrow)})
   }
   if(req.method==='POST'&&action==='publish_offer'){
    chain.assertOpen();await approvedFunder()
    const id=hex(body.offerId), record=store.offers[id]
    if(!record||record.funderUserId!==actor.userId||!same(record.offer.funder,actor.wallet))fail('Your prepared offer was not found.',404)
    if(body.acceptedRisk!==true)fail('Confirm that you understand the funding terms.',400)
    if(record.offer.expiresAt<=chain.now||await chain.used(id))fail('This offer expired or was already used.')
    const request=store.requests[record.requestId], earnings=await chain.earnings(record.offer.earningsId)
    await contextFor(record,request,earnings,await d.market(c),earnings.worker)
    const sig=signature(body.signature)
    if(!await chain.verifyOffer(record.offer,sig))fail('Offer signature does not match the funding wallet.',403)
    await d.mutate(key,value=>{const next=empty(value);const saved=next.offers[id];if(!saved||saved.funderUserId!==actor.userId)fail('Your prepared offer was not found.',404);saved.signature=sig;return next})
    return res.json({ok:true,offerId:id})
   }
   if(req.method==='GET'&&action==='offers'){
    const {request,earnings}=await ownRequest(requestId(req.query.requestId))
    const counts:Record<string,number>={}, offers:StockOffer[]=[],contexts:Record<string,StockEligibilityContext>={}
    // Chain-confirmed AND explicitly reviewed history only; never trust a supplied count.
    for(const prior of Object.values(store.offers)){
     const r=store.requests[prior.requestId], employer=r&&store.earnings[r.earningsId]
     if(!r||!employer||!prior.delivery||!prior.repayment||!c.reviewedEarningsIds.includes(r.earningsId.toLowerCase())||
        prior.funderUserId===r.workerId||prior.funderUserId===employer.employerId||r.workerId===employer.employerId)continue
     if(await chain.canonical(prior.delivery)&&await chain.canonical(prior.repayment))counts[prior.funderId]=(counts[prior.funderId]??0)+1
    }
    const records=Object.values(store.offers).filter(o=>o.requestId===request.id&&o.signature)
    const positions=[]
    for(const record of records){
     const claim=await chain.claim(record.id)
     if(same(claim.worker,actor.wallet)&&!/^0x0{40}$/i.test(claim.funder))positions.push({id:record.id,...claim})
    }
    if(!chain.paused&&positions.length===0){
     chain.assertOpen()
     const market=await d.market(c)
     for(const record of records){try{const context=await contextFor(record,request,earnings,market);offers.push(publicOffer(record,c));contexts[record.id]=context}catch(error){if(!(error as {status?:number}).status)throw error}}
    }
    const ranked=rankFundingOffers(offers.map(o=>({...o,verifiedCompletedFundingCount:counts[o.funderId]??0})))
    return res.json({ok:true,config:publicStockConfig(c),offers:ranked,contexts,verifiedCompletedFundingCounts:counts,positions})
   }
   if(req.method==='POST'&&action==='acceptance'){
    chain.assertOpen()
    const id=hex(body.offerId),record=store.offers[id]
    if(!record?.signature)fail('Stock offer was not found.',404)
    const {request,earnings}=await ownRequest(record.requestId)
    if(body.acceptedRisk!==true)fail('Confirm that your token value can change while the deduction stays fixed.',400)
    const context=await contextFor(record,request,earnings,await d.market(c))
    if(!await chain.verifyOffer(record.offer,record.signature))fail('The funder signature is no longer valid.')
    const risk=await chain.signRisk(id,context.evidence!,record.offer.expiresAt)
    return res.json({ok:true,config:publicStockConfig(c),offerId:id,offer:record.offer,funderSignature:record.signature,...risk})
   }
   if(req.method==='POST'&&(action==='receipt'||action==='position')){
    const id=hex(body.offerId),record=store.offers[id]
    if(!record)fail('Stock payment was not found.',404)
    const request=store.requests[record.requestId],e=await chain.earnings(record.offer.earningsId)
    const worker=request?.workerId===actor.userId&&same(e.worker,actor.wallet)
    const funder=record.funderUserId===actor.userId&&same(record.offer.funder,actor.wallet)
    if(!worker&&!funder)fail('Stock payment was not found.',404)
    if(action==='position')return res.json({ok:true,config:publicStockConfig(c),position:await chain.claim(id,true)})
    const result=await chain.receipt(hex(body.txHash),id),event=result.event
    const repayment=BigInt(record.offer.principal)+stockFeeUnits(BigInt(record.offer.principal),record.offer.feeBps,c.maxFeeBps)
    if(event.eventName==='StockDelivered'){
     const a=event.args
     if(!same(a.funder,record.offer.funder)||!same(a.worker,e.worker)||a.earningsId!==record.offer.earningsId||!same(a.asset,c.asset)||
       a.tokenAmount!==BigInt(record.offer.tokenAmount)||a.principal!==BigInt(record.offer.principal)||a.principal+a.fee!==repayment||a.payAt!==e.payAt)fail('Stock delivery does not match the accepted terms.')
    }else if(event.args.amount!==repayment||!same(event.args.funder,record.offer.funder))fail('Repayment does not match the accepted terms.')
    await d.mutate(key,value=>{const next=empty(value);const item=next.offers[id];if(!item)fail('Stock payment was not found.',404);if(event.eventName==='StockDelivered')item.delivery=result.proof;else item.repayment=result.proof;return next})
    return res.json({ok:true,offerId:id,event:event.eventName,proof:result.proof,position:await chain.claim(id)})
   }
   fail('Unsupported stock payment action.',400)
  }catch(error){
   const status=(error as {status?:number}).status
   return res.status(status&&status>=400&&status<600?status:503).json({ok:false,error:status?String((error as Error).message):'Stock payment verification is temporarily unavailable.'})
  }
 }
}
export default createStockEarlyPayHandler()
