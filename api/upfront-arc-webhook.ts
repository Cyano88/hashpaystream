import {
  createHashPayStreamArcWebhookHandler,
  type ArcWebhookDependencies,
} from './arc-agreement-webhook.js'

function upfrontWebhookEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    HASHPAYSTREAM_ARC_PROJECT_ID: env.HASHPAYSTREAM_UPFRONT_ARC_PROJECT_ID,
    HASHPAYSTREAM_ARC_WEBHOOK_SECRET: env.HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_SECRET,
    HASHPAYSTREAM_ARC_WEBHOOK_STORE_KEY: env.HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY
      ?? 'hashpaystream:upfront-arc-webhooks:v1',
  }
}

export function createHashPayStreamUpfrontArcWebhookHandler(
  overrides: Partial<ArcWebhookDependencies> = {},
) {
  const sourceEnv = overrides.env ?? (() => process.env)
  return createHashPayStreamArcWebhookHandler({
    ...overrides,
    env: () => upfrontWebhookEnvironment(sourceEnv()),
  })
}

export default createHashPayStreamUpfrontArcWebhookHandler()
