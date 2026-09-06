import assert from 'node:assert/strict';
import {configuredTradePool} from '../api/trade-store.ts';
const before={...process.env};
try{
 delete process.env.HASHPAYSTREAM_TRADE_DATABASE_URL;
 process.env.DATABASE_URL='postgres://financial_role@127.0.0.1/financial';
 process.env.POSTGRES_URL=process.env.DATABASE_URL;
 assert.throws(()=>configuredTradePool(),/Trade storage is unavailable/);
 process.env.HASHPAYSTREAM_TRADE_DATABASE_URL='postgres://trade_role@127.0.0.1/trade';
 const pool=configuredTradePool();
 assert.equal(new URL(pool.options.connectionString).pathname,'/trade');
 assert.equal(pool.options.max,4);await pool.end();
 console.log('Trade storage isolation passed: no financial database fallback; explicit dedicated connection required.');
}finally{for(const key of ['HASHPAYSTREAM_TRADE_DATABASE_URL','DATABASE_URL','POSTGRES_URL']){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
