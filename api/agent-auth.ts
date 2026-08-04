import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

const AGENT_ID = /^agent_[a-z0-9][a-z0-9_-]{7,63}$/i
const AGENT_API_KEY = /^hps_agent_test_[A-Za-z0-9_-]{32,128}$/

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

function bearer(req: Pick<Request, 'headers'>) {
  return String(req.headers.authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export async function verifiedPilotAgentIdentity(req: Request, env: NodeJS.ProcessEnv = process.env) {
  const agentId = String(env.HASHPAYSTREAM_AGENT_ID ?? '').trim()
  const configuredKey = String(env.HASHPAYSTREAM_AGENT_API_KEY ?? '').trim()
  if (!AGENT_ID.test(agentId) || !AGENT_API_KEY.test(configuredKey)) {
    throw httpError('HashPayStream agent access is unavailable.', 503)
  }
  const presentedKey = bearer(req)
  if (!AGENT_API_KEY.test(presentedKey) || !safeEqual(presentedKey, configuredKey)) {
    throw httpError('A valid HashPayStream agent credential is required.', 401)
  }
  return `agent:${agentId.toLowerCase()}`
}

export function agentGatewayEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    HASHPAYSTREAM_ARC_API_KEY: env.HASHPAYSTREAM_AGENT_ARC_API_KEY,
    HASHPAYSTREAM_ARC_PROJECT_ID: env.HASHPAYSTREAM_AGENT_ARC_PROJECT_ID,
    HASHPAYSTREAM_ARC_WEBHOOK_SECRET: env.HASHPAYSTREAM_AGENT_ARC_WEBHOOK_SECRET,
    HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY: env.HASHPAYSTREAM_AGENT_ARC_WEBHOOK_STORE_KEY
      ?? 'hashpaystream:agent-arc-webhooks:v1',
  }
}
