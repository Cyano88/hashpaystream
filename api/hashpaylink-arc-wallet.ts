export async function hashPayLinkArcWallet<T extends Record<string, unknown>>(env: NodeJS.ProcessEnv,path: string,init: {method?:string;userToken?:string;body?:Record<string,unknown>}={}) {
 const key=env.HASHPAYSTREAM_ARC_WALLET_API_KEY?.trim()||''
 if(!/^hpl_app_[a-f0-9]{64}$/.test(key))throw Object.assign(new Error('Hash PayLink Arc wallet access is not configured.'),{status:503})
 const response=await fetch('https://app.hashpaylink.com/api/v2/wallets/arc',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','x-api-key':key},body:JSON.stringify({path,method:init.method??'GET',...(init.userToken?{userToken:init.userToken}:{}),...(init.body?{payload:init.body}:{})})})
 const payload=await response.json().catch(()=>({})) as {ok?:boolean;data?:T;error?:string}
 if(!response.ok||payload.ok!==true||!payload.data||typeof payload.data!=='object')throw Object.assign(new Error(response.status>=500?'Hash PayLink wallet service is temporarily unavailable.':payload.error||'Hash PayLink rejected the wallet request.'),{status:response.status>=400?response.status:502})
 return payload.data
}
