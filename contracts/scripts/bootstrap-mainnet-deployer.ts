import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Wallet } from 'ethers'

const envPath = resolve(process.cwd(), '.env')
const source = readFileSync(envPath, 'utf8')
if (/^XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY=\S+/m.test(source)) {
  throw new Error('A dedicated X Layer mainnet deployer is already configured. Refusing to replace it.')
}

const wallet = Wallet.createRandom()
const separator = source.endsWith('\n') ? '' : '\n'
writeFileSync(envPath, source + separator + 'XLAYER_MAINNET_DEPLOYER_PRIVATE_KEY=' + wallet.privateKey + '\n', { encoding: 'utf8', mode: 0o600 })
chmodSync(envPath, 0o600)
console.log(JSON.stringify({ envPath, mainnetDeployer: wallet.address, privateKeyPrinted: false }, null, 2))
