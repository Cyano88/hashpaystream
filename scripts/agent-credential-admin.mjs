import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  AGENT_API_KEY_PATTERN,
  AGENT_ID_PATTERN,
  agentCredentialRegistryConfig,
  registerAgentCredential,
  revokeAgentCredential,
  safeAgentCredentialStore,
} from '../api/agent-credential-registry.ts'
import {
  hasRenderDurableStore,
  mutateDurableJson,
  readDurableJson,
} from '../api/durable-store.ts'

const CONFIRM = '--confirm-agent-credential-write'
const command = String(process.argv[2] ?? '').trim().toLowerCase()

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] ?? '').trim() : ''
}

function auditId() {
  return `audit_${randomBytes(12).toString('hex')}`
}

function requireRegistry() {
  const config = agentCredentialRegistryConfig(process.env)
  if (!config) throw new Error('HASHPAYSTREAM_AGENT_CREDENTIAL_PEPPER is required.')
  if (!hasRenderDurableStore()) throw new Error('Render durable storage is unavailable.')
  return config
}

function outsideRepository(filename) {
  const resolved = path.resolve(filename)
  const relative = path.relative(process.cwd(), resolved)
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('Credential output must be outside the repository.')
  }
  return resolved
}

function sanitizedRecords(store) {
  return Object.values(store.credentials)
    .map(record => ({
      keyId: record.keyId,
      agentId: record.agentId,
      label: record.label,
      status: record.status,
      createdAt: record.createdAt,
      revokedAt: record.revokedAt,
      requestsPerMinute: record.requestsPerMinute,
    }))
    .sort((left, right) => left.agentId.localeCompare(right.agentId) || left.keyId.localeCompare(right.keyId))
}

if (!['create', 'list', 'revoke'].includes(command)) {
  throw new Error('Use create, list, or revoke.')
}

const config = requireRegistry()
const current = safeAgentCredentialStore(await readDurableJson(config.storeKey))

if (command === 'list') {
  console.log(JSON.stringify({ ok: true, credentials: sanitizedRecords(current) }, null, 2))
  process.exit(0)
}

if (command === 'create') {
  const agentId = option('--agent-id').toLowerCase()
  const label = option('--label')
  const requestsPerMinute = Number(option('--requests-per-minute') || '120')
  const outputFile = outsideRepository(option('--output-file'))
  if (!AGENT_ID_PATTERN.test(agentId)) throw new Error('The agent id is invalid.')
  if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 600) {
    throw new Error('The request limit must be an integer from 1 to 600.')
  }
  console.log(JSON.stringify({
    ok: true,
    mode: process.argv.includes(CONFIRM) ? 'confirmed' : 'dry_run',
    action: 'create',
    agentId,
    label,
    requestsPerMinute,
    outputFile,
  }, null, 2))
  if (!process.argv.includes(CONFIRM)) {
    console.log(`Dry run only. Re-run with ${CONFIRM} to create the credential.`)
    process.exit(0)
  }
  const keyId = randomBytes(8).toString('hex')
  const apiKey = `hps_agent_test_${keyId}_${randomBytes(32).toString('base64url')}`
  if (!AGENT_API_KEY_PATTERN.test(apiKey)) throw new Error('Generated credential is invalid.')
  const now = new Date().toISOString()
  await writeFile(outputFile, JSON.stringify({ agentId, keyId, apiKey, createdAt: now }, null, 2), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  await mutateDurableJson(config.storeKey, value => registerAgentCredential(value, {
    apiKey,
    pepper: config.pepper,
    agentId,
    keyId,
    label,
    requestsPerMinute,
    now,
    auditId: auditId(),
  }))
  console.log(JSON.stringify({ ok: true, created: { agentId, keyId, label, outputFile } }, null, 2))
  process.exit(0)
}

const keyId = option('--key-id')
if (!/^[a-z0-9]{8,32}$/i.test(keyId)) throw new Error('The key id is invalid.')
const target = Object.values(current.credentials).find(record => record.keyId === keyId)
if (!target) throw new Error('Agent credential was not found.')
console.log(JSON.stringify({
  ok: true,
  mode: process.argv.includes(CONFIRM) ? 'confirmed' : 'dry_run',
  action: 'revoke',
  credential: { keyId: target.keyId, agentId: target.agentId, status: target.status },
}, null, 2))
if (!process.argv.includes(CONFIRM) || target.status === 'revoked') process.exit(0)
await mutateDurableJson(config.storeKey, value => revokeAgentCredential(value, {
  keyId,
  now: new Date().toISOString(),
  auditId: auditId(),
}))
console.log(JSON.stringify({ ok: true, revoked: { keyId, agentId: target.agentId } }, null, 2))
