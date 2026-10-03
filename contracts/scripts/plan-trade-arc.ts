import {artifacts,config} from 'hardhat'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {buildArcTradeDeploymentPlan} from './arc-trade-deployment-plan'

async function main(){
  const artifact=await artifacts.readArtifact('TradeEscrowFactory')
  const build=await artifacts.getBuildInfo(artifact.sourceName+':'+artifact.contractName)
  const report=await buildArcTradeDeploymentPlan({artifact,build,
    arbiter:process.env.HASHPAYSTREAM_ARC_TRADE_ARBITER_ADDRESS?.trim()||undefined,
    source:name=>readFileSync(resolve(config.paths.root,name.startsWith('@')?'node_modules/'+name:name),'utf8'),
  })
  console.log(JSON.stringify(report,null,2))
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Arc candidate preparation failed.');process.exitCode=1})
