import { arcWalletEnvironment } from './arc-wallet-environment.js'
const fail = (message: string): never => { throw Object.assign(new Error(message), { status: 503 }) }
export function agreementCredentials(env: NodeJS.ProcessEnv, upfront = false) {
  const profile = arcWalletEnvironment(env)
  if (profile.live) {
    if (upfront) fail('Legacy upfront funding is sandbox-only.')
    const draft = env.HASHPAYSTREAM_ARC_MAINNET_API_KEY?.trim() || ''
    const funding = env.HASHPAYSTREAM_ARC_MAINNET_FUNDING_API_KEY?.trim() || ''
    if (!/^hpl_app_[a-f0-9]{64}$/.test(draft) || !/^hpl_app_[a-f0-9]{64}$/.test(funding) || draft === funding) fail('Dedicated mainnet Agreement credentials are required.')
    return { draft, funding, recipient: funding }
  }
  const key = (upfront ? env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY : env.HASHPAYSTREAM_ARC_API_KEY)?.trim() || ''
  if (!key.startsWith('hpl_test_')) fail('Sandbox Agreement credentials are required.')
  return { draft: key, funding: key, recipient: key }
}
