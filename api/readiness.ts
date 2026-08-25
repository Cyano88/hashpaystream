import type { Request, Response } from 'express'
import { getAddress, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { hasRenderDurableStore, readDurableJson } from './durable-store.js'
import { agentCredentialRegistryConfig } from './agent-credential-registry.js'

const DEFAULT_OWNERSHIP_STORE_KEYS = [
  'hashpaystream:human-agreement-owners:v1',
  'hashpaystream:upfront-agreement-owners:v1',
  'hashpaystream:agent-agreement-owners:v1',
] as const

function clean(value: unknown, maximum: number) {
  return String(value ?? '').trim().slice(0, maximum)
}

function validHttpsOrigin(value: unknown) {
  try {
    const url = new URL(clean(value, 240))
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
  }
}

function validHttpsUrl(value: unknown) {
  try {
    const url = new URL(clean(value, 240))
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
  } catch {
    return false
  }
}

function validPrivateKey(value: unknown) {
  const text = clean(value, 66)
  return /^0x[a-fA-F0-9]{64}$/.test(text) ? text as Hex : undefined
}

function validFunderAllowlist(env: NodeJS.ProcessEnv) {
  return [env.HASHPAYSTREAM_UPFRONT_FUNDER_EMAILS, env.HASHPAYSTREAM_UPFRONT_FUNDER_WALLETS]
    .flatMap(value => String(value ?? '').split(','))
    .map(value => value.trim().toLowerCase())
    .some(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^0x[a-f0-9]{40}$/.test(value))
}

function missingCircleWalletEnvironmentNames(env: NodeJS.ProcessEnv) {
  return ['CIRCLE_TEST_API_KEY', 'VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET']
    .filter(name => !clean(env[name], 500))
}

function circleWalletConfigurationReady(env: NodeJS.ProcessEnv) {
  return clean(env.CIRCLE_TEST_API_KEY, 500).length >= 16
    && clean(env.VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET, 180).length >= 16
}

function missingUpfrontEnvironmentNames(env: NodeJS.ProcessEnv) {
  if (clean(env.HASHPAYSTREAM_UPFRONT_ENABLED, 20).toLowerCase() !== 'true') return []
  const required = [
    'PRIVY_APP_SECRET',
    'HASHPAYSTREAM_APP_OWNERSHIP_SECRET',
    'HASHPAYSTREAM_UPFRONT_ARC_API_KEY',
    'HASHPAYSTREAM_UPFRONT_ARC_PROJECT_ID',
    'HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_SECRET',
    'HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY',
    'HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS',
    'VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS',
    'HASHPAYSTREAM_ZEROSCOUT_BASE_URL',
    'HASHPAYSTREAM_ZEROSCOUT_API_KEY',
    'HASHPAYSTREAM_POLYDESK_BASE_URL',
    'HASHPAYSTREAM_POLYDESK_SERVICE_TOKEN',
    'HASHPAYSTREAM_POLYDESK_SIGNING_SECRET',
    'HASHPAYSTREAM_POLYDESK_EIP712_SIGNER',
    'HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS',
    'VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS',
    'HASHPAYSTREAM_UPFRONT_CHAIN_ID',
    'VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID',
    'HASHPAYSTREAM_XLAYER_RPC_URL',
    'HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY',
    'HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER',
    'HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY',
    'HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER',
    'VITE_HASHPAYSTREAM_UPFRONT_ENABLED',
    'VITE_HASHPAYSTREAM_UPFRONT_TREASURY_ENABLED',
    'HASHPAYSTREAM_DIRECT_ARC_ENABLED',
  ].filter(name => !clean(env[name], 300))
  if (!clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)) required.push('PRIVY_APP_ID_OR_VITE_PRIVY_APP_ID')
  if (!validFunderAllowlist(env)) required.push('HASHPAYSTREAM_UPFRONT_FUNDER_EMAILS_OR_WALLETS')
  return required.sort()
}

function upfrontConfigurationReady(env: NodeJS.ProcessEnv) {
  if (clean(env.HASHPAYSTREAM_UPFRONT_ENABLED, 20).toLowerCase() !== 'true') return true
  const address = (value: unknown) => /^0x[a-fA-F0-9]{40}$/.test(clean(value, 42)) && !/^0x0{40}$/i.test(clean(value, 42))
  const serverRouter = clean(env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 42)
  const browserRouter = clean(env.VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 42)
  const serverEscrow = clean(env.HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 42)
  const browserEscrow = clean(env.VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 42)
  const serverChainId = Number(env.HASHPAYSTREAM_UPFRONT_CHAIN_ID)
  const browserChainId = Number(env.VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID)
  const protectionKey = validPrivateKey(env.HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY)
  const repaymentKey = validPrivateKey(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY)
  const protectionSigner = clean(env.HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER, 42)
  const repaymentSigner = clean(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER, 42)
  let signerKeysMatch = false
  try {
    signerKeysMatch = Boolean(
      protectionKey
      && repaymentKey
      && address(protectionSigner)
      && address(repaymentSigner)
      && privateKeyToAccount(protectionKey).address === getAddress(protectionSigner)
      && privateKeyToAccount(repaymentKey).address === getAddress(repaymentSigner)
    )
  } catch {
    signerKeysMatch = false
  }
  return Boolean(
    clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180)
    && clean(env.PRIVY_APP_SECRET, 300).length >= 16
    && clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300).length >= 32
    && clean(env.HASHPAYSTREAM_UPFRONT_STORE_KEY ?? 'hashpaystream:upfront-assessments:v1', 160)
    && clean(env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY, 200).startsWith('hpl_test_')
    && clean(env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY, 200).length >= 32
    && clean(env.HASHPAYSTREAM_UPFRONT_ARC_PROJECT_ID, 180)
    && clean(env.HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_SECRET, 300).length >= 32
    && clean(env.HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_STORE_KEY, 160)
    && address(serverRouter)
    && address(browserRouter)
    && getAddress(serverRouter) === getAddress(browserRouter)
    && validHttpsOrigin(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com')
    && validHttpsOrigin(env.HASHPAYSTREAM_ZEROSCOUT_BASE_URL)
    && clean(env.HASHPAYSTREAM_ZEROSCOUT_API_KEY, 300).length >= 16
    && validHttpsOrigin(env.HASHPAYSTREAM_POLYDESK_BASE_URL)
    && clean(env.HASHPAYSTREAM_POLYDESK_SERVICE_TOKEN, 300).length >= 32
    && clean(env.HASHPAYSTREAM_POLYDESK_SIGNING_SECRET, 300).length >= 32
    && address(env.HASHPAYSTREAM_POLYDESK_EIP712_SIGNER)
    && address(serverEscrow)
    && address(browserEscrow)
    && getAddress(serverEscrow) === getAddress(browserEscrow)
    && [1952, 196].includes(serverChainId)
    && serverChainId === browserChainId
    && validHttpsUrl(env.HASHPAYSTREAM_XLAYER_RPC_URL)
    && signerKeysMatch
    && validFunderAllowlist(env)
    && clean(env.VITE_HASHPAYSTREAM_UPFRONT_ENABLED, 20).toLowerCase() === 'true'
    && clean(env.VITE_HASHPAYSTREAM_UPFRONT_TREASURY_ENABLED, 20).toLowerCase() === 'true'
    && clean(env.HASHPAYSTREAM_DIRECT_ARC_ENABLED, 20).toLowerCase() === 'true'
  )
}

function upfrontConfigurationIssueCodes(env: NodeJS.ProcessEnv) {
  if (clean(env.HASHPAYSTREAM_UPFRONT_ENABLED, 20).toLowerCase() !== 'true') return []
  const issues: string[] = []
  const address = (value: unknown) => /^0x[a-fA-F0-9]{40}$/.test(clean(value, 42)) && !/^0x0{40}$/i.test(clean(value, 42))
  const serverRouter = clean(env.HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 42)
  const browserRouter = clean(env.VITE_HASHPAYSTREAM_UPFRONT_ARC_ROUTER_ADDRESS, 42)
  const serverEscrow = clean(env.HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 42)
  const browserEscrow = clean(env.VITE_HASHPAYSTREAM_UPFRONT_ESCROW_CONTRACT_ADDRESS, 42)
  const serverChainId = Number(env.HASHPAYSTREAM_UPFRONT_CHAIN_ID)
  const browserChainId = Number(env.VITE_HASHPAYSTREAM_UPFRONT_CHAIN_ID)
  if (!clean(env.PRIVY_APP_ID ?? env.VITE_PRIVY_APP_ID, 180) || clean(env.PRIVY_APP_SECRET, 300).length < 16) issues.push('PRIVY_CONFIGURATION_INVALID')
  if (clean(env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET, 300).length < 32) issues.push('OWNERSHIP_SECRET_INVALID')
  if (!clean(env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY, 200).startsWith('hpl_test_') || clean(env.HASHPAYSTREAM_UPFRONT_ARC_API_KEY, 200).length < 32) issues.push('ARC_API_KEY_INVALID')
  if (clean(env.HASHPAYSTREAM_UPFRONT_ARC_WEBHOOK_SECRET, 300).length < 32) issues.push('ARC_WEBHOOK_CONFIGURATION_INVALID')
  if (!address(serverRouter) || !address(browserRouter)) issues.push('ARC_ROUTER_INVALID')
  else if (getAddress(serverRouter) !== getAddress(browserRouter)) issues.push('ARC_ROUTER_MISMATCH')
  if (!validHttpsOrigin(env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com')) issues.push('HASH_PAYLINK_URL_INVALID')
  if (!validHttpsOrigin(env.HASHPAYSTREAM_ZEROSCOUT_BASE_URL) || clean(env.HASHPAYSTREAM_ZEROSCOUT_API_KEY, 300).length < 16) issues.push('ZEROSCOUT_CONFIGURATION_INVALID')
  if (!validHttpsOrigin(env.HASHPAYSTREAM_POLYDESK_BASE_URL) || clean(env.HASHPAYSTREAM_POLYDESK_SERVICE_TOKEN, 300).length < 32 || clean(env.HASHPAYSTREAM_POLYDESK_SIGNING_SECRET, 300).length < 32 || !address(env.HASHPAYSTREAM_POLYDESK_EIP712_SIGNER)) issues.push('POLYDESK_CONFIGURATION_INVALID')
  if (!address(serverEscrow) || !address(browserEscrow)) issues.push('ESCROW_ADDRESS_INVALID')
  else if (getAddress(serverEscrow) !== getAddress(browserEscrow)) issues.push('ESCROW_ADDRESS_MISMATCH')
  if (![1952, 196].includes(serverChainId) || serverChainId !== browserChainId) issues.push('XLAYER_CHAIN_CONFIGURATION_INVALID')
  if (!validHttpsUrl(env.HASHPAYSTREAM_XLAYER_RPC_URL)) issues.push('XLAYER_RPC_URL_INVALID')
  const protectionKey = validPrivateKey(env.HASHPAYSTREAM_UPFRONT_PROTECTION_PRIVATE_KEY)
  const repaymentKey = validPrivateKey(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_PRIVATE_KEY)
  try {
    if (!protectionKey || !repaymentKey || !address(env.HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER) || !address(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER) || privateKeyToAccount(protectionKey).address !== getAddress(clean(env.HASHPAYSTREAM_UPFRONT_PROTECTION_SIGNER, 42)) || privateKeyToAccount(repaymentKey).address !== getAddress(clean(env.HASHPAYSTREAM_UPFRONT_REPAYMENT_SIGNER, 42))) issues.push('SIGNER_CONFIGURATION_INVALID')
  } catch {
    issues.push('SIGNER_CONFIGURATION_INVALID')
  }
  if (!validFunderAllowlist(env)) issues.push('FUNDER_ALLOWLIST_INVALID')
  if (clean(env.VITE_HASHPAYSTREAM_UPFRONT_ENABLED, 20).toLowerCase() !== 'true' || clean(env.VITE_HASHPAYSTREAM_UPFRONT_TREASURY_ENABLED, 20).toLowerCase() !== 'true') issues.push('UPFRONT_BROWSER_FLAGS_INVALID')
  if (clean(env.HASHPAYSTREAM_DIRECT_ARC_ENABLED, 20).toLowerCase() !== 'true') issues.push('DIRECT_ARC_CONFIGURATION_INVALID')
  return [...new Set(issues)].sort()
}

export type ReadinessDependencies = {
  isDraining: () => boolean
  hasStore: () => boolean
  read: <T>(key: string) => Promise<T | undefined>
  env: () => NodeJS.ProcessEnv
  logError: (event: {
    component: 'hashpaystream-readiness'
    event: 'dependency_unavailable'
    status: 503
    missingEnvironment?: string[]
    configurationIssues?: string[]
  }) => void
}

const defaults: ReadinessDependencies = {
  isDraining: () => false,
  hasStore: hasRenderDurableStore,
  read: readDurableJson,
  env: () => process.env,
  logError: event => console.error(JSON.stringify(event)),
}

export function createHashPayStreamReadinessHandler(
  overrides: Partial<ReadinessDependencies> = {},
) {
  const dependencies = { ...defaults, ...overrides }
  return async function hashPayStreamReadiness(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ ok: false, service: 'hashpaystream', status: 'method_not_allowed' })
    }
    if (dependencies.isDraining()) {
      return res.status(503).json({ ok: false, service: 'hashpaystream', status: 'unavailable' })
    }
    let env: NodeJS.ProcessEnv = {}
    try {
      if (!dependencies.hasStore()) throw new Error('Durable store is unavailable.')
      env = dependencies.env()
      if (!circleWalletConfigurationReady(env)) throw new Error('Circle wallet configuration is incomplete.')
      if (!upfrontConfigurationReady(env)) throw new Error('Upfront configuration is incomplete.')
      const ownershipStoreKeys = [
        String(env.HASHPAYSTREAM_HUMAN_AGREEMENT_STORE_KEY ?? DEFAULT_OWNERSHIP_STORE_KEYS[0]).trim(),
        String(env.HASHPAYSTREAM_UPFRONT_AGREEMENT_STORE_KEY ?? DEFAULT_OWNERSHIP_STORE_KEYS[1]).trim(),
        String(env.HASHPAYSTREAM_AGENT_AGREEMENT_STORE_KEY ?? DEFAULT_OWNERSHIP_STORE_KEYS[2]).trim(),
      ]
      if (new Set(ownershipStoreKeys).size !== 3 || ownershipStoreKeys.some(key => !key || key.length > 160)) {
        throw new Error('Ownership store configuration is invalid.')
      }
      await Promise.all(ownershipStoreKeys.map(key => dependencies.read(key)))
      const registryConfig = agentCredentialRegistryConfig(env)
      if (registryConfig) await dependencies.read(registryConfig.storeKey)
      return res.status(200).json({ ok: true, service: 'hashpaystream', status: 'ready' })
    } catch {
      try {
        const missingEnvironment = [...new Set([...missingCircleWalletEnvironmentNames(env), ...missingUpfrontEnvironmentNames(env)])].sort()
        const configurationIssues = [...new Set([
          ...(!circleWalletConfigurationReady(env) ? ['CIRCLE_WALLET_CONFIGURATION_INVALID'] : []),
          ...upfrontConfigurationIssueCodes(env),
        ])].sort()
        dependencies.logError({
          component: 'hashpaystream-readiness',
          event: 'dependency_unavailable',
          status: 503,
          ...(missingEnvironment.length > 0 ? { missingEnvironment } : {}),
          ...(configurationIssues.length > 0 ? { configurationIssues } : {}),
        })
      } catch {
        // Logging must never change the readiness response.
      }
      return res.status(503).json({ ok: false, service: 'hashpaystream', status: 'unavailable' })
    }
  }
}

export default createHashPayStreamReadinessHandler()
