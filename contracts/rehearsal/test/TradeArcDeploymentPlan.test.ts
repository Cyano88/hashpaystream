import {expect} from 'chai'
import {artifacts,config,ethers,network} from 'hardhat'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {buildArcTradeDeploymentPlan,ARC_TRADE_USDC} from '../../scripts/arc-trade-deployment-plan'

describe('Unsigned Arc Trade deployment plan',()=>{
  async function input(){
    const artifact=await artifacts.readArtifact('TradeEscrowFactory')
    const build=await artifacts.getBuildInfo(artifact.sourceName+':'+artifact.contractName)
    return {artifact,build,source:(name:string)=>readFileSync(resolve(config.paths.root,name.startsWith('@')?'node_modules/'+name:name),'utf8')}
  }
  async function rejects(p:Promise<unknown>,message:string){
    let error:any;try{await p}catch(e){error=e}expect(error?.message).to.contain(message)
  }
  it('reports missing authority without creating a transaction or enabling release',async()=>{
    const plan=await buildArcTradeDeploymentPlan(await input())
    expect(plan.unsignedCreation).to.equal(null);expect(plan.productionReady).to.equal(false)
    expect(plan.sourceSha256).to.have.property('src/TradeEscrow.sol')
    expect(plan.fundingEnabled).to.equal(false)
  })
  it('binds the exact constructor and creation code without a signer',async()=>{
    const i=await input(),arbiter='0x1111111111111111111111111111111111111111'
    const plan=await buildArcTradeDeploymentPlan({...i,arbiter})
    const expected=i.artifact.bytecode+ethers.AbiCoder.defaultAbiCoder().encode(['address','address'],[ARC_TRADE_USDC,arbiter]).slice(2)
    expect(plan.unsignedCreation!.data).to.equal(expected)
    expect(plan.unsignedCreation!.initCodeHash).to.equal(ethers.keccak256(expected))
    expect(plan.safeVerified).to.equal(false)
    expect(plan.unsignedCreation!.chainId).to.equal(5042)
    expect(plan.immutableReferences).not.to.deep.equal({})
  })
  it('rejects source drift, altered artifacts, different settings and invalid authority',async()=>{
    const i=await input()
    await rejects(buildArcTradeDeploymentPlan({...i,source:()=>''}),'differs from the working tree')
    await rejects(buildArcTradeDeploymentPlan({...i,artifact:{...i.artifact,bytecode:'0x6000'}}),'differs from compiler output')
    await rejects(buildArcTradeDeploymentPlan({...i,build:{...i.build,solcVersion:'0.8.25'}}),'compiler settings')
    for(const arbiter of ['invalid',ethers.ZeroAddress,ARC_TRADE_USDC])await rejects(buildArcTradeDeploymentPlan({...i,arbiter}),'Arbiter must')
  })
  it('deploys the prepared bytes only on the isolated chain and reads exact constructor values',async()=>{
    expect(network.name).to.equal('hardhat');expect((await ethers.provider.getNetwork()).chainId).to.equal(5042n)
    const snapshot=await network.provider.send('evm_snapshot')
    try{
      // Code presence is sufficient for this constructor-only check. This stub
      // is not USDC behavior or evidence that the candidate Safe is legitimate.
      await network.provider.send('hardhat_setCode',[ARC_TRADE_USDC,'0x6000'])
      const [sender]=await ethers.getSigners(),arbiter='0x1111111111111111111111111111111111111111'
      const plan=await buildArcTradeDeploymentPlan({...await input(),arbiter})
      const receipt=await(await sender.sendTransaction(plan.unsignedCreation!)).wait()
      const factory=await ethers.getContractAt('TradeEscrowFactory',receipt!.contractAddress!)
      expect(await factory.token()).to.equal(ARC_TRADE_USDC);expect(await factory.arbiter()).to.equal(arbiter)
      expect(ethers.keccak256(await ethers.provider.getCode(receipt!.contractAddress!))).not.to.equal(plan.runtimeTemplateHash)
    }finally{await network.provider.send('evm_revert',[snapshot])}
  })
})
