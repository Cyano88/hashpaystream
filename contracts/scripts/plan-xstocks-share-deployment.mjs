import fs from 'node:fs';
import crypto from 'node:crypto';
import {JsonRpcProvider,Contract,ContractFactory,keccak256,formatEther,getAddress} from 'ethers';
const manifest=JSON.parse(fs.readFileSync('xstocks-share-release.json','utf8'));
for(const [path,hash] of Object.entries(manifest.sources))if(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')!==hash)throw Error('Reviewed source changed: '+path);
const artifact=JSON.parse(fs.readFileSync('artifacts/src/XStocksTradeEscrowFactory.sol/XStocksTradeEscrowFactory.json','utf8'));
if(keccak256(artifact.bytecode)!==manifest.creationBytecodeHash)throw Error('Reviewed artifact changed');
const rpc=new JsonRpcProvider('https://rpc.xlayer.tech');if((await rpc.getNetwork()).chainId!==196n)throw Error('Wrong network');
if(await rpc.getCode(manifest.arbiter)==='0x')throw Error('Arbiter is not deployed');
for(const address of manifest.initialTokens){const token=new Contract(address,['function decimals() view returns(uint8)','function getSharesByUnderlyingAmount(uint256) view returns(uint256)'],rpc);if(await token.decimals()!==18n||await token.getSharesByUnderlyingAmount(2220000000000000n)===0n)throw Error('Stock preflight failed');}
const from=getAddress(process.env.XSTOCKS_DEPLOYER_ADDRESS||'0xDbf3178f7f43fE87EEE889739b40b35F8B39bc74');
const unsigned=await new ContractFactory(artifact.abi,artifact.bytecode).getDeployTransaction(manifest.arbiter,manifest.initialTokens);
const gas=await rpc.estimateGas({...unsigned,from}),fee=await rpc.getFeeData(),gasLimit=gas*120n/100n,price=fee.maxFeePerGas||fee.gasPrice;if(!price)throw Error('Fee unavailable');
const plan={...manifest,from,value:'0x0',data:unsigned.data,gasLimit:gasLimit.toString(),estimatedMaximumFeeOKB:formatEther(gasLimit*price),walletOKB:formatEther(await rpc.getBalance(from)),fundingEnabled:false,broadcast:false};
fs.mkdirSync('deployment-plans',{recursive:true});fs.writeFileSync('deployment-plans/xstocks-share-mainnet.json',JSON.stringify(plan,null,2)+'\n');
console.log(JSON.stringify({file:'contracts/deployment-plans/xstocks-share-mainnet.json',from,gasLimit:plan.gasLimit,estimatedMaximumFeeOKB:plan.estimatedMaximumFeeOKB,walletOKB:plan.walletOKB,broadcast:false}));
