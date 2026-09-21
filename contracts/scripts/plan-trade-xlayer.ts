import { ethers } from 'hardhat'

const CHAIN_ID = 196n

function address(name: string) {
  const value = String(process.env[name] ?? '').trim()
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`${name} must be a non-zero EVM address.`)
  return ethers.getAddress(value)
}

async function main() {
  const network = await ethers.provider.getNetwork()
  if (network.chainId !== CHAIN_ID) throw new Error(`Refusing to inspect chain ${network.chainId}; expected X Layer mainnet 196.`)
  const token = address('HASHPAYSTREAM_XLAYER_TOKENIZED_ASSET_ADDRESS')
  const factory = address('HASHPAYSTREAM_XLAYER_TRADE_FACTORY_ADDRESS')
  const arbiter = address('HASHPAYSTREAM_XLAYER_TRADE_ARBITER_ADDRESS')
  const expectedDecimals = Number(process.env.HASHPAYSTREAM_XLAYER_TOKENIZED_ASSET_DECIMALS ?? '')
  if (!Number.isInteger(expectedDecimals) || expectedDecimals < 2 || expectedDecimals > 18) throw new Error('HASHPAYSTREAM_XLAYER_TOKENIZED_ASSET_DECIMALS must be an integer from 2 to 18.')
  const [tokenCode, factoryCode] = await Promise.all([ethers.provider.getCode(token), ethers.provider.getCode(factory)])
  if (tokenCode === '0x') throw new Error(`Token ${token} has no bytecode on X Layer mainnet.`)
  if (factoryCode === '0x') throw new Error(`TradeEscrowFactory ${factory} has no bytecode on X Layer mainnet.`)
  const tokenContract = new ethers.Contract(token, ['function decimals() view returns (uint8)'], ethers.provider)
  const factoryContract = new ethers.Contract(factory, ['function token() view returns (address)', 'function arbiter() view returns (address)'], ethers.provider)
  const [decimals, factoryToken, factoryArbiter] = await Promise.all([tokenContract.decimals(), factoryContract.token(), factoryContract.arbiter()])
  if (Number(decimals) !== expectedDecimals) throw new Error(`Token decimals mismatch: chain reports ${decimals}, configured ${expectedDecimals}.`)
  if (ethers.getAddress(factoryToken) !== token) throw new Error(`Factory token ${factoryToken} does not match configured token ${token}.`)
  if (ethers.getAddress(factoryArbiter) !== arbiter) throw new Error(`Factory arbiter ${factoryArbiter} does not match configured arbiter ${arbiter}.`)
  console.log(JSON.stringify({
    readOnly: true,
    chainId: network.chainId.toString(),
    token,
    decimals: Number(decimals),
    factory,
    arbiter,
    tokenHasBytecode: true,
    factoryHasBytecode: true,
    verified: true,
    fundingEnabled: false,
    deployment: 'not performed',
  }, null, 2))
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })