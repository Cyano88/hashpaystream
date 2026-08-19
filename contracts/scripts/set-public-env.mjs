import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAddress, isAddress, ZeroAddress } from 'ethers'

const allowed = new Set(['ARC_REPAYMENT_ROUTER_ADDRESS', 'XLAYER_TEST_USDC_ADDRESS', 'POLYDESK_UPFRONT_ESCROW_CONTRACT_ADDRESS'])
const key = String(process.argv[2] ?? '').trim()
const rawValue = String(process.argv[3] ?? '').trim()
if (!allowed.has(key)) throw new Error('This helper only records approved public deployment addresses.')
if (!isAddress(rawValue) || getAddress(rawValue) === ZeroAddress) throw new Error('Value must be a non-zero EVM address.')
const value = getAddress(rawValue)
const envPath = resolve(process.cwd(), '.env')
const lines = readFileSync(envPath, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith(key + '='))
lines.push(key + '=' + value, '')
writeFileSync(envPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 })
console.log(key + ' recorded.')
