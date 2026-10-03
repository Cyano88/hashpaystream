import {expect} from 'chai'
import {ethers,network} from 'hardhat'
import {loadFixture,time} from '@nomicfoundation/hardhat-network-helpers'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

// These are the published Safe 1.4.1 artifacts, installed in a separate dependency
// directory so this rehearsal cannot mutate another worktree's node_modules.
const safeRoot=resolve(__dirname,'../node_modules/@safe-global/safe-contracts')
function artifact(file:string){return JSON.parse(readFileSync(resolve(safeRoot,'build/artifacts/contracts',file),'utf8'))}
const types={SafeTx:[{name:'to',type:'address'},{name:'value',type:'uint256'},{name:'data',type:'bytes'},{name:'operation',type:'uint8'},{name:'safeTxGas',type:'uint256'},{name:'baseGas',type:'uint256'},{name:'gasPrice',type:'uint256'},{name:'gasToken',type:'address'},{name:'refundReceiver',type:'address'},{name:'nonce',type:'uint256'}]}

describe('Arc Trade real Safe rehearsal (local mock funds only)',()=>{
  before(async()=>{
    if(network.name!=='hardhat'||(await ethers.provider.getNetwork()).chainId!==5042n)throw Error('Use the isolated hardhat.arc-trade.config.ts network only.')
    expect(JSON.parse(readFileSync(resolve(safeRoot,'package.json'),'utf8')).version).to.equal('1.4.1')
  })
  async function fixture(){
    const [deployer,buyer,seller,ownerA,ownerB,outsider]=await ethers.getSigners()
    const safeArtifact=artifact('Safe.sol/Safe.json'),proxyArtifact=artifact('proxies/SafeProxyFactory.sol/SafeProxyFactory.json')
    const singleton:any=await new ethers.ContractFactory(safeArtifact.abi,safeArtifact.bytecode,deployer).deploy()
    const proxyFactory:any=await new ethers.ContractFactory(proxyArtifact.abi,proxyArtifact.bytecode,deployer).deploy()
    await Promise.all([singleton.waitForDeployment(),proxyFactory.waitForDeployment()])
    const initializer=singleton.interface.encodeFunctionData('setup',[[ownerA.address,ownerB.address],2,ethers.ZeroAddress,'0x',ethers.ZeroAddress,ethers.ZeroAddress,0,ethers.ZeroAddress])
    const safeAddress=await proxyFactory.createProxyWithNonce.staticCall(await singleton.getAddress(),initializer,5042)
    await (await proxyFactory.createProxyWithNonce(await singleton.getAddress(),initializer,5042)).wait()
    const safe:any=new ethers.Contract(safeAddress,safeArtifact.abi,deployer)
    expect(await safe.VERSION()).to.equal('1.4.1');expect(await safe.getThreshold()).to.equal(2)
    expect(await safe.getOwners()).to.deep.equal([ownerA.address,ownerB.address])
    const modules=await safe.getModulesPaginated('0x0000000000000000000000000000000000000001',10)
    expect(modules[0]).to.have.length(0)
    const token:any=await ethers.deployContract('MockUSDC')
    const factory:any=await ethers.deployContract('TradeEscrowFactory',[await token.getAddress(),safeAddress])
    const terms={offerId:ethers.id('local Arc Safe rehearsal offer'),termsHash:ethers.id('accepted local Trade terms'),buyer:buyer.address,seller:seller.address,arbiter:safeAddress,token:await token.getAddress(),amount:1250001n,fundBy:(await time.latest())+86400,dispatchWindow:86400,deliveryWindow:172800,inspectionWindow:172800}
    await factory.connect(seller).create(terms)
    const escrowAddress=await factory.escrows(await factory.offerKey(seller.address,buyer.address,terms.offerId))
    const escrow:any=await ethers.getContractAt('TradeEscrow',escrowAddress)
    await token.mint(buyer.address,terms.amount)
    await token.connect(buyer).approve(escrowAddress,terms.amount)
    await escrow.connect(seller).acceptTerms(terms.termsHash)
    await escrow.connect(buyer).fund(terms.termsHash)
    await escrow.connect(seller).markDispatched(ethers.id('local delivery evidence'))
    await escrow.connect(buyer).openDispute(ethers.id('local condition dispute'))
    expect(await escrow.state()).to.equal(5)
    const allocation=500000n,evidence=ethers.id('reviewed exact split'),data=escrow.interface.encodeFunctionData('resolveDispute',[allocation,evidence])
    const message={to:escrowAddress,value:0,data,operation:0,safeTxGas:0,baseGas:0,gasPrice:0,gasToken:ethers.ZeroAddress,refundReceiver:ethers.ZeroAddress,nonce:await safe.nonce()}
    const domain={chainId:5042,verifyingContract:safeAddress}
    async function signatures(signers=[ownerA,ownerB],chainId=5042){
      const signed=await Promise.all(signers.map(async signer=>({owner:signer.address.toLowerCase(),signature:await signer.signTypedData({...domain,chainId},types,message)})))
      return '0x'+signed.sort((a,b)=>a.owner.localeCompare(b.owner)).map(item=>item.signature.slice(2)).join('')
    }
    const args=(sigs:string,callData=data)=>[escrowAddress,0,callData,0,0,0,0,ethers.ZeroAddress,ethers.ZeroAddress,sigs] as const
    return {safe,token,factory,escrow,buyer,seller,ownerA,ownerB,outsider,allocation,evidence,terms,message,domain,signatures,args}
  }
  it('rejects direct reviewer calls, one approval and duplicate-owner approvals',async()=>{
    const c=await loadFixture(fixture)
    await expect(c.escrow.connect(c.ownerA).resolveDispute(c.allocation,c.evidence)).to.be.revertedWithCustomError(c.escrow,'Unauthorized')
    await expect(c.safe.execTransaction(...c.args(await c.signatures([c.ownerA])))).to.be.reverted
    await expect(c.safe.execTransaction(...c.args(await c.signatures([c.ownerA,c.ownerA])))).to.be.reverted
    expect(await c.safe.nonce()).to.equal(0);expect(await c.escrow.state()).to.equal(5)
    expect(await c.token.balanceOf(await c.escrow.getAddress())).to.equal(c.terms.amount)
  })
  it('rejects XLayer signatures, an outsider and an altered split',async()=>{
    const c=await loadFixture(fixture)
    await expect(c.safe.execTransaction(...c.args(await c.signatures(undefined,196)))).to.be.reverted
    await expect(c.safe.execTransaction(...c.args(await c.signatures([c.ownerA,c.outsider])))).to.be.reverted
    const changed=c.escrow.interface.encodeFunctionData('resolveDispute',[c.allocation+1n,c.evidence])
    await expect(c.safe.execTransaction(...c.args(await c.signatures(),changed))).to.be.reverted
    expect(await c.safe.nonce()).to.equal(0);expect(await c.escrow.state()).to.equal(5)
  })
  it('executes two signatures once and reconciles exact six-decimal payouts and events',async()=>{
    const c=await loadFixture(fixture),signatures=await c.signatures()
    const digest=ethers.TypedDataEncoder.hash(c.domain,types,c.message)
    expect(await c.safe.getTransactionHash(...c.args('0x').slice(0,9),0)).to.equal(digest)
    const tx=await c.safe.connect(c.ownerA).execTransaction(...c.args(signatures))
    await expect(tx).to.emit(c.safe,'ExecutionSuccess').withArgs(digest,0)
    await expect(tx).to.emit(c.escrow,'Settled').withArgs(c.terms.offerId,c.allocation,c.terms.amount-c.allocation,c.evidence,8)
    await expect(tx).to.emit(c.token,'Transfer').withArgs(await c.escrow.getAddress(),c.buyer.address,c.allocation)
    await expect(tx).to.emit(c.token,'Transfer').withArgs(await c.escrow.getAddress(),c.seller.address,c.terms.amount-c.allocation)
    expect(await c.token.balanceOf(c.buyer.address)).to.equal(500000n)
    expect(await c.token.balanceOf(c.seller.address)).to.equal(750001n)
    expect(await c.token.balanceOf(await c.escrow.getAddress())).to.equal(0)
    expect(await c.safe.nonce()).to.equal(1);expect(await c.escrow.state()).to.equal(8)
    await expect(c.safe.execTransaction(...c.args(signatures))).to.be.reverted
    expect(await c.safe.nonce()).to.equal(1)
    expect(await c.token.balanceOf(c.buyer.address)).to.equal(500000n)
    expect(await c.token.balanceOf(c.seller.address)).to.equal(750001n)
  })
})
