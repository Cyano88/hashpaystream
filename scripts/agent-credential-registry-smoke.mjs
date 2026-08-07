import assert from 'node:assert/strict'
import {
  agentCredentialDigest,
  registerAgentCredential,
  revokeAgentCredential,
  safeAgentCredentialStore,
} from '../api/agent-credential-registry.ts'
import { verifiedPilotAgentIdentity } from '../api/agent-auth.ts'

function request(apiKey) {
  return { headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {} }
}

async function status(promise) {
  try {
    await promise
    return 200
  } catch (error) {
    return error?.status
  }
}

const pepper = 'registry-pepper-that-is-longer-than-thirty-two-characters'
const storeKey = 'test:hashpaystream:agent-credentials'
const keyA = `hps_agent_test_${'a'.repeat(40)}`
const keyB = `hps_agent_test_${'b'.repeat(40)}`
const unknownKey = `hps_agent_test_${'c'.repeat(40)}`
const env = {
  HASHPAYSTREAM_AGENT_CREDENTIAL_PEPPER: pepper,
  HASHPAYSTREAM_AGENT_CREDENTIAL_STORE_KEY: storeKey,
}

let store = registerAgentCredential(undefined, {
  apiKey: keyA,
  pepper,
  agentId: 'agent_registry_a',
  keyId: 'keyidaaaa',
  label: 'Agent A',
  now: '2026-08-06T12:00:00.000Z',
  auditId: 'audit_created_a',
  requestsPerMinute: 60,
})
store = registerAgentCredential(store, {
  apiKey: keyB,
  pepper,
  agentId: 'agent_registry_b',
  keyId: 'keyidbbbb',
  label: 'Agent B',
  now: '2026-08-06T12:01:00.000Z',
  auditId: 'audit_created_b',
  requestsPerMinute: 30,
})

const serialized = JSON.stringify(store)
assert.equal(serialized.includes(keyA), false)
assert.equal(serialized.includes(keyB), false)
assert.equal(Object.keys(store.credentials).length, 2)
assert.equal(store.audit.length, 2)
assert.equal(store.credentials[agentCredentialDigest(keyA, pepper)].agentId, 'agent_registry_a')
assert.equal(store.credentials[agentCredentialDigest(keyB, pepper)].requestsPerMinute, 30)
assert.throws(() => registerAgentCredential(store, {
  apiKey: unknownKey,
  pepper,
  agentId: 'agent_registry_c',
  keyId: 'keyidaaaa',
  now: '2026-08-06T12:01:30.000Z',
  auditId: 'audit_duplicate_key_id',
}), /already registered/)

const dependencies = {
  hasStore: () => true,
  read: async key => {
    assert.equal(key, storeKey)
    return store
  },
}
assert.equal(await verifiedPilotAgentIdentity(request(keyA), env, dependencies), 'agent:agent_registry_a')
assert.equal(await verifiedPilotAgentIdentity(request(keyB), env, dependencies), 'agent:agent_registry_b')
assert.equal(await status(verifiedPilotAgentIdentity(request(unknownKey), env, dependencies)), 401)
assert.equal(await status(verifiedPilotAgentIdentity(request(''), env, dependencies)), 401)
assert.equal(await status(verifiedPilotAgentIdentity(request(keyA), {}, {
  hasStore: () => false,
  read: async () => undefined,
})), 503)

store = revokeAgentCredential(store, {
  keyId: 'keyidaaaa',
  now: '2026-08-06T12:02:00.000Z',
  auditId: 'audit_revoked_a',
})
assert.equal(store.credentials[agentCredentialDigest(keyA, pepper)].status, 'revoked')
assert.equal(store.audit.at(-1).action, 'credential.revoked')
assert.equal(await status(verifiedPilotAgentIdentity(request(keyA), env, dependencies)), 401)
assert.equal(await verifiedPilotAgentIdentity(request(keyB), env, dependencies), 'agent:agent_registry_b')

assert.equal(await status(verifiedPilotAgentIdentity(request(keyB), env, {
  hasStore: () => false,
  read: async () => undefined,
})), 503)
assert.equal(await status(verifiedPilotAgentIdentity(request(keyB), env, {
  hasStore: () => true,
  read: async () => { throw new Error('storage unavailable') },
})), 503)
assert.equal(await status(verifiedPilotAgentIdentity(request(keyB), env, {
  ...dependencies,
  consume: () => false,
})), 429)

const safe = safeAgentCredentialStore({
  ...store,
  credentials: {
    ...store.credentials,
    invalid: { agentId: 'agent_bad' },
  },
})
assert.equal(Object.keys(safe.credentials).length, 2)

console.log('HashPayStream agent credential registry smoke checks passed.')
