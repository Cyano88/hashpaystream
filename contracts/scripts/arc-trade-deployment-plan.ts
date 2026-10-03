import {createHash} from 'node:crypto'
import {ContractFactory, getAddress, isAddress, keccak256, ZeroAddress} from 'ethers'

export const ARC_TRADE_USDC='0x3600000000000000000000000000000000000000'
const sha=(content:string)=>createHash('sha256').update(content.replace(/\r\n/g,'\n')).digest('hex')

// Offline candidate preparation only. No provider, signer, nonce, gas estimate,
// release-registry write or broadcast is accepted by this function.
export async function buildArcTradeDeploymentPlan(input:{artifact:any;build:any;source:(name:string)=>string;arbiter?:string}){
  const {artifact,build}=input
  if(artifact.contractName!=='TradeEscrowFactory'||artifact.sourceName!=='src/TradeEscrowFactory.sol')throw Error('Expected the physical Trade factory artifact.')
  const settings=build?.input?.settings
  if(build?.solcVersion!=='0.8.24'||!settings?.optimizer?.enabled||settings.optimizer.runs!==200||settings.viaIR!==true)throw Error('Unexpected Trade candidate compiler settings.')
  const compiled=build.output?.contracts?.[artifact.sourceName]?.[artifact.contractName]
  if(!compiled||artifact.bytecode!=='0x'+compiled.evm.bytecode.object||artifact.deployedBytecode!=='0x'+compiled.evm.deployedBytecode.object||JSON.stringify(artifact.abi)!==JSON.stringify(compiled.abi))throw Error('Trade artifact differs from compiler output.')
  if(Object.keys(artifact.linkReferences??{}).length||Object.keys(artifact.deployedLinkReferences??{}).length)throw Error('Unresolved Trade libraries.')
  // Walk compiler-resolved imports, including the escrow creation code embedded
  // in the factory. Record only this contract's transitive compilation inputs.
  const sources:Record<string,string>={}
  function visit(name:string){
    if(sources[name])return
    if(name.includes('..')||(!name.startsWith('src/')&&!name.startsWith('@openzeppelin/contracts/')))throw Error('Unexpected source dependency.')
    const content=build.input.sources[name]?.content
    if(typeof content!=='string'||sha(input.source(name))!==sha(content))throw Error('Compiled Trade source differs from the working tree.')
    sources[name]=sha(content)
    const ast=build.output.sources[name]?.ast
    if(!ast)throw Error('Compiler source AST is missing.')
    for(const node of ast.nodes??[])if(node.nodeType==='ImportDirective')visit(node.absolutePath)
  }
  visit(artifact.sourceName)
  let arbiter:string|null=null
  if(input.arbiter!==undefined){
    if(!isAddress(input.arbiter))throw Error('Arbiter must be a valid public Safe address.')
    arbiter=getAddress(input.arbiter)
    if(arbiter===ZeroAddress||arbiter===ARC_TRADE_USDC)throw Error('Arbiter must differ from zero and USDC.')
  }
  const data=arbiter?(await new ContractFactory(artifact.abi,artifact.bytecode).getDeployTransaction(ARC_TRADE_USDC,arbiter)).data:null
  let expectedRuntime:string|null=null
  if(arbiter){
    const declarations=build.output.sources[artifact.sourceName].ast.nodes
      .find((node:any)=>node.nodeType==='ContractDefinition'&&node.name==='TradeEscrowFactory').nodes
      .filter((node:any)=>node.nodeType==='VariableDeclaration'&&node.mutability==='immutable')
    const values=new Map(declarations.map((node:any)=>[String(node.id),node.name==='token'?ARC_TRADE_USDC:node.name==='arbiter'?arbiter:null]))
    if(values.size!==2||[...values.values()].some(value=>!value))throw Error('Unexpected factory immutable declarations.')
    const bytes=Buffer.from(artifact.deployedBytecode.slice(2),'hex')
    for(const [id,refs] of Object.entries(compiled.evm.deployedBytecode.immutableReferences)){
      const address=values.get(id) as string|undefined
      if(!address)throw Error('Unexpected factory immutable reference.')
      for(const ref of refs as {start:number;length:number}[]){
        if(ref.length!==32||ref.start+32>bytes.length)throw Error('Invalid immutable byte range.')
        Buffer.from(address.slice(2).padStart(64,'0'),'hex').copy(bytes,ref.start)
      }
    }
    expectedRuntime='0x'+bytes.toString('hex')
  }
  return {
    status:'unsigned-review-candidate',chainId:5042,contractName:'TradeEscrowFactory',
    token:ARC_TRADE_USDC,tokenDecimals:6,arbiter,
    compiler:{version:build.solcLongVersion,settings},sourceSha256:sources,
    creationBytecodeHash:keccak256(artifact.bytecode),
    // Solidity immutable slots are still zero here. This is NOT the runtime
    // hash accepted by Hash PayLink's deployed factory release registry.
    runtimeTemplateHash:keccak256(artifact.deployedBytecode),
    expectedRuntimeHash:expectedRuntime?keccak256(expectedRuntime):null,
    immutableReferences:compiled.evm.deployedBytecode.immutableReferences,
    constructorArguments:arbiter?[ARC_TRADE_USDC,arbiter]:null,
    unsignedCreation:data?{chainId:5042,value:'0',data,initCodeHash:keccak256(data)}:null,
    deployed:false,fundingEnabled:false,safeVerified:false,productionReady:false,
    blockers:[...(!arbiter?['Choose and verify the Arc Trade Safe address.']:[]),'Verify Arc Safe owners, threshold two, singleton, runtime and disabled modules.','Review this exact source/build and deploy through an authorized wallet.','Verify deployed factory bytecode with constructor immutables applied.','Verify Circle wallet execution and both-rail funded lifecycle evidence.'],
  }
}
