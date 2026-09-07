import assert from 'node:assert/strict'
import { createUpfrontSettlementRuntime } from '../api/upfront-settlement-runtime.ts'
const empty = { eligible: 0, settled: 0, alreadySettled: 0, deferred: 0, codes: [] }
const env = { HASHPAYSTREAM_SETTLEMENT_WORKER_ENABLED: 'true', DATABASE_URL: 'postgres://local/test' }
const flush = async () => { for(let i=0;i<12;i++) await new Promise(resolve=>setImmediate(resolve)) }
const disabled = createUpfrontSettlementRuntime({}, { pool: () => assert.fail('Disabled runtime must not open a database'), validate: () => assert.fail('Disabled runtime must not load signer configuration') })
disabled.start(); disabled.trigger(); await disabled.stop()
assert.equal(disabled.enabled, false)
assert.throws(() => createUpfrontSettlementRuntime(env, { validate: () => ({enabled:false}) }), /AUTO_SETTLEMENT_DISABLED/)
assert.throws(() => createUpfrontSettlementRuntime({...env,DATABASE_URL:''}, {validate:()=>({enabled:true})}), /DATABASE_NOT_CONFIGURED/)
let locked = false, passes = 0, closed = 0, destroyed = 0, unlockFailure = false
const pool = () => ({
 connect: async () => {
  let owns = false
  return {
   query: async (sql,args) => {
    assert.deepEqual(args,[5042002,1])
    if(sql.includes('pg_try_advisory_lock')) { owns=!locked; if(owns)locked=true; return {rows:[{acquired:owns}]} }
    assert.match(sql,/pg_advisory_unlock/)
    if(unlockFailure)throw Error('UNLOCK_FAILED')
    assert.equal(owns,true); locked=false; owns=false; return {rows:[]}
   },
   release: destroy => { if(destroy){destroyed++;if(owns)locked=false} },
  }
 }, end:async()=>{closed++},
})
let completePass
const gate = new Promise(resolve=>{completePass=resolve})
const deps = {pool,validate:()=>({enabled:true}),log:()=>{},runPass:async()=>{passes++;if(passes===1)await gate;return empty}}
const first=createUpfrontSettlementRuntime(env,deps)
const second=createUpfrontSettlementRuntime(env,deps)
first.trigger(); assert.equal(passes,0,'No wakeup before startup')
first.start();first.start();await flush();assert.equal(passes,1)
second.start();await flush();assert.equal(passes,1,'Competing runtime must not execute without lease')
first.trigger();first.trigger()
let stopped=false
const draining=first.stop().then(()=>{stopped=true})
await flush();assert.equal(stopped,false);assert.equal(closed,0,'Keep lease and pool while pass drains')
completePass();await draining
first.trigger();first.start();await flush();assert.equal(passes,1,'Stopped runtime must not restart or process queued wakeups')
second.trigger();await flush();assert.equal(passes,2,'Other runtime can catch up after lease release')
await second.stop();assert.equal(closed,2);assert.equal(locked,false)
unlockFailure=true
const third=createUpfrontSettlementRuntime(env,{...deps,log:()=>{throw Error('Broken logger')}})
third.start();await flush();await third.stop()
assert.equal(destroyed,1,'Failed unlock destroys the connection rather than returning a held lock to the pool')
assert.equal(locked,false)
console.log('Embedded settlement runtime activation, competing leases, wakeup, drain and lock cleanup checks passed.')
