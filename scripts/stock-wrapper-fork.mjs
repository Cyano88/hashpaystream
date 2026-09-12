import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {createPublicClient,createWalletClient,http,defineChain,parseAbi,keccak256} from 'viem'
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts'

const evidence=JSON.parse(readFileSync('docs/evidence/stock-xlayer-candidate.json','utf8'))
const port=18549,rpc='http://127.0.0.1:'+port
// Refuse to run against somebody else's local node.
const probe=createServer()
await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(port,'127.0.0.1',resolve)})
await new Promise(resolve=>probe.close(resolve))
const network=defineChain({id:31337,name:'Candidate fork only',nativeCurrency:{name:'Test gas',symbol:'TEST',decimals:18},rpcUrls:{default:{http:[rpc]}}})
const client=createPublicClient({chain:network,transport:http(rpc,{timeout:180000,retryCount:0}),pollingInterval:20})
const child=spawn(process.execPath,['node_modules/hardhat/internal/cli/cli.js','node','--hostname','127.0.0.1','--port',String(port),'--fork','https://rpc.xlayer.tech','--fork-block-number',String(evidence.blockNumber)],{
 cwd:new URL('../contracts/',import.meta.url),windowsHide:true,stdio:'ignore',
 env:{...process.env,XLAYER_DEPLOYER_PRIVATE_KEY:'',XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY:'',ARC_DEPLOYER_PRIVATE_KEY:'',DOTENV_CONFIG_PATH:'__no_candidate_env__'}})
const tokenAbi=parseAbi(['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)','function deposit(uint256,address) returns(uint256)','function asset() view returns(address)','function convertToAssets(uint256) view returns(uint256)'])
const wrapper=evidence.candidate.wrapper.address,underlying=evidence.candidate.underlying.address
const account=privateKeyToAccount(generatePrivateKey()),risk=privateKeyToAccount(generatePrivateKey())
const wallet=createWalletClient({chain:network,transport:http(rpc,{timeout:180000,retryCount:0}),account})
const send=async(w,address,abi,functionName,args)=>{
 const hash=await w.writeContract({address,abi,functionName,args,gas:2000000n})
 assert.equal((await client.waitForTransactionReceipt({hash})).status,'success')
}
try{
 let ready=false
 for(let i=0;i<300;i++){
  if(child.exitCode!==null)throw Error('Fork node failed to start')
  try{ready=await client.getChainId()===31337;if(ready)break}catch{}
  await new Promise(r=>setTimeout(r,100))
 }
 assert.ok(ready,'isolated fork ready')
 assert.equal((await client.getBlock({blockNumber:BigInt(evidence.blockNumber)})).hash,evidence.blockHash)
 for(const t of [evidence.candidate.underlying,evidence.candidate.wrapper,evidence.candidate.payment]){
  assert.equal(keccak256(await client.getCode({address:t.address})),t.runtimeHash)
  if(t.implementation)assert.equal(keccak256(await client.getCode({address:t.implementation})),t.implementationRuntimeHash)
 }
 console.log('Candidate runtime and implementation pins match the mainnet fork.')
 const amount=10n**16n
 // Seed only fork balances through local impersonation of the wrapper's custody address.
 // Exercise the real deposit implementation; no mainnet account is controlled or funded.
 for(const address of [account.address,wrapper]){
  await client.request({method:'hardhat_setBalance',params:[address,'0x3635c9adc5dea00000']})
  await client.request({method:'hardhat_impersonateAccount',params:[address]})
 }
 const wrapperWallet=createWalletClient({chain:network,transport:http(rpc,{timeout:180000,retryCount:0}),account:wrapper})
 await send(wrapperWallet,underlying,tokenAbi,'transfer',[account.address,10n**17n])
 await send(wallet,underlying,tokenAbi,'approve',[wrapper,10n**17n])
 await send(wallet,wrapper,tokenAbi,'deposit',[10n**17n,account.address])
 const initialWrappedBalance=await client.readContract({address:wrapper,abi:tokenAbi,functionName:'balanceOf',args:[account.address]})
 assert.ok(initialWrappedBalance>=amount)
 console.log('Actual wrapper deposit succeeded on local fork.')
 const artifact=JSON.parse(readFileSync('contracts/artifacts/src/StockEarlyPayEscrow.sol/StockEarlyPayEscrow.json','utf8'))
 const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,args:[evidence.candidate.payment.address,account.address,risk.address,100,60]})
 const receipt=await client.waitForTransactionReceipt({hash}),escrow=receipt.contractAddress
 assert.equal(receipt.status,'success')
 assert.equal(await client.readContract({address:escrow,abi:artifact.abi,functionName:'paused'}),true)
 await assert.rejects(()=>client.simulateContract({account,address:escrow,abi:artifact.abi,functionName:'depositStock',args:[wrapper,amount]}))
 await send(wallet,escrow,artifact.abi,'setAssetAllowed',[wrapper,true])
 await send(wallet,escrow,artifact.abi,'setFunderAllowed',[account.address,true])
 await send(wallet,escrow,artifact.abi,'setPaused',[false])
 await send(wallet,wrapper,tokenAbi,'approve',[escrow,amount])
 await send(wallet,escrow,artifact.abi,'depositStock',[wrapper,amount])
 assert.equal(await client.readContract({address:wrapper,abi:tokenAbi,functionName:'balanceOf',args:[escrow]}),amount)
 assert.equal(await client.readContract({address:escrow,abi:artifact.abi,functionName:'inventory',args:[account.address,wrapper]}),amount)
 await send(wallet,escrow,artifact.abi,'setPaused',[true])
 await send(wallet,escrow,artifact.abi,'withdrawStock',[wrapper,amount])
 assert.equal(await client.readContract({address:wrapper,abi:tokenAbi,functionName:'balanceOf',args:[account.address]}),initialWrappedBalance)
 // Synthetic donation check on fork state; no issuer or mainnet transaction.

 await send(wrapperWallet,underlying,tokenAbi,'transfer',[account.address,10n**15n])
 const before=await client.readContract({address:wrapper,abi:tokenAbi,functionName:'convertToAssets',args:[10n**18n]})
 const balanceBefore=await client.readContract({address:wrapper,abi:tokenAbi,functionName:'balanceOf',args:[account.address]})
 await send(wallet,underlying,tokenAbi,'transfer',[wrapper,10n**15n])
 assert.equal(await client.readContract({address:wrapper,abi:tokenAbi,functionName:'convertToAssets',args:[10n**18n]}),before,'donation cannot change V2 conversion')
 assert.equal(await client.readContract({address:wrapper,abi:tokenAbi,functionName:'balanceOf',args:[account.address]}),balanceBefore)
 console.log('Real wSPYx V2 fork checks passed: pinned code, paused constructor, exact deposit/withdrawal, withdrawals while paused, donation-resistant conversion. Local chain only.')
}finally{child.kill()}
