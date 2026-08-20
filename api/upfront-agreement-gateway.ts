import {
  createHashPayStreamAgreementGateway,
  type AgreementGatewayDependencies,
} from './agreement-gateway.js'

export function createHashPayStreamUpfrontAgreementGateway(
  overrides: Partial<AgreementGatewayDependencies> = {},
) {
  return createHashPayStreamAgreementGateway(overrides, {
    checkoutMode: 'human',
    apiKeyEnvironmentVariable: 'HASHPAYSTREAM_UPFRONT_ARC_API_KEY',
    featureFlagEnvironmentVariable: 'HASHPAYSTREAM_UPFRONT_ENABLED',
  })
}

export default createHashPayStreamUpfrontAgreementGateway()
