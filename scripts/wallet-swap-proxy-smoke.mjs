import assert from 'node:assert/strict'
import {createWalletSwapHandler} from '../api/wallet-swap.ts'
let linked=true,rail='arc',upstream=[],reply,authed=true
const id='wss_'+'a'.repeat(64),env={HASHPAYSTREAM_WALLET_SWAP_API_KEY:'hpl_app_'+'b'.repeat(64)}
const h=createWalletSwapHandler({env:()=>env,identity:async()=>{if(!authed)throw Object.assign(Error('Sign in'),{status:401});return 'local-user'},account:async(user)=>{assert.equal(user,'local-user');return linked?{hashPayLinkUserId:'did:privy:verified',walletAppId:'fixture-app',subject:'a'.repeat(64),linkedAt:1}:undefined},fetcher:async(url,init)=>{upstream.push({url,init});return Response.json({ok:true,session:reply||{id,rail,chainId:rail==='arc'?5042:196,walletAppId:'fixture-app',checkoutPath:'/wallet/swap/'+id}})}})
async function call(body={rail}){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(b){this.body=b;return this}};await h({method:'POST',body},res);return res}
assert.equal((await call()).body.checkoutUrl,'https://app.hashpaylink.com/wallet/swap/'+id)
assert.equal(upstream[0].init.redirect,'error');assert.equal(JSON.parse(upstream[0].init.body).userId,'did:privy:verified')
await call({rail,userId:'did:privy:forged',wallet:'forged'});assert.equal(JSON.parse(upstream.at(-1).init.body).userId,'did:privy:verified')
assert.equal((await call({rail:'base'})).statusCode,400)
rail='xlayer';assert.equal((await call()).body.chainId,196)
reply={id,rail,chainId:196,walletAppId:'wrong',checkoutPath:'/wallet/swap/'+id};assert.equal((await call()).statusCode,502)
linked=false;assert.equal((await call()).body.needsConnection,true)
authed=false;assert.equal((await call()).statusCode,401)
console.log('Swap proxy passed: authenticated linked identity, fixed origin, exact rail/authority/path validation and unsupported-network rejection.')
