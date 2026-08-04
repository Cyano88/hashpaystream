import { agentGatewayEnvironment } from './agent-auth.js'
import {
  createHashPayStreamArcWebhookHandler,
  type ArcWebhookDependencies,
} from './arc-agreement-webhook.js'

export function createHashPayStreamAgentArcWebhookHandler(
  overrides: Partial<ArcWebhookDependencies> = {},
) {
  const sourceEnv = overrides.env ?? (() => process.env)
  return createHashPayStreamArcWebhookHandler({
    ...overrides,
    env: () => agentGatewayEnvironment(sourceEnv()),
  })
}

export default createHashPayStreamAgentArcWebhookHandler()
