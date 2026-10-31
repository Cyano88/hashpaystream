import assert from 'node:assert/strict';import {spawn}from'node:child_process';import net from'node:net';
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const child=spawn(process.execPath,['--import','tsx','server.ts'],{env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,NODE_ENV:'test',PORT:String(port),HASHPAYSTREAM_TRADE_ENABLED:'false'},windowsHide:true,stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',d=>errors+=d);
try{let up=false;for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(errors);try{up=(await fetch('http://127.0.0.1:'+port+'/healthz')).ok}catch{}if(up)break;await new Promise(r=>setTimeout(r,100))}assert.ok(up,errors);
const base='http://127.0.0.1:'+port;
for(const route of ['human/agreements','upfront/assessments','stock-early-pay','wallet/swap','pocket-transfers','requests','service-requests','savings/config','agent/agreements'])for(const method of ['GET','POST'])assert.equal((await fetch(base+'/api/hashpaystream/v1/'+route,{method})).status,410,route);
for(const action of ['send_usdc','set_router_paused'])assert.equal((await fetch(base+'/api/hashpaystream/v1/circle-wallet',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})})).status,410);
assert.equal((await fetch(base+'/readyz')).status,503);
console.log('PASS actual Trade-only server: retired endpoints and wallet transfers rejected; disabled Trade is not ready; no provider credentials or fund actions used.');
}finally{child.kill();await new Promise(r=>child.once('exit',r))}
