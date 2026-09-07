import assert from 'node:assert/strict'
import net from 'node:net'
import pg from 'pg'
import { createTradeReadinessProbe } from '../api/trade-readiness.ts'
import { createHashPayStreamReadinessHandler } from '../api/readiness.ts'

const env = {
  HASHPAYSTREAM_TRADE_ENABLED: 'true',
  HASHPAYSTREAM_TRADE_DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/trade_fixture',
  HASHPAYSTREAM_TRADE_OWNERSHIP_SECRET: 'fixture-ownership-secret-at-least-32-characters',
  PRIVY_APP_ID: 'fixture-app', PRIVY_APP_SECRET: 'fixture-secret',
  CIRCLE_TEST_API_KEY: 'fixture-circle-key-long-enough',
  VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET: 'fixture-circle-app-long-enough',
}
let calls = 0, finish, fail = false
const probe = createTradeReadinessProbe(config => {
  assert.equal(config.max, 1)
  assert.equal(config.options, '-c default_transaction_read_only=on')
  return {
    on() {},
    query(sql) {
      assert.match(sql, /where false$/)
      assert.equal((sql.match(/public\.hashpaystream_trade_/g) || []).length, 5)
      calls++
      if (fail) return Promise.reject(new Error('private-database-detail'))
      return new Promise(resolve => { finish = resolve })
    },
  }
})
await probe({})
assert.equal(calls, 0)
for (const key of ['HASHPAYSTREAM_TRADE_DATABASE_URL', 'HASHPAYSTREAM_TRADE_OWNERSHIP_SECRET', 'PRIVY_APP_ID', 'PRIVY_APP_SECRET']) {
  await assert.rejects(probe({ ...env, [key]: '' }), /configuration/)
}
assert.equal(calls, 0)
const pending = [probe(env), probe(env), probe(env)]
assert.equal(calls, 1, 'Concurrent health requests share one query')
finish()
await Promise.all(pending)
fail = true
await assert.rejects(probe(env), /private-database-detail/)
fail = false
const recovered = probe(env)
finish()
await recovered
assert.equal(calls, 3, 'A failed query must not poison future probes')

const events = []
const handler = createHashPayStreamReadinessHandler({
  hasStore: () => true, read: async () => undefined, env: () => env,
  checkTrade: async () => { throw new Error('private-database-detail') },
  logError: event => events.push(event),
})
const response = { code: 0, headers: {}, setHeader(k,v) { this.headers[k]=v }, status(code) { this.code=code; return this }, json(body) { this.body=body; return this } }
await handler({ method: 'GET' }, response)
assert.equal(response.code, 503)
assert.deepEqual(response.body, { ok: false, service: 'hashpaystream', status: 'unavailable' })
assert.equal(response.headers['Cache-Control'], 'no-store')
assert.deepEqual(events[0].configurationIssues, ['TRADE_UNAVAILABLE'])
assert.equal(JSON.stringify({ response, events }).includes('private-database-detail'), false)

// Real TCP connection that never answers the PostgreSQL startup packet.
// Verifies the actual driver timeout, without production data or credentials.
const sockets = new Set()
const server = net.createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let pool
try {
  const timeoutProbe = createTradeReadinessProbe(config => { pool = new pg.Pool(config); return pool })
  const started = performance.now()
  await assert.rejects(timeoutProbe({ ...env, HASHPAYSTREAM_TRADE_DATABASE_URL: `postgresql://test:test@127.0.0.1:${server.address().port}/trade_fixture` }))
  assert.ok(performance.now() - started < 3500, 'Unresponsive database must fail within health-check budget')
} finally {
  for (const socket of sockets) socket.destroy()
  if (pool) await pool.end()
  await new Promise(resolve => server.close(resolve))
}
console.log('Trade readiness configuration, concurrency, recovery, privacy and real connection-timeout checks passed.')
