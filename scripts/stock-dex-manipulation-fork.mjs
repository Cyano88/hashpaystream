import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createPublicClient,createWalletClient,http,defineChain,parseAbi,keccak256,encodePacked,encodeAbiParameters,toHex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {assertStockDexHistory} from '../api/stock-dex-history.ts';
const pins=JSON.parse(readFileSync('docs/evidence/stock-dex-exit.json','utf8'));
const port=18557,rpc='http://127.0.0.1:'+port;
const probe=createServer();await new Promise((r,j)=>{probe.once('error',j);probe.listen(port,'127.0.0.1',r)});await new Promise(r=>probe.close(r));
const chain=defineChain({id:31337,name:'Manipulation rehearsal ONLY',nativeCurrency:{name:'Test',symbol:'TEST',decimals:18},rpcUrls:{default:{http:[rpc]}}});
const client=createPublicClient({chain,transport:http(rpc,{timeout:180000,retryCount:0}),pollingInterval:20});
const account=privateKeyToAccount(generatePrivateKey()),worker=privateKeyToAccount(generatePrivateKey());
const wallet=createWalletClient({chain,transport:http(rpc,{timeout:180000,retryCount:0}),account});
const child=spawn(process.execPath,['node_modules/hardhat/internal/cli/cli.js','node','--hostname','127.0.0.1','--port',String(port),'--fork','https://rpc.xlayer.tech','--fork-block-number',String(pins.blockNumber)],{cwd:new URL('../contracts/',import.meta.url),windowsHide:true,stdio:'ignore',env:{...process.env,XLAYER_DEPLOYER_PRIVATE_KEY:'',XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY:'',ARC_DEPLOYER_PRIVATE_KEY:'',DOTENV_CONFIG_PATH:'__no_attack_env__'}});
const abi=parseAbi(['function balanceOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)','function transfer(address,uint256) returns(bool)','function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)','function observe(uint32[]) view returns(int56[],uint160[])','function quoteExactInput(bytes,uint256) returns(uint256,uint160[],uint32[],uint256)','function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params) payable returns(uint256)']);
const stock=pins.candidate.wrapper.address,usdc=pins.candidate.payment.address,router=pins.contracts.router;
const reverse=encodePacked(['address','uint24','address','uint24','address'],[usdc,100,pins.contracts.usdg,500,stock]);
const read=(address,functionName,args=[])=>client.readContract({address,abi,functionName,args});
const balance=t=>read(t,'balanceOf',[account.address]);
const send=async(address,functionName,args)=>{assert.equal(await client.getChainId(),31337);const hash=await wallet.writeContract({address,abi,functionName,args,gas:4000000n});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success')};
const quote=async(path,amount)=>(await client.simulateContract({address:pins.contracts.quoter,abi,functionName:'quoteExactInput',args:[path,amount]})).result[0];
const swap=async(path,amount)=>{const q=await quote(path,amount);await send(router,'exactInput',[{path,recipient:account.address,amountIn:amount,amountOutMinimum:q}]);return q};
const history=async()=>{try{for(const p of pins.route.pools){const s=await read(p.address,'slot0');const [ticks]=await read(p.address,'observe',[[1800,300,0]]);assertStockDexHistory(s[1],ticks,50)}return true}catch{return false}};
const report={schema:1,sourceBlock:pins.blockNumber,sourceBlockHash:pins.blockHash,chainId:31337,mainnetTransaction:false,productionApproved:false,scenarios:[],assumptions:['Synthetic attacker USDC seeded by local storage edit; real pool liquidity and swap code unchanged.','Hypothetical DEX-only offer uses executable output for 1 wSPYx as its unit valuation; not the current production adapter.','Fixed claims modeled as future USDC receivables, not actual escrow acceptance or repayment.','Zero funding fee; excludes gas, capital cost, other traders, arbitrage and MEV.','30-minute holds are optimistic attack bounds; no claim of uninterrupted real-world manipulation.','One historical block and finite parameter matrix cannot establish production safety.']};
try{
 let ready=false;for(let i=0;i<300;i++){if(child.exitCode!==null)throw Error('Fork exited');try{ready=await client.getChainId()===31337;if(ready)break}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(ready);
 assert.equal((await client.getBlock({blockNumber:BigInt(pins.blockNumber)})).hash,pins.blockHash);
 for(const t of [pins.candidate.wrapper,pins.candidate.underlying,pins.candidate.payment]){assert.equal(keccak256(await client.getCode({address:t.address})),t.runtimeHash);if(t.implementation){const s=await client.getStorageAt({address:t.address,slot:'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'});assert.equal(s.slice(-40).toLowerCase(),t.implementation.slice(2).toLowerCase());assert.equal(keccak256(await client.getCode({address:t.implementation})),t.implementationRuntimeHash)}}
 for(const key of ['factory','quoter','router','usdg'])assert.equal(keccak256(await client.getCode({address:pins.contracts[key]})),pins.contracts.runtimeHashes[key]);
 for(const p of pins.route.pools)assert.equal(keccak256(await client.getCode({address:p.address})),p.runtimeHash);
 await client.request({method:'hardhat_setBalance',params:[account.address,'0x3635c9adc5dea00000']});
 await client.request({method:'evm_mine',params:[]});
 let slot;for(let i=0;i<40;i++){const candidate=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[account.address,BigInt(i)]));const previous=await client.getStorageAt({address:usdc,slot:candidate});await client.request({method:'hardhat_setStorageAt',params:[usdc,candidate,toHex(123456789n,{size:32})]});const found=await balance(usdc)===123456789n;await client.request({method:'hardhat_setStorageAt',params:[usdc,candidate,previous??toHex(0n,{size:32})]});if(found){slot=candidate;break}}assert.ok(slot,'USDC local balance slot located');
 await send(usdc,'approve',[router,1000000n*1000000n]);await send(stock,'approve',[router,2n**255n]);
 const baselinePrice=await quote(pins.route.path,10n**18n);report.baselineUnitExitUsdc=String(baselinePrice);report.baselineHistoryPass=await history();
 let snapshot=await client.request({method:'evm_snapshot',params:[]});
 for(const capital of [1000,10000,100000])for(const hold of [0,1801])for(const count of [1,10,100]){
  await client.request({method:'evm_revert',params:[snapshot]});snapshot=await client.request({method:'evm_snapshot',params:[]});
  const row={capitalUsdc:capital,holdSeconds:hold,claimCount:count,principalPerClaimUsdc:100};
  try{
   const initial=BigInt(capital)*1000000n;await client.request({method:'hardhat_setStorageAt',params:[usdc,slot,toHex(initial,{size:32})]});
   const acquired=await swap(reverse,initial);if(hold){await client.request({method:'evm_increaseTime',params:[hold]});await client.request({method:'evm_mine',params:[]})}
   const inflated=await quote(pins.route.path,10n**18n);const perClaim=100000000n*10n**18n/inflated,total=perClaim*BigInt(count);
   Object.assign(row,{priceInflationBps:Number((inflated-baselinePrice)*10000n/baselinePrice),historyPass:await history(),acquiredStock:String(acquired),workerStockPerClaim:String(perClaim)});
   if(total>await balance(stock)){row.status='INSUFFICIENT_ATTACK_INVENTORY'}else{
    await send(stock,'transfer',[worker.address,total]);const remaining=await balance(stock);if(remaining>0n)await swap(pins.route.path,remaining);
    const recovered=await balance(usdc),receivable=BigInt(count)*100000000n;Object.assign(row,{status:'SIMULATED',recoveredUsdcUnits:String(recovered),fixedReceivableUsdcUnits:String(receivable),netBeforeGasAndCapitalUsdcUnits:String(recovered+receivable-initial),baselineWorkerValueUsdcUnits:String(total*baselinePrice/10n**18n)});
    assert.equal(await read(stock,'balanceOf',[worker.address]),total);
   }
  }catch(e){row.status='SCENARIO_FAILED';row.reason=e.shortMessage??e.message}
  report.scenarios.push(row);console.log(JSON.stringify(row));
 }
 const immediate=report.scenarios.find(s=>s.capitalUsdc===100000&&s.holdSeconds===0&&s.claimCount===100)
 const sustained=report.scenarios.find(s=>s.capitalUsdc===100000&&s.holdSeconds===1801&&s.claimCount===100)
 assert.equal(immediate?.historyPass,false,'Immediate large move must trip the same-pool history guard')
 assert.equal(sustained?.historyPass,true,'Sustained move must demonstrate the same-pool history limitation')
 assert.ok(BigInt(sustained?.netBeforeGasAndCapitalUsdcUnits??'0')>0n,'Sustained multi-claim model must remain positive before omitted costs')
 report.completedAt=new Date().toISOString();writeFileSync('docs/evidence/stock-dex-manipulation-fork.json',JSON.stringify(report,null,2)+'\n');
}finally{child.kill()}
