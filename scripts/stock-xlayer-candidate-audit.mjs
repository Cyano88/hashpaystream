import {writeFileSync,mkdirSync} from 'node:fs'
import {createPublicClient,http,parseAbi,getAddress,keccak256} from 'viem'

// Public discovery only: no credentials, wallet, signing or transaction methods.
const base='https://api.backed.fi/api/v2/public/assets/SPYx'
const read=async url=>{
 const r=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error'})
 if(!r.ok)throw Error('Issuer metadata request failed: '+r.status)
 return r.json()
}
const [asset,price,multiplier]=await Promise.all([read(base),read(base+'/price-data'),read(base+'/multiplier?network=XLayer')])
if(asset.symbol!=='SPYx'||asset.underlyingSymbol!=='SPY')throw Error('Unexpected issuer asset')
const deployments=asset.deployments.filter(d=>d.network==='XLayer')
if(deployments.length!==1||!deployments[0].wrapperAddressV2)throw Error('Unambiguous V2 deployment required')
const d=deployments[0],underlying=getAddress(d.address),wrapper=getAddress(d.wrapperAddressV2)
const payment=d.stablecoins.find(t=>t.symbol==='USDC')
if(!payment||payment.decimals!==6)throw Error('Issuer USDC configuration missing')
const c=createPublicClient({transport:http('https://rpc.xlayer.tech',{timeout:15000,retryCount:0})})
if(await c.getChainId()!==196)throw Error('Wrong RPC chain')
const b=await c.getBlock()
const abi=parseAbi(['function asset() view returns(address)','function symbol() view returns(string)','function decimals() view returns(uint8)','function convertToAssets(uint256) view returns(uint256)'])
const inspect=async address=>{
 const [code,slot,symbol,decimals]=await Promise.all([
  c.getCode({address,blockNumber:b.number}),
  c.getStorageAt({address,slot:'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',blockNumber:b.number}),
  c.readContract({address,abi,functionName:'symbol',blockNumber:b.number}),
  c.readContract({address,abi,functionName:'decimals',blockNumber:b.number})])
 if(!code||code==='0x')throw Error('Token bytecode missing')
 const implementation=slot&&!/^0x0+$/.test(slot)?getAddress('0x'+slot.slice(-40)):null
 const implCode=implementation?await c.getCode({address:implementation,blockNumber:b.number}):null
 if(implementation&&(!implCode||implCode==='0x'))throw Error('Implementation bytecode missing')
 return {address,symbol,decimals,runtimeHash:keccak256(code),implementation,implementationRuntimeHash:implCode?keccak256(implCode):null}
}
const [token,wrapped,usdc]=await Promise.all([inspect(underlying),inspect(wrapper),inspect(getAddress(payment.address))])
const wrapperAsset=await c.readContract({address:wrapper,abi,functionName:'asset',blockNumber:b.number})
if(getAddress(wrapperAsset)!==underlying||wrapped.symbol!=='wSPYx'||wrapped.decimals!==18||usdc.decimals!==6)throw Error('Issuer deployment disagrees with chain')
const conversion=await c.readContract({address:wrapper,abi,functionName:'convertToAssets',args:[10n**18n],blockNumber:b.number})
if((await c.getBlock({blockNumber:b.number})).hash!==b.hash)throw Error('Noncanonical audit boundary')
const report={
 schema:1,fetchedAt:new Date().toISOString(),chainId:196,blockNumber:Number(b.number),blockHash:b.hash,
 sourceUrls:[base,base+'/price-data',base+'/multiplier?network=XLayer'],
 candidate:{symbol:'wSPYx',selectionStatus:'technical_candidate_not_approved',underlying:token,wrapper:wrapped,payment:usdc,underlyingUnitsPerWholeWrapper:conversion.toString()},
 provider:{issuer:'Backed/xStocks',isTradingHalted:asset.isTradingHalted,trading:asset.trading,
  publicPrice:{value:price.quote,currency:'USD',sourceTimestamp:null,usableForAcceptance:false},
  multiplier,supportsAtomicSwaps:d.supportsAtomicSwaps,authenticatedAccountVerified:false,participantEligibilityVerified:false},
 deploymentReady:false,
 blockers:['Authenticated pricing and executable liquidity not verified','Public indicative price has no source timestamp',
  'Per-worker and per-funder eligibility and distribution permission not verified',
  'Wrapper implementation source/audit review and upgrade controls incomplete',
  'USD-to-USDC conversion and wrapper price units need verified implementation',
  'Risk limits, owner/multisig and distinct signers not approved']
}
if(process.argv.includes('--write')){
 mkdirSync('docs/evidence',{recursive:true})
 writeFileSync('docs/evidence/stock-xlayer-candidate.json',JSON.stringify(report,null,2)+'\n')
}
console.log(JSON.stringify(report,null,2))
