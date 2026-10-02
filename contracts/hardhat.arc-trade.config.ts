import type { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
// Local only. This configuration has no remote networks or deployer credentials.
const config: HardhatUserConfig = {
  solidity:{version:'0.8.24',settings:{optimizer:{enabled:true,runs:200},viaIR:true}},
  networks:{hardhat:{chainId:5042}},
  paths:{sources:'./src',tests:'./test',artifacts:'./artifacts-arc-trade',cache:'./cache-arc-trade'},
}
export default config
