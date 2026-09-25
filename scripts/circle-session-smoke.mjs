import assert from 'node:assert/strict'
import { circleUserTokenExpiresAt, clearStoredCircleSession, readStoredCircleSession, writeStoredCircleSession } from '../src/lib/circleSession.ts'

const records = new Map()
const storage = {
  getItem: key => records.get(key) ?? null,
  setItem: (key, value) => records.set(key, value),
  removeItem: key => records.delete(key),
}
const expiresAt = Date.now() + 10 * 60 * 1_000
const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expiresAt / 1_000) })).toString('base64url')
const userToken = `header.${payload}.signature`
const session = {
  version: 1,
  appId: 'circle-app',
  email: 'member@example.com',
  userToken,
  refreshToken: 'refresh-token',
  deviceId: 'device-id',
  wallet: { id: 'wallet-id', address: '0x1111111111111111111111111111111111111111', blockchain: 'ARC-TESTNET', accountType: 'SCA', state: 'LIVE' },
}

writeStoredCircleSession(storage, session)
assert.equal(readStoredCircleSession(storage, 'circle-app', 'member@example.com', 'device-id')?.wallet.address, session.wallet.address)
assert.equal(readStoredCircleSession(storage, 'circle-app', 'other@example.com', 'device-id'), undefined)
assert.equal(readStoredCircleSession(storage, 'circle-app', 'member@example.com', 'other-device'), undefined)
assert.ok(Math.abs(circleUserTokenExpiresAt(userToken) - expiresAt) < 1_000)
clearStoredCircleSession(storage)
assert.equal(readStoredCircleSession(storage, 'circle-app', 'member@example.com', 'device-id'), undefined)

console.log('Circle device-bound session persistence checks passed.')

const {canReuseNativeCircleSession}=await import('../src/lib/circleSession.ts');
const now=Date.now();
const nativeFixture={encryptionKey:'fixture',savedAt:now-1000,userToken:'header.'+Buffer.from(JSON.stringify({exp:Math.floor(now/1000)+3600})).toString('base64url')+'.signature'};
assert.equal(canReuseNativeCircleSession(nativeFixture,now),true);
assert.equal(canReuseNativeCircleSession({...nativeFixture,userToken:'header.'+Buffer.from(JSON.stringify({exp:Math.floor(now/1000)-1})).toString('base64url')+'.signature'},now),false);
assert.equal(canReuseNativeCircleSession({...nativeFixture,savedAt:now-13*60*60*1000},now),false);
assert.equal(canReuseNativeCircleSession({...nativeFixture,savedAt:now+1000},now),false);
console.log('Valid saved native sessions restore silently; expired tokens refresh before reuse.');
