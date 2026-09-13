import {readFileSync,writeFileSync} from 'node:fs'
import {createPublicClient,http,parseAbi,encodePacked,getAddress,keccak256} from 'viem'
const previous=JSON.parse(readFileSync('docs/evidence/stock-xlayer-candidate.json','utf8'))
const rpc='https://rpc.xlayer.tech'
const factory=getAddress('0x4B2ab38DBF28D31D467aA8993f6c2585981D6804')
const quoter=getAddress('0xd1b797d92d87b688193a2b976efc8d577d204343')
const router=getAddress('0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca')
const stock=previous.candidate.wrapper.address,usdc=previous.candidate.payment.address
const usdg=getAddress('0x4ae46a509f6b1d9056937ba4500cb143933d2dc8')
const c=createPublicClient({transport:http(rpc,{timeout:30000,retryCount:1})})
if(await c.getChainId()!==196)throw Error('Wrong network')
const block=await c.getBlock()
const abi=parseAbi([
 'function getPool(address,address,uint24) view returns(address)',
 'function token0() view returns(address)','function token1() view returns(address)',
 'function factory() view returns(address)','function fee() view returns(uint24)',
 'function liquidity() view returns(uint128)',
 'function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)',
 'function observe(uint32[]) view returns(int56[],uint160[])',
 'function symbol() view returns(string)','function decimals() view returns(uint8)',
 'function quoteExactInput(bytes,uint256) returns(uint256,uint160[],uint32[],uint256)'
])
const read=(address,functionName,args=[])=>c.readContract({address,abi,functionName,args,blockNumber:block.number})
const codeHash=async address=>{
 const code=await c.getCode({address,blockNumber:block.number})
 if(!code||code==='0x')throw Error('Contract code missing')
 return keccak256(code)
}
for(const token of [previous.candidate.wrapper,previous.candidate.underlying,previous.candidate.payment]){
 if(await codeHash(token.address)!==token.runtimeHash)throw Error('Candidate token code changed')
 if(token.implementation){
  const slot=await c.getStorageAt({address:token.address,slot:'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',blockNumber:block.number})
  if(!slot||getAddress('0x'+slot.slice(-40))!==token.implementation||await codeHash(token.implementation)!==token.implementationRuntimeHash)throw Error('Candidate implementation changed')
 }
}
if(await read(usdg,'decimals')!==6||await read(usdg,'symbol')!=='USDG')throw Error('Intermediate token mismatch')
const meanTick=(a,b,seconds)=>{
 const delta=b-a,divisor=BigInt(seconds)
 return Number(delta/divisor-(delta<0n&&delta%divisor!==0n?1n:0n))
}
const pool=async(a,b,fee)=>{
 const address=await read(factory,'getPool',[a,b,fee])
 if(/^0x0{40}$/i.test(address))return {address,exists:false}
 const [token0,token1,actualFactory,actualFee,liquidity,slot,runtimeHash]=await Promise.all([
  read(address,'token0'),read(address,'token1'),read(address,'factory'),read(address,'fee'),read(address,'liquidity'),read(address,'slot0'),codeHash(address)])
 if(getAddress(actualFactory)!==factory||actualFee!==fee||![token0.toLowerCase(),token1.toLowerCase()].includes(a.toLowerCase())||
   ![token0.toLowerCase(),token1.toLowerCase()].includes(b.toLowerCase()))throw Error('Pool identity mismatch')
 const active=slot[0]>0n&&liquidity>0n&&slot[6]===true
 let history=null
 if(active){
  const [ticks]=await read(address,'observe',[[1800,300,0]])
  history={meanTick30m:meanTick(ticks[0],ticks[2],1800),meanTick5m:meanTick(ticks[1],ticks[2],300),tickCumulatives:ticks.map(String)}
 }
 return {address,exists:true,active,token0,token1,fee,liquidity:liquidity.toString(),sqrtPriceX96:slot[0].toString(),tick:slot[1],observationCardinality:slot[3],runtimeHash,history}
}
const [direct,first,second]=await Promise.all([pool(stock,usdc,500),pool(stock,usdg,500),pool(usdg,usdc,100)])
if(!first.active||!second.active)throw Error('No active reviewed two-hop route')
const path=encodePacked(['address','uint24','address','uint24','address'],[stock,500,usdg,100,usdc])
const spotOutput=(p,input,amount)=>{
 const ratio=BigInt(p.sqrtPriceX96)**2n,Q=2n**192n
 return input.toLowerCase()===p.token0.toLowerCase()?amount*ratio/Q:amount*Q/ratio
}
const quotes=[]
for(const amount of [10n**16n,10n**17n,130n*10n**15n,10n**18n,2n*10n**18n,10n*10n**18n,100n*10n**18n]){
 const {result}=await c.simulateContract({address:quoter,abi,functionName:'quoteExactInput',args:[path,amount],blockNumber:block.number})
 if(result[0]<=0n)throw Error('Non-executable output')
 const spot=spotOutput(second,usdg,spotOutput(first,stock,amount))
 quotes.push({amountIn:amount.toString(),amountOutUsdcUnits:result[0].toString(),
  spotOutputUsdcUnits:spot.toString(),feeAndImpactBps:spot>result[0]?Number((spot-result[0])*10000n/spot):0,
  gasEstimate:result[3].toString()})
}
const scanned=[]
for(const target of [usdc,usdg])for(const tier of [100,500,3000,10000]){
 try{scanned.push({quoteToken:target,requestedFee:tier,...await pool(stock,target,tier)})}catch{scanned.push({quoteToken:target,fee:tier,status:'UNVERIFIED'})}
}
const twapPrice=(p,tick)=>p.token0.toLowerCase()===stock.toLowerCase()?Math.pow(1.0001,tick)*1e12:1e12/Math.pow(1.0001,tick)
const historyDiagnostics={spotUsdgUnitsPerStock:spotOutput(first,stock,10n**18n).toString(),twap5mUsdgPerStock:twapPrice(first,first.history.meanTick5m),twap30mUsdgPerStock:twapPrice(first,first.history.meanTick30m),note:'Floating point diagnostics only. Same-pool TWAP is not independent and does not measure manipulation cost.'}
const hashes=await Promise.all([codeHash(factory),codeHash(quoter),codeHash(router),codeHash(usdg)])
if((await c.getBlock({blockNumber:block.number})).hash!==block.hash)throw Error('Audit block changed')
const report={schema:1,chainId:196,fetchedAt:new Date().toISOString(),blockNumber:Number(block.number),blockHash:block.hash,blockTimestamp:Number(block.timestamp),
 source:'https://developers.uniswap.org/docs/protocols/v3/deployments/v3-xlayer-deployments',
 contracts:{factory,quoter,router,usdg,runtimeHashes:{factory:hashes[0],quoter:hashes[1],router:hashes[2],usdg:hashes[3]}},
 candidate:previous.candidate,route:{tokenIn:stock,tokenOut:usdc,intermediate:usdg,path,pools:[first,second]},directPool:direct,quotes,
 testAmountIn:'130000000000000000',testSlippageBps:50,
 productionApproved:false,independentFairPriceVerified:false,
 limitations:['Quotes are eth_call simulations at one block, not reservations or live transactions',
 'Spot and TWAP use the same liquidity and are not independent stock-price oracles',
 'Two-hop exit introduces USDG, two pool fees, gas, price impact and MEV exposure',
 'No issuer account is used or required for these direct contract reads',
 'Token eligibility, corporate actions, independent price policy and security review remain separate release checks']}
Object.assign(report,{scannedStablePools:scanned,historyDiagnostics,weekendPolicyApproved:false,manipulationResistanceVerified:false,scanScope:'One verified Uniswap V3 factory, USDC/USDG, four fee tiers. Not an exhaustive X Layer venue scan.'})
writeFileSync('docs/evidence/stock-token-market-audit.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({block:report.blockNumber,directPoolActive:direct.active,route:report.route.pools.map(p=>p.address),quotes,scannedStablePools:scanned.map(p=>({quoteToken:p.quoteToken,address:p.address,fee:p.fee,active:p.active,status:p.status})),historyDiagnostics,productionApproved:false},null,2))
