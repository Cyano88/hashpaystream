import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {createCircleWalletHandler} from '../api/circle-wallet.ts'
const root=process.env.HASHPAYLINK_CONTRACT_TEST_ROOT
if(!root)throw Error('Set HASHPAYLINK_CONTRACT_TEST_ROOT to the reviewed release')
const {createArcWalletHandler}=await import(pathToFileURL(root+'/api/arc-wallet.ts').href)
const address='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222',id='11111111-1111-4111-8111-111111111111'
const store=new Map(),providerCalls=[]
const upstream=createArcWalletHandler({hasStore:()=>true,configuration:()=>({chainId:5042,blockchain:'ARC',appId:'fixture-app'}),policy:async()=>({partnerId:'fixture-project',merchantName:'Hash PayStream',environment:'live',checkoutMode:'human',capabilities:['arc_agreements']}),read:async k=>store.get(k),mutate:async(k,f)=>{const n=f(store.get(k));store.set(k,n);return n},provider:async(path,token,body)=>{providerCalls.push({path,token,body});if(path.includes('/wallets?'))return {wallets:[{id,address,blockchain:'ARC',accountType:'SCA',state:'LIVE'}]};if(path.endsWith('/email/token'))return {deviceToken:'synthetic-device',deviceEncryptionKey:'synthetic-key',otpToken:'synthetic-otp'};return {challengeId:id}}})
const response=()=>({statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(b){this.body=b;return this}})
const original=globalThis.fetch,requests=[]
globalThis.fetch=async(url,init)=>{assert.equal(url,'https://app.hashpaylink.com/api/v2/wallets/arc');assert.equal(init.redirect,'error');assert.match(init.headers['x-api-key'],/^hpl_app_/);requests.push(url);const res=response();await upstream({method:'POST',headers:{'x-api-key':init.headers['x-api-key']},originalUrl:'/api/v2/wallets/arc',body:JSON.parse(init.body)},res);return Response.json(res.body,{status:res.statusCode})}
const env={HASHPAYSTREAM_ARC_ENVIRONMENT:'live',HASHPAYSTREAM_ARC_WALLET_API_KEY:'hpl_app_'+'a'.repeat(64),VITE_CIRCLE_USER_WALLET_APP_ID_ARC_MAINNET:'fixture-app'}
const handler=createCircleWalletHandler({env:()=>env,identity:async()=> 'fixture@example.invalid'})
const call=async body=>{const res=response();await handler({method:'POST',headers:{},body:{walletEnvironment:'live',...body}},res);return res}
try {
 assert.equal((await call({action:'configuration'})).statusCode,200)
 assert.equal((await call({action:'request_email_otp',email:'other@example.invalid',deviceId:'registered'})).statusCode,403)
 assert.equal((await call({action:'request_email_otp',email:'fixture@example.invalid',deviceId:'registered'})).statusCode,200)
 assert.equal((await call({action:'list_wallets',userToken:'synthetic-session'})).body.wallet.blockchain,'ARC')
 assert.equal((await call({action:'create_wallet',userToken:'synthetic-session'})).statusCode,200)
 assert.equal(providerCalls.at(-1).body.metadata[0].name,'Hash PayStream Arc')
 assert.equal((await call({action:'send_usdc',userToken:'synthetic-session',walletId:id,walletAddress:address,recipient,amountUnits:'100'})).statusCode,200)
 assert.equal(providerCalls.at(-1).body.contractAddress,address)
 assert.equal(providerCalls.at(-1).body.refId,'fixture-project:hashpaystream-arc-send')
 const count=requests.length;delete env.HASHPAYSTREAM_ARC_WALLET_API_KEY
 assert.equal((await call({action:'list_wallets',userToken:'synthetic-session'})).statusCode,503)
 assert.equal(requests.length,count,'No fallback to Circle or sandbox when hosted key is missing')
 console.log('Actual Hash PayStream -> Hash PayLink handlers passed: own-email OTP, app binding, Arc-only wallet, transfer challenge and no provider-key fallback.')
} finally {globalThis.fetch=original}
