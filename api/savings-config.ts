import type { Request, Response } from 'express'
import { getAddress, isAddress, zeroAddress, type Address } from 'viem'

export const SAVINGS_CHAIN_ID = 5_042_002
export const SAVINGS_USDC_ADDRESS = getAddress('0x3600000000000000000000000000000000000000')

function enabled(value: unknown) {
  return String(value ?? '').trim().toLowerCase() === 'true'
}

function address(value: unknown): Address | undefined {
  const candidate = String(value ?? '').trim()
  if (!isAddress(candidate)) return undefined
  const checksummed = getAddress(candidate)
  return checksummed === zeroAddress ? undefined : checksummed
}

export type SavingsConfigDependencies = {
  env: () => NodeJS.ProcessEnv
}

const defaults: SavingsConfigDependencies = {
  env: () => process.env,
}

export function createSavingsConfigHandler(overrides: Partial<SavingsConfigDependencies> = {}) {
  const dependencies = { ...defaults, ...overrides }
  return function savingsConfig(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    }

    const env = dependencies.env()
    const vaultAddress = address(
      env.HASHPAYSTREAM_SAVINGS_VAULT_ADDRESS
      ?? env.VITE_HASHPAYSTREAM_SAVINGS_VAULT_ADDRESS,
    )
    const depositsEnabled = Boolean(
      vaultAddress
      && enabled(env.HASHPAYSTREAM_SAVINGS_DEPOSITS_ENABLED),
    )

    return res.status(200).json({
      ok: true,
      savings: {
        chainId: SAVINGS_CHAIN_ID,
        network: 'Arc Testnet',
        assetAddress: SAVINGS_USDC_ADDRESS,
        vaultAddress: vaultAddress ?? null,
        depositsEnabled,
        status: depositsEnabled ? 'active' : vaultAddress ? 'paused' : 'in_review',
      },
    })
  }
}

export default createSavingsConfigHandler()
