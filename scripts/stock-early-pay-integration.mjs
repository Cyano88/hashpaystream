import { performStockEarnings, recoverStockEarnings, stockEarningsPendingKey } from '../src/lib/stockEarningsClient.ts'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {createServer} from 'node:http'
import {randomBytes} from 'node:crypto'
import express from 'express'
import {createPublicClient,createWalletClient,http,defineChain,keccak256,encodeAbiParameters,hashTypedData} from 'viem'
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts'
import {createStockEarlyPayHandler} from '../api/stock-early-pay.ts'
import {readStockConfig,publicStockConfig} from '../api/stock-early-pay-config.ts'
import {fundingPartnerAccountKey} from '../api/funding-partners.ts'
import {STOCK_ESCROW_ABI,STOCK_OFFER_TYPES,stockDomain,stockOfferMessage} from '../src/lib/stockEarlyPayProtocol.ts'
import {validateStockAcceptance,recoverStockPayment,settleStockPayment} from '../src/lib/stockEarlyPayClient.ts'

// Synthetic accounts, synthetic tokens, loopback RPC only. Never load deployment credentials.
const port=18547, rpcUrl='http://127.0.0.1:'+port
const chain=defineChain({id:31337,name:'Isolated test',nativeCurrency:{name:'Test',symbol:'TEST',decimals:18},rpcUrls:{default:{http:[rpcUrl]}}})
const client=createPublicClient({chain,transport:http(rpcUrl),pollingInterval:20})
const ids=['employer','worker','funder','outsider'], accounts=Object.fromEntries(ids.map(id=>[id,privateKeyToAccount(generatePrivateKey())]))
const admin=privateKeyToAccount(generatePrivateKey()),riskKey=generatePrivateKey(), risk=privateKeyToAccount(riskKey)
const child=spawn(process.execPath,['node_modules/hardhat/internal/cli/cli.js','node','--hostname','127.0.0.1','--port',String(port)],{cwd:new URL('../contracts/',import.meta.url),env:{...process.env,XLAYER_DEPLOYER_PRIVATE_KEY:'',XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY:'',ARC_DEPLOYER_PRIVATE_KEY:'',DOTENV_CONFIG_PATH:'__no_test_env__'},stdio:'ignore',windowsHide:true})
let marketServer,apiServer
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const wallet=account=>createWalletClient({account,chain,transport:http(rpcUrl)})
const send=async(account,address,abi,functionName,args=[])=>{
 const hash=await wallet(account).writeContract({address,abi,functionName,args})
 const receipt=await client.waitForTransactionReceipt({hash})
 assert.equal(receipt.status,'success');return hash
}
const artifact=name=>JSON.parse(readFileSync(new URL('../contracts/artifacts/src/'+(name==='StockEarlyPayEscrow'?'StockEarlyPayEscrow.sol/':'test/MockUSDC.sol/')+name+'.json',import.meta.url),'utf8'))
const tokenArtifact=artifact('MockUSDC'),escrowArtifact=artifact('StockEarlyPayEscrow')
const mine=()=>client.request({method:'evm_mine',params:[]})
try{
 let ready=false
 for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('Local test node could not start.');try{ready=await client.getChainId()===31337;if(ready)break}catch{}await wait(100)}
 assert.ok(ready,'local node ready')
 for(const a of [admin,...Object.values(accounts)])await client.request({method:'hardhat_setBalance',params:[a.address,'0x3635c9adc5dea00000']})
 const deploy=async(a,args=[])=>{const hash=await wallet(admin).deployContract({abi:a.abi,bytecode:a.bytecode,args});return (await client.waitForTransactionReceipt({hash})).contractAddress}
 const usdc=await deploy(tokenArtifact),asset=await deploy(tokenArtifact),escrow=await deploy(escrowArtifact,[usdc,admin.address,risk.address,300,120])
 // Administrative ABI is deliberately not exposed to the browser.
 await send(admin,escrow,escrowArtifact.abi,'setAssetAllowed',[asset,true])
 await send(admin,escrow,escrowArtifact.abi,'setFunderAllowed',[accounts.funder.address,true])
 await send(admin,escrow,escrowArtifact.abi,'setPaused',[false])
 await send(admin,asset,tokenArtifact.abi,'mint',[accounts.funder.address,1000000000n])
 await send(accounts.funder,asset,tokenArtifact.abi,'approve',[escrow,1000000000n])
 await send(accounts.funder,escrow,STOCK_ESCROW_ABI,'depositStock',[asset,1000000000n])
 await send(admin,usdc,tokenArtifact.abi,'mint',[accounts.employer.address,500000000n])
 await send(accounts.employer,usdc,tokenArtifact.abi,'approve',[escrow,500000000n])
 const salt='0x'+randomBytes(32).toString('hex'),payAt=Number((await client.getBlock()).timestamp)+86400
 const earningsId=keccak256(encodeAbiParameters([{type:'address'},{type:'bytes32'}],[accounts.employer.address,salt]))
 await send(accounts.employer,escrow,STOCK_ESCROW_ABI,'fundEarnings',[salt,accounts.worker.address,500000000n,payAt])
 let marketPatch={}
 marketServer=createServer(async(req,res)=>{
  const now=Number((await client.getBlock()).timestamp)
  res.setHeader('content-type','application/json')
  res.end(JSON.stringify({chainId:31337,asset,observedAt:now,eligibleUntil:now+90,unitPriceUsdcUnits:'50000000',volatilityBps:100,executableLiquidityUsdcUnits:'10000000000',tradingAvailable:true,transfersAvailable:true,issuerEligible:true,...marketPatch}))
 })
 await new Promise(r=>marketServer.listen(0,'127.0.0.1',r))
 const raw={chainId:31337,escrow,asset,usdc,rpcUrl,riskUrl:'http://127.0.0.1:'+marketServer.address().port,runtimeHash:keccak256(await client.getCode({address:escrow})),assetSymbol:'TESTx',assetDecimals:6,maxFeeBps:300,maxRiskAge:120,quoteTtlSeconds:60,confirmations:2,participantIds:ids,policy:{maxVolatilityBps:500,maxPriceAgeSeconds:60,maxQuoteDeviationBps:10,minExecutableLiquidityUsdcUnits:'1000000000'},reviewedEarningsIds:[]}
 const env={NODE_ENV:'test',HASHPAYSTREAM_STOCK_EARLY_PAY_ENABLED:'true',HASHPAYSTREAM_STOCK_CONFIG:JSON.stringify(raw),HASHPAYSTREAM_STOCK_RISK_SIGNER_KEY:riskKey,HASHPAYSTREAM_APP_OWNERSHIP_SECRET:'synthetic-local-test-ownership-secret-only'}
 const config=readStockConfig(env)
 assert.equal('riskKey' in publicStockConfig(config),false)
 assert.throws(()=>readStockConfig({...env,HASHPAYSTREAM_STOCK_EARLY_PAY_ENABLED:'false'}))
 assert.throws(()=>readStockConfig({...env,HASHPAYSTREAM_STOCK_CONFIG:JSON.stringify({...raw,chainId:196})}))
 let state
 const handler=createStockEarlyPayHandler({
  env:()=>env,hasStore:()=>true,read:async()=>state,mutate:async(_key,fn)=>(state=fn(state)),
  identity:async req=>{const id=req.headers.authorization?.replace('Bearer ','');if(!accounts[id])throw Object.assign(Error('Sign in.'),{status:401});return {userId:id,wallet:accounts[id].address,emails:[id+'@example.test']}},
  partners:async()=>({applications:{funder:{id:'profile-funder',name:'Test Funder',status:'approved',walletAddress:accounts.funder.address,accountKey:fundingPartnerAccountKey(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET,'funder@example.test')}}})
 })
 const app=express();app.use(express.json());app.all('/stock',handler);apiServer=app.listen(0,'127.0.0.1');await new Promise(r=>apiServer.once('listening',r))
 const api=async(id,body,query={},status=200)=>{
  const response=await fetch('http://127.0.0.1:'+apiServer.address().port+'/stock?'+new URLSearchParams(query),{method:body?'POST':'GET',headers:{authorization:'Bearer '+id,'content-type':'application/json'},body:body?JSON.stringify(body):undefined})
  const result=await response.json()
  assert.equal(response.headers.get('cache-control'),'no-store')
  assert.equal(response.status,status,JSON.stringify(result));return result
 }
 await api('unknown',undefined,{},401)
 state={schema:2};await api('worker',undefined,{view:'worker'},503);state=undefined
 await api('outsider',{action:'register_earnings',earningsId}, {},403)
 await api('employer',{action:'register_earnings',earningsId,title:'Synthetic earned pay'}, {},201)
 await api('worker',{action:'request_stock',earningsId,principal:'100000000'}, {},409)

 await mine()
 await api('worker',{action:'earnings_action',operation:'approveEarnings',earningsId,acceptedIrrevocable:true},{},404)
 await api('employer',{action:'earnings_action',operation:'approveEarnings',earningsId},{},400)
 const approval=await api('employer',{action:'earnings_action',operation:'approveEarnings',earningsId,acceptedIrrevocable:true})
 assert.ok(approval.data.startsWith('0x'))

 await send(accounts.employer,escrow,STOCK_ESCROW_ABI,'approveEarnings',[earningsId])

 // Exercise the actual browser client against a synthetic unlocked local account.
 await client.request({method:'hardhat_impersonateAccount',params:[accounts.employer.address]})
 const browserWallet={address:accounts.employer.address,switchChain:async id=>assert.equal(id,31337),getEthereumProvider:async()=>({
  request:async({method,params})=>{const result=await client.request({method,params});if(method==='eth_sendTransaction')await mine();return result}
 })}
 const records=new Map(),storage={getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)}
 const employerApi=body=>api('employer',body)
 const key=stockEarningsPendingKey('employer',config,accounts.employer.address)
 const draftInput={action:'prepare_funding',salt:'0x'+randomBytes(32).toString('hex'),worker:accounts.worker.address,amount:'50000000',payAt,title:'Second synthetic earnings'}
 const {draft}=await api('employer',draftInput,{},201)
 assert.equal((await api('employer',draftInput,{},201)).draft.id,draft.id,'duplicate preparation resumes one draft')
 await api('employer',{...draftInput,amount:'49000000'},{},409)
 assert.equal((await api('outsider',undefined,{view:'employer'})).drafts.length,0)
 await api('outsider',{action:'earnings_action',operation:'fundEarnings',earningsId:draft.id},{},404)
 await send(admin,usdc,tokenArtifact.abi,'mint',[accounts.employer.address,50000000n])
 const operation={api:employerApi,wallet:browserWallet,config,expectedEscrow:escrow,operation:'fundEarnings',earningsId:draft.id,draft,storage,storageKey:key}
 await performStockEarnings(operation)
 assert.equal(records.size,0)
 const employerView=await api('employer',undefined,{view:'employer'})
 const funded=employerView.earnings.find(e=>e.id===draft.id)
 assert.equal(funded.available,'50000000');assert.equal(funded.approved,false)
 await api('employer',{action:'earnings_action',operation:'approveEarnings',earningsId:draft.id},{},400)
 await api('worker',{action:'earnings_action',operation:'approveEarnings',earningsId:draft.id,acceptedIrrevocable:true},{},404)
 await assert.rejects(()=>performStockEarnings({...operation,operation:'approveEarnings',earnings:funded,acceptedIrrevocable:false}))
 // Unknown hash recovery relies on confirmed state, and never sends again.
 records.set(key,JSON.stringify({operation:'fundEarnings',earningsId:draft.id}))
 await recoverStockEarnings(employerApi,storage,key);assert.equal(records.size,0)
 await performStockEarnings({...operation,operation:'cancelUnapprovedEarnings',earnings:funded})
 assert.equal((await api('employer',undefined,{view:'employer'})).earnings.find(e=>e.id===draft.id).available,'0')
 assert.equal(await client.readContract({address:usdc,abi:tokenArtifact.abi,functionName:'balanceOf',args:[accounts.employer.address]}),50000000n)

 const {request}=await api('worker',{action:'request_stock',earningsId,principal:'100000000'}, {},201)
 await api('outsider',undefined,{view:'offers',requestId:request.id},404)
 await api('funder',{action:'prepare_offer',requestId:request.id,feeBps:301},{},400)
 marketPatch={volatilityBps:501}
 await api('funder',{action:'prepare_offer',requestId:request.id,feeBps:100},{},409)
 marketPatch={}
 const prepared=await api('funder',{action:'prepare_offer',requestId:request.id,feeBps:100},{},201)
 assert.equal(prepared.offer.tokenAmount,'2000000')
 const signature=await accounts.funder.signTypedData({domain:stockDomain(31337,escrow),types:STOCK_OFFER_TYPES,primaryType:'StockOffer',message:stockOfferMessage(prepared.offer)})
 marketPatch={tradingAvailable:false}
 await api('funder',{action:'publish_offer',offerId:prepared.offerId,signature,acceptedRisk:true},{},409)
 marketPatch={}
 await api('funder',{action:'publish_offer',offerId:prepared.offerId,signature,acceptedRisk:true})
 const listed=await api('worker',undefined,{view:'offers',requestId:request.id})
 assert.equal(listed.offers.length,1)
 await api('outsider',{action:'acceptance',offerId:prepared.offerId,acceptedRisk:true},{},404)
 const accepted=await api('worker',{action:'acceptance',offerId:prepared.offerId,acceptedRisk:true})
 validateStockAcceptance(accepted,listed.offers[0],accepted.config)
 assert.throws(()=>validateStockAcceptance({...accepted,offer:{...accepted.offer,principal:'99000000'}},listed.offers[0],accepted.config))
 const snapshot=await client.request({method:'evm_snapshot',params:[]})
 const tx=await send(accounts.worker,escrow,STOCK_ESCROW_ABI,'acceptOffer',[stockOfferMessage(accepted.offer),accepted.funderSignature,{...accepted.risk,policyVersion:BigInt(accepted.risk.policyVersion)},accepted.riskSignature])
 await api('worker',{action:'receipt',offerId:prepared.offerId,txHash:tx},{},409)
 const before=await api('worker',{action:'position',offerId:prepared.offerId});assert.match(before.position.funder,/^0x0{40}$/)
 const unconfirmed=new Map([['pending',JSON.stringify({offerId:prepared.offerId,stage:'submitting'})]])
 await assert.rejects(()=>recoverStockPayment(body=>api('worker',body),{getItem:k=>unconfirmed.get(k),removeItem:k=>unconfirmed.delete(k)},'pending'))
 assert.equal(unconfirmed.has('pending'),true)
 await mine()
 const delivery=await api('worker',{action:'receipt',offerId:prepared.offerId,txHash:tx})
 assert.equal(delivery.position.repayment,'101000000')
 assert.equal(await client.readContract({address:asset,abi:tokenArtifact.abi,functionName:'balanceOf',args:[accounts.worker.address]}),2000000n)
 await api('worker',{action:'acceptance',offerId:prepared.offerId,acceptedRisk:true},{},409)
 await api('outsider',{action:'receipt',offerId:prepared.offerId,txHash:tx},{},404)

 // A confirmed revert may clear recovery; an unrelated transaction must not.
 await client.request({method:'evm_setAutomine',params:[false]})
 let revertedHash
 try{
  revertedHash=await wallet(accounts.worker).writeContract({address:escrow,abi:STOCK_ESCROW_ABI,functionName:'acceptOffer',args:[stockOfferMessage(accepted.offer),accepted.funderSignature,{...accepted.risk,policyVersion:BigInt(accepted.risk.policyVersion)},accepted.riskSignature],gas:1000000n})
  await mine();await mine()
 }finally{await client.request({method:'evm_setAutomine',params:[true]})}
 assert.equal((await api('worker',{action:'submission_status',offerId:prepared.offerId,txHash:revertedHash})).status,'reverted')
 const failed=new Map([['pending',JSON.stringify({offerId:prepared.offerId,txHash:revertedHash,stage:'submitted'})]])
 await assert.rejects(()=>recoverStockPayment(body=>api('worker',body),{getItem:k=>failed.get(k),removeItem:k=>failed.delete(k)},'pending'),/reverted/)
 assert.equal(failed.size,0)
 await api('funder',{action:'submission_status',offerId:prepared.offerId,txHash:revertedHash},{},403)

 const memory=new Map([['pending',JSON.stringify({offerId:prepared.offerId,stage:'submitting'})]])
 await recoverStockPayment(body=>api('worker',body),{getItem:k=>memory.get(k),removeItem:k=>memory.delete(k)},'pending')
 assert.equal(memory.has('pending'),false)
 await client.request({method:'evm_setNextBlockTimestamp',params:[payAt]});await mine()

 const due=(await api('employer',undefined,{view:'employer'})).earnings.find(e=>e.id===earningsId)
 await performStockEarnings({api:employerApi,wallet:browserWallet,config,expectedEscrow:escrow,operation:'releaseEarnings',earningsId,earnings:due,storage,storageKey:key})
 assert.equal(await client.readContract({address:usdc,abi:tokenArtifact.abi,functionName:'balanceOf',args:[accounts.worker.address]}),399000000n)

 const repaid=await send(accounts.funder,escrow,STOCK_ESCROW_ABI,'settle',[prepared.offerId]);await mine()
 await api('funder',{action:'receipt',offerId:prepared.offerId,txHash:repaid})
 await api('funder',{action:'receipt',offerId:prepared.offerId,txHash:repaid})

 const settlementStorage=new Map([['settlement',JSON.stringify({offerId:prepared.offerId,txHash:repaid})]])
 await settleStockPayment({api:body=>api('funder',body),wallet:{address:accounts.funder.address,switchChain:async()=>{throw Error('Recovery must not switch or broadcast')}},
  config,expectedEscrow:escrow,offerId:prepared.offerId,storage:{getItem:k=>settlementStorage.get(k),setItem:(k,v)=>settlementStorage.set(k,v),removeItem:k=>settlementStorage.delete(k)},storageKey:'settlement'})
 assert.equal(settlementStorage.size,0)

 const unreviewed=await api('worker',undefined,{view:'offers',requestId:request.id});assert.deepEqual(unreviewed.verifiedCompletedFundingCounts,{})
 raw.reviewedEarningsIds=[earningsId];env.HASHPAYSTREAM_STOCK_CONFIG=JSON.stringify(raw)
 const reviewed=await api('worker',undefined,{view:'offers',requestId:request.id});assert.equal(reviewed.verifiedCompletedFundingCounts['profile-funder'],1)
 assert.equal(await client.readContract({address:usdc,abi:tokenArtifact.abi,functionName:'balanceOf',args:[accounts.funder.address]}),101000000n)
 await client.request({method:'evm_revert',params:[snapshot]})
 const reorganized=await api('worker',undefined,{view:'offers',requestId:request.id});assert.deepEqual(reorganized.verifiedCompletedFundingCounts,{})
 env.HASHPAYSTREAM_STOCK_CONFIG=JSON.stringify({...raw,runtimeHash:'0x'+'00'.repeat(32)})
 await api('worker',undefined,{view:'worker'},503)
 console.log('Stock API + local-chain integration passed: ownership, risk gates, signed delivery, fixed repayment, confirmations, recovery, reviewed counts, and deployment pinning.')
}finally{
 apiServer?.closeAllConnections();apiServer?.close();marketServer?.closeAllConnections();marketServer?.close();child.kill()
}
