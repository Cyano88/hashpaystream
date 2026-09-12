import {readStockPythReference} from './stock-pyth-market-data.js'
import { createPublicClient,http,parseAbi,keccak256,getAddress,encodePacked,type Hex } from 'viem'
import pins from '../docs/evidence/stock-dex-exit.json'
import type { StockConfig } from './stock-early-pay-config.js'
import { stockFailure as fail } from './stock-early-pay-config.js'
import type { StockMarketSnapshot } from './stock-early-pay-chain.js'
import { assertStockParticipantClearance,type StockParticipantScope } from './stock-participant-clearance.js'
import { stockJson,stockFresh,stockBps,stockTimestamp,readStockReference,type StockReference } from './stock-market-data.js'

const abi=parseAbi(['function decimals() view returns(uint8)','function asset() view returns(address)','function convertToAssets(uint256) view returns(uint256)','function getPool(address,address,uint24) view returns(address)','function token0() view returns(address)','function token1() view returns(address)','function factory() view returns(address)','function fee() view returns(uint24)','function liquidity() view returns(uint128)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)','function observe(uint32[]) view returns(int56[],uint160[])','function quoteExactInput(bytes,uint256) returns(uint256,uint160[],uint32[],uint256)'])
const addr=(s:string)=>getAddress(s),unit=10n**18n
export type StockDexProof={tokenAmount:string;amountOutUsdcUnits:string;depthTokenAmount:string;depthOutUsdcUnits:string;blockNumber:string;blockHash:Hex;observedAt:number;expiresAt:number}
export async function readStockDexQuote(c:StockConfig,scope:StockParticipantScope,reference:StockReference,now:number):Promise<{unitPriceUsdcUnits:string;proof:StockDexProof}>{
 if(![196,31337].includes(c.chainId)||c.asset!==addr(pins.candidate.wrapper.address)||c.usdc!==addr(pins.candidate.payment.address)||c.assetDecimals!==18)fail('DEX asset configuration does not match the reviewed route.',503)
 const client=createPublicClient({transport:http(c.rpcUrl,{timeout:c.chainId===31337?180000:7000,retryCount:0})})
 const block=await client.getBlock();if(await client.getChainId()!==c.chainId)fail('DEX network mismatch.',503)
 if(c.chainId===196)now=Math.max(now,Math.floor(Date.now()/1000))
 stockFresh(Number(block.timestamp),now,c.policy.maxPriceAgeSeconds)
 const read=(address:string,functionName:string,args:readonly unknown[]=[])=>client.readContract({address:addr(address),abi,functionName,args,blockNumber:block.number} as any) as Promise<any>
 const checkCode=async(address:string,hash:string)=>{const code=await client.getCode({address:addr(address),blockNumber:block.number});if(!code||keccak256(code)!==hash)fail('DEX or asset implementation changed.',503)}
 await Promise.all([...(Object.keys(pins.contracts.runtimeHashes) as (keyof typeof pins.contracts.runtimeHashes)[]).map(k=>checkCode(pins.contracts[k],pins.contracts.runtimeHashes[k])),...[pins.candidate.wrapper,pins.candidate.underlying,pins.candidate.payment].map(async t=>{
  await checkCode(t.address,t.runtimeHash);if(await read(t.address,'decimals')!==t.decimals)fail('Token decimals changed.',503)
  if(t.implementation){const slot=await client.getStorageAt({address:addr(t.address),slot:'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',blockNumber:block.number});if(!slot||addr('0x'+slot.slice(-40))!==addr(t.implementation))fail('Token proxy changed.',503);await checkCode(t.implementation,t.implementationRuntimeHash!)}
 })])
 if(await read(pins.contracts.usdg,'decimals')!==6||addr(await read(c.asset,'asset'))!==addr(pins.candidate.underlying.address))fail('Wrapper or intermediate asset changed.',503)
 const conversion:bigint=await read(c.asset,'convertToAssets',[unit]);if(conversion<=0n)fail('Wrapper conversion unavailable.',503)
 const price=conversion*reference.spyUsdE8*1000000n/(unit*reference.usdcUsdE8)
 if(price<=0n)fail('Wrapped reference price is invalid.',503)
 await Promise.all(pins.route.pools.map(async p=>{
  await checkCode(p.address,p.runtimeHash)
  const [factory,token0,token1,fee,liquidity,slot]=await Promise.all([read(p.address,'factory'),read(p.address,'token0'),read(p.address,'token1'),read(p.address,'fee'),read(p.address,'liquidity'),read(p.address,'slot0')])
  if(addr(factory)!==addr(pins.contracts.factory)||addr(token0)!==addr(p.token0)||addr(token1)!==addr(p.token1)||fee!==p.fee||liquidity<=0n||slot[0]<=0n||slot[6]!==true||addr(await read(factory,'getPool',[token0,token1,fee]))!==addr(p.address))fail('DEX pool is unavailable.',503)
  await read(p.address,'observe',[[1800,300,0]])
 }))
 const path=encodePacked(['address','uint24','address','uint24','address'],[c.asset,500,addr(pins.contracts.usdg),100,c.usdc])
 if(path!==pins.route.path)fail('DEX path mismatch.',503)
 const principal=BigInt(scope.principalUsdcUnits),amount=scope.tokenAmount?BigInt(scope.tokenAmount):principal*unit/price
 if(amount<=0n)fail('Token amount is invalid.',409)
 const depthTarget=BigInt(c.policy.minExecutableLiquidityUsdcUnits),depthAmount=(depthTarget*10100n*unit+price*10000n-1n)/(price*10000n)
 const quote=async(n:bigint)=>{const {result}=await client.simulateContract({address:addr(pins.contracts.quoter),abi,functionName:'quoteExactInput',args:[path,n],blockNumber:block.number});return result[0]}
 const [out,depth]=await Promise.all([quote(amount),quote(depthAmount)])
 for(const [input,output] of [[amount,out],[depthAmount,depth]]){
  const fair=input*price/unit;if(output<=0n||fair<=0n||stockBps(output-fair,fair)>c.policy.maxQuoteDeviationBps)fail('DEX exit differs too far from the independent price.',409)
 }
 if(depth<depthTarget)fail('Executable exit depth is insufficient.',409)
 if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)fail('DEX quote block changed.',503)
 return {unitPriceUsdcUnits:price.toString(),proof:{tokenAmount:amount.toString(),amountOutUsdcUnits:out.toString(),depthTokenAmount:depthAmount.toString(),depthOutUsdcUnits:depth.toString(),blockNumber:block.number.toString(),blockHash:block.hash,observedAt:Number(block.timestamp),expiresAt:Number(block.timestamp)+c.policy.maxPriceAgeSeconds}}
}
export async function buildStockDexMarket(c:StockConfig,scope:StockParticipantScope,review:any,reference:StockReference,now:number):Promise<StockMarketSnapshot>{
 if(scope.chainId!==c.chainId||scope.asset.toLowerCase()!==c.asset.toLowerCase())fail('Market request scope mismatch.',503)
 if(!/^[1-9]\d{0,77}$/.test(scope.principalUsdcUnits)||BigInt(scope.principalUsdcUnits)>100000000n||scope.tokenAmount!==undefined&&!/^[1-9]\d{0,77}$/.test(scope.tokenAmount))fail('Stock pilot amount is outside the limit.',409)
 const clearance=assertStockParticipantClearance(review.participantClearance,scope,now,c.maxRiskAge)
 const a=review.assetReview
 if(!a||a.chainId!==scope.chainId||typeof a.asset!=='string'||a.asset.toLowerCase()!==scope.asset.toLowerCase()||a.policyVersion!==scope.policyVersion||a.corporateActionsClear!==true||a.transfersAvailable!==true||typeof a.reviewReference!=='string'||!a.reviewReference.trim()||a.reviewReference.length>180)fail('Stock asset review is missing.',503)
 stockFresh(a.checkedAt,now,c.maxRiskAge)
 if(!Number.isSafeInteger(a.expiresAt)||a.expiresAt<=now||a.expiresAt-a.checkedAt>c.maxRiskAge)fail('Stock asset review expired.',503)
 stockFresh(reference.observedAt,now,c.policy.maxPriceAgeSeconds)
 if(reference.source!==((c.marketDataProvider??'pyth-pro')==='pyth-pro'?'pyth-pro':'alpaca-sip+kraken')||reference.expiresAt<=now||now<reference.sessionOpen||now>=reference.sessionClose||reference.fiveMinuteMoveBps>50||reference.volatilityBps>c.policy.maxVolatilityBps)fail('Stock price or regular-session risk limit failed.',409)
 const {unitPriceUsdcUnits,proof}=await readStockDexQuote(c,scope,reference,now)
 const observedAt=Math.min(reference.observedAt,proof.observedAt,clearance.checkedAt,a.checkedAt)
 const eligibleUntil=Math.min(reference.expiresAt,proof.expiresAt,clearance.expiresAt,a.expiresAt,now+c.quoteTtlSeconds,observedAt+c.maxRiskAge,reference.sessionClose)
 if(eligibleUntil<=now)fail('Stock evidence expired during verification.',503)
 return {participantClearance:clearance,chainId:c.chainId,asset:c.asset,observedAt,eligibleUntil,unitPriceUsdcUnits,volatilityBps:reference.volatilityBps,executableLiquidityUsdcUnits:proof.depthOutUsdcUnits,tradingAvailable:true,transfersAvailable:true,issuerEligible:true,dex:proof}
}
export async function readProductionStockMarket(c:StockConfig,scope:StockParticipantScope,review:any):Promise<StockMarketSnapshot>{
 const provider=c.marketDataProvider??'pyth-pro'
 if(provider==='alpaca-sip'&&!c.marketCredentials)fail('Independent market data is not configured.',503)
 const [reference,issuer]=await Promise.all([provider==='pyth-pro'?readStockPythReference(c.pythKey??'',()=>Math.floor(Date.now()/1000),c.policy.maxPriceAgeSeconds):readStockReference(c.marketCredentials!,()=>Math.floor(Date.now()/1000),c.policy.maxPriceAgeSeconds),stockJson('https://api.backed.fi/api/v2/public/assets/SPYx')])
 if(issuer.isTradingHalted!==false||issuer.trading?.isTradingHalted!==false||issuer.trading?.openNow!==true)fail('Issuer market availability is closed or unknown.',409)
 const nextChange=stockTimestamp(issuer.trading.nextChangeAt)
 reference.expiresAt=Math.min(reference.expiresAt,nextChange)
 const market=await buildStockDexMarket(c,scope,review,reference,Math.floor(Date.now()/1000))
 if(market.eligibleUntil<=Math.floor(Date.now()/1000))fail('Stock evidence expired during verification.',503)
 return market
}
