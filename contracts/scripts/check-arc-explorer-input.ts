import {artifacts,run} from 'hardhat'
import {Compiler,NativeCompiler} from 'hardhat/internal/solidity/compiler'
import {readFileSync} from 'node:fs'
async function main(){
 const requestPath=process.env.ARC_TRADE_EXPLORER_REQUEST
 if(!requestPath)throw Error('Set ARC_TRADE_EXPLORER_REQUEST to the prepared public source request JSON.')
 const request=JSON.parse(readFileSync(requestPath,'utf8'))
 const input=JSON.parse(request.standardInput)
 const compiler=await run('compile:solidity:solc:get-build',{quiet:true,solcVersion:'0.8.24'})
 const output=await(compiler.isSolcJs?new Compiler(compiler.compilerPath):new NativeCompiler(compiler.compilerPath,'0.8.24')).compile(input)
 const artifact=await artifacts.readArtifact('TradeEscrowFactory')
 const built=output.contracts?.['src/TradeEscrowFactory.sol']?.TradeEscrowFactory
 console.log(JSON.stringify({errors:output.errors?.filter(e=>e.severity==='error').map(e=>e.formattedMessage),creationMatches:!!built&&'0x'+built.evm.bytecode.object===artifact.bytecode,runtimeMatches:!!built&&'0x'+built.evm.deployedBytecode.object===artifact.deployedBytecode}))
}
main().catch(()=>{console.error('Local explorer input compilation failed');process.exitCode=1})
