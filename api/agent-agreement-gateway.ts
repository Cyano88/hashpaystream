import type { Request } from 'express'
import {
  createHashPayStreamAgreementGateway,
  type AgreementGatewayDependencies,
} from './agreement-gateway.js'
import { agentGatewayEnvironment, verifiedPilotAgentIdentity } from './agent-auth.js'

export function createHashPayStreamAgentAgreementGateway(
  overrides: Partial<AgreementGatewayDependencies> = {},
) {
  const sourceEnv = overrides.env ?? (() => process.env)
  return createHashPayStreamAgreementGateway({
    ...overrides,
    env: () => agentGatewayEnvironment(sourceEnv()),
    identity: (req: Request) => verifiedPilotAgentIdentity(req, sourceEnv()),
  }, {
    checkoutMode: 'agentic',
    agentActivation: true,
  })
}

export default createHashPayStreamAgentAgreementGateway()
