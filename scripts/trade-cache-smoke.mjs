import assert from 'node:assert/strict';
import { cachedTradePage, publicTradePage, tradeRequest } from '../src/lib/tradeApi.ts';
globalThis.window = { setTimeout, clearTimeout };
let requests = 0, fail = false;
let release;
globalThis.fetch = async (_url, init) => {
  requests++;
  if (release) await new Promise(resolve => { release.resolve = resolve; });
  return new Response(JSON.stringify({ok: !fail, enabled: true, listings: [{id: String(requests)}]}), {status: fail ? 503 : 200});
};
const a = publicTradePage(), b = publicTradePage();
assert.equal(a, b, 'concurrent public loads must share a request');
await a; assert.equal(requests, 1);
await publicTradePage(); assert.equal(requests, 1);
assert.ok(cachedTradePage());
await tradeRequest('?mine=1', 'synthetic');
assert.equal(cachedTradePage('?mine=1'), undefined, 'private reads must never enter public cache');
await tradeRequest('', 'synthetic', {action:'remove'});
assert.equal(cachedTradePage(), undefined, 'mutations invalidate public snapshots');
release = {};
const old = publicTradePage();
const resolve = release.resolve;
release = null;
await tradeRequest('', 'synthetic', {action:'remove'});
resolve(); await old;
assert.equal(cachedTradePage(), undefined, 'old in-flight responses cannot repopulate invalidated cache');
fail = true; await assert.rejects(publicTradePage());
fail = false; await publicTradePage(); assert.ok(cachedTradePage());
const now = Date.now;
try {
 const base = now(); Date.now = () => base + 31_000;
 const count = requests; assert.ok(cachedTradePage()); await publicTradePage(); assert.equal(requests, count + 1);
 Date.now = () => base + 6 * 60_000; assert.equal(cachedTradePage(), undefined);
} finally { Date.now = now; }
console.log('Trade cache passed: deduplication, freshness, expiry, private isolation, mutation invalidation, late response and failure recovery.');
