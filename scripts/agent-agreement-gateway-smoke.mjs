import assert from 'node:assert/strict'
import { agentGatewayEnvironment } from '../api/agent-auth.ts'
import { createHashPayStreamAgentAgreementGateway } from '../api/agent-agreement-gateway.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function call(handler, credential, method = 'GET', input = {}) {
  const response = responseRecorder()
  await handler({
    method,
    query: input.query ?? {},
    body: input.body,
    headers: {
      ...(credential ? { authorization: `Bearer ${credential}` } : {}),
      ...(input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : {}),
    },
  }, response)
  return response
}

const agentKeyA = `hps_agent_test_${'a'.repeat(40)}`
const agentKeyB = `hps_agent_test_${'b'.repeat(40)}`
const upstreamKeyA = `hpl_test_${'c'.repeat(32)}`
const upstreamKeyB = `hpl_test_${'d'.repeat(32)}`
const baseEnv = {
  HASHPAYSTREAM_APP_OWNERSHIP_SECRET: 'agent-ownership-secret-at-least-32-characters',
  HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY: 'test:hashpaystream:owners',
  HASHPAYSTREAM_HASH_PAYLINK_BASE_URL: 'https://app.hashpaylink.com',
}
const envA = {
  ...baseEnv,
  HASHPAYSTREAM_AGENT_ID: 'agent_pilot_aa',
  HASHPAYSTREAM_AGENT_API_KEY: agentKeyA,
  HASHPAYSTREAM_AGENT_ARC_API_KEY: upstreamKeyA,
  HASHPAYSTREAM_AGENT_ARC_PROJECT_ID: 'dev_agentpilot1234',
  HASHPAYSTREAM_AGENT_ARC_WEBHOOK_SECRET: `whsec_${'e'.repeat(32)}`,
}
const envB = {
  ...baseEnv,
  HASHPAYSTREAM_AGENT_ID: 'agent_pilot_bb',
  HASHPAYSTREAM_AGENT_API_KEY: agentKeyB,
  HASHPAYSTREAM_AGENT_ARC_API_KEY: upstreamKeyB,
  HASHPAYSTREAM_AGENT_ARC_PROJECT_ID: 'dev_agentpilot5678',
  HASHPAYSTREAM_AGENT_ARC_WEBHOOK_SECRET: `whsec_${'f'.repeat(32)}`,
}

const mapped = agentGatewayEnvironment(envA)
assert.equal(mapped.HASHPAYSTREAM_ARC_API_KEY, upstreamKeyA)
assert.equal(mapped.HASHPAYSTREAM_ARC_PROJECT_ID, envA.HASHPAYSTREAM_AGENT_ARC_PROJECT_ID)
assert.equal(mapped.HASHPAYSTREAM_ARC_WEBHOOK_SECRET, envA.HASHPAYSTREAM_AGENT_ARC_WEBHOOK_SECRET)
assert.equal(mapped.HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY, 'hashpaystream:agent-arc-webhooks:v1')

const agreementId = 'agr_agentdraftpilot1234'
const agreement = {
  id: agreementId,
  checkoutMode: 'agentic',
  title: 'Agent research delivery',
  status: 'draft',
}
let store
const upstreamCalls = []
const shared = {
  hasStore: () => true,
  read: async () => store,
  readEvents: async () => undefined,
  mutate: async (_key, update) => {
    store = update(store)
    return store
  },
  upstream: async input => {
    upstreamCalls.push(input)
    if (input.path === '/api/v2/agreements/agent') {
      return {
        status: ['record', 'lifecycle-record'].includes(input.body.action) ? 202 : 200,
        body: {
          ok: true,
          attempt: { id: 'aat_agentdraftpilot1234', checkoutMode: 'agentic', status: 'awaiting_approval' },
          ...(input.body.action === 'prepare-call' ? {
            call: { chainId: 5_042_002, to: '0x3600000000000000000000000000000000000000', data: '0x1234', value: '0' },
          } : {}),
          ...(input.body.action === 'lifecycle-prepare-call' ? {
            call: { chainId: 5_042_002, to: '0x4400000000000000000000000000000000000000', data: '0xabcdef', value: '0' },
          } : {}),
        },
      }
    }
    if (input.method === 'POST') {
      return {
        status: 201,
        body: {
          ok: true,
          agreement,
          payerAccessToken: `agrp_${'g'.repeat(48)}`,
          payerReviewPath: `/agreements/${agreementId}#access=private`,
          nextAction: 'Human payer instructions must not reach an agent.',
        },
      }
    }
    if (input.path.includes('?ids=')) return { status: 200, body: { ok: true, agreements: [agreement] } }
    return { status: 200, body: { ok: true, agreement } }
  },
  now: () => new Date('2026-08-04T12:00:00.000Z'),
  logError: () => undefined,
}

const handlerA = createHashPayStreamAgentAgreementGateway({ ...shared, env: () => envA })
const handlerB = createHashPayStreamAgentAgreementGateway({ ...shared, env: () => envB })

const missingCredential = await call(handlerA, '')
assert.equal(missingCredential.statusCode, 401)

const wrongCredential = await call(handlerA, agentKeyB)
assert.equal(wrongCredential.statusCode, 401)

const created = await call(handlerA, agentKeyA, 'POST', {
  idempotencyKey: 'agent-draft-0001',
  body: {
    template: 'fixed_unlock',
    title: agreement.title,
    amount: '0.1',
    recipient: '0x1111111111111111111111111111111111111111',
  },
})
assert.equal(created.statusCode, 201)
assert.equal(created.body.agreement.checkoutMode, 'agentic')
assert.equal(created.body.agentActivationPilot, true)
assert.equal('payerAccessToken' in created.body, false)
assert.equal('payerReviewPath' in created.body, false)
assert.equal('nextAction' in created.body, false)

const ownerList = await call(handlerA, agentKeyA)
assert.deepEqual(ownerList.body.agreements.map(item => item.id), [agreementId])
assert.equal(ownerList.body.agentActivationPilot, true)

const foreignList = await call(handlerB, agentKeyB)
assert.deepEqual(foreignList.body.agreements, [])
assert.equal(foreignList.body.agentActivationPilot, true)

const callsBeforeForeignRead = upstreamCalls.length
const foreignRead = await call(handlerB, agentKeyB, 'GET', { query: { id: agreementId } })
assert.equal(foreignRead.statusCode, 404)
assert.equal(upstreamCalls.length, callsBeforeForeignRead)

const callsBeforeAction = upstreamCalls.length
const unsupportedLifecycleAction = await call(handlerA, agentKeyA, 'POST', {
  body: { action: 'request_release', agreementId },
})
assert.equal(unsupportedLifecycleAction.statusCode, 409)
assert.equal(upstreamCalls.length, callsBeforeAction)

const preparedActivation = await call(handlerA, agentKeyA, 'POST', {
  body: {
    action: 'prepare',
    agreementId,
    payerReference: `apr_${'f'.repeat(40)}`,
    payerAddress: '0x3333333333333333333333333333333333333333',
  },
})
assert.equal(preparedActivation.statusCode, 200)
assert.equal(preparedActivation.body.agentActivationPilot, true)
const activationInput = upstreamCalls.at(-1)
assert.equal(activationInput.path, '/api/v2/agreements/agent')
assert.match(activationInput.body.payerReference, /^apr_[a-f0-9]{40}$/)
assert.notEqual(activationInput.body.payerReference, `apr_${'f'.repeat(40)}`)

const preparedCall = await call(handlerA, agentKeyA, 'POST', {
  body: {
    action: 'prepare-call',
    agreementId,
    payerAddress: '0x3333333333333333333333333333333333333333',
    stage: 'approval',
  },
})
assert.equal(preparedCall.statusCode, 200)
assert.equal(preparedCall.body.call.chainId, 5_042_002)

const deliveryDecision = await call(handlerA, agentKeyA, 'POST', {
  body: {
    action: 'delivery-decision',
    agreementId,
    payerAddress: '0x3333333333333333333333333333333333333333',
    deliveryId: `opa_${'1'.repeat(24)}`,
    decision: 'accept',
  },
})
assert.equal(deliveryDecision.statusCode, 200)
const deliveryInput = upstreamCalls.at(-1)
assert.match(deliveryInput.body.payerReference, /^apr_[a-f0-9]{40}$/)
assert.equal(deliveryInput.body.deliveryId, `opa_${'1'.repeat(24)}`)
assert.equal(deliveryInput.body.decision, 'accept')

const lifecycleCall = await call(handlerA, agentKeyA, 'POST', {
  body: {
    action: 'lifecycle-prepare-call',
    agreementId,
    payerAddress: '0x3333333333333333333333333333333333333333',
    lifecycleAction: 'cancel',
  },
})
assert.equal(lifecycleCall.statusCode, 200)
assert.equal(lifecycleCall.body.call.to, '0x4400000000000000000000000000000000000000')
const lifecyclePrepareInput = upstreamCalls.at(-1)
assert.match(lifecyclePrepareInput.body.payerReference, /^apr_[a-f0-9]{40}$/)
assert.equal(lifecyclePrepareInput.body.lifecycleAction, 'cancel')

const lifecycleRecord = await call(handlerA, agentKeyA, 'POST', {
  body: {
    action: 'lifecycle-record',
    agreementId,
    payerAddress: '0x3333333333333333333333333333333333333333',
    transactionHash: `0x${'7'.repeat(64)}`,
  },
})
assert.equal(lifecycleRecord.statusCode, 202)
assert.equal(upstreamCalls.at(-1).body.transactionHash, `0x${'7'.repeat(64)}`)

const wrongModeHandler = createHashPayStreamAgentAgreementGateway({
  ...shared,
  env: () => envA,
  read: async () => undefined,
  upstream: async () => ({
    status: 201,
    body: { ok: true, agreement: { ...agreement, checkoutMode: 'human', id: 'agr_wrongmodepilot1234' } },
  }),
})
const wrongMode = await call(wrongModeHandler, agentKeyA, 'POST', {
  idempotencyKey: 'agent-draft-wrong-mode',
  body: { template: 'fixed_unlock', title: 'Wrong mode' },
})
assert.equal(wrongMode.statusCode, 502)

console.log('HashPayStream agent agreement gateway smoke checks passed.')
