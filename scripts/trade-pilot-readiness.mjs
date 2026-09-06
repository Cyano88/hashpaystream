// Bounded, read-only checks. Prints statuses and timings, never listing bodies or tokens.
const origin='https://hashpaystream-trade-pilot.onrender.com';
const checks=[['/healthz',200],['/api/hashpaystream/v1/trade/listings',200],['/api/hashpaystream/v1/trade/conversations',401],['/api/hashpaystream/v1/trade/moderation',401],['/api/hashpaystream/v1/service-requests',404]];
let failed=false;
for(const [path,expected] of checks){
 const started=performance.now();
 try{
  const r=await fetch(origin+path,{signal:AbortSignal.timeout(20000),cache:'no-store'});
  const body=await r.json().catch(()=>null);
  const valid=r.status===expected && (path.endsWith('/listings')?body?.ok===true&&body?.enabled===true:Array.isArray(body)?false:true);
  console.log(JSON.stringify({path,status:r.status,expected,ms:Math.round(performance.now()-started),passed:valid}));if(!valid)failed=true;
 }catch{failed=true;console.log(JSON.stringify({path,passed:false,error:'Request failed or exceeded 20 seconds'}));}
}
if(failed)process.exitCode=1;
