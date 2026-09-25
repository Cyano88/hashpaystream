import {expect} from 'chai';
import {ethers,network} from 'hardhat';
import fs from 'node:fs';
import {time} from '@nomicfoundation/hardhat-network-helpers';
(process.env.XSTOCKS_FORK_TEST==='1'?describe:describe.skip)('Live NVDAx local-fork custody rehearsal',()=>{
 it('reproduces old failure, then funds and releases actual token shares locally',async function(){
  this.timeout(240000);
  if(network.name!=='hardhat')throw Error('Local hardhat network required');
  await network.provider.send('hardhat_reset',[{forking:{jsonRpcUrl:'https://rpc.xlayer.tech'}}]);
  await network.provider.send('evm_mine');
  const buyerAddress='0xE292801Ff95620ae2749B8C71A9EABB51E77e851',sellerAddress='0xF3853789e1d4F227BCA68E522240f1Ca139BABd1';
  for(const a of [buyerAddress,sellerAddress]){await network.provider.send('hardhat_impersonateAccount',[a]);await network.provider.send('hardhat_setBalance',[a,'0x56BC75E2D63100000']);}
  const buyer=await ethers.getSigner(buyerAddress),seller=await ethers.getSigner(sellerAddress),[deployer]=await ethers.getSigners();
  const token:any=await ethers.getContractAt(['function sharesOf(address) view returns(uint256)','function approve(address,uint256) returns(bool)'], '0xc845b2894dbddd03858fd2d643b4ef725fe0849d',buyer);
  const old:any=await ethers.getContractAt(['function termsHash() view returns(bytes32)','function fund(bytes32)','error IncorrectFunding()'],'0x482d848Dd0C5a351415f39e46f0106d80a49c06F',buyer);
  await expect(old.fund.staticCall(await old.termsHash())).revertedWithCustomError(old,'IncorrectFunding');
  const hash=ethers.id('local-only share-based settlement consent'),amount=2220000000000000n;
  const manifest=JSON.parse(fs.readFileSync('xstocks-share-release.json','utf8'));
  const factory:any=await ethers.deployContract('XStocksTradeEscrowFactory',[manifest.arbiter,[await token.getAddress()]]);
  expect(ethers.keccak256(await ethers.provider.getCode(await factory.getAddress()))).eq(manifest.runtimeHash);
  const terms={offerId:ethers.id('local-only'),termsHash:hash,buyer:buyerAddress,seller:sellerAddress,arbiter:manifest.arbiter,token:await token.getAddress(),amount,fundBy:await time.latest()+86400,dispatchWindow:86400,deliveryWindow:86400,inspectionWindow:172800};
  await factory.connect(seller).create(terms);
  const escrow:any=await ethers.getContractAt('XStocksTradeEscrow',await factory.escrows(await factory.offerKey(sellerAddress,buyerAddress,terms.offerId)));await escrow.connect(seller).acceptTerms(hash);await token.approve(await escrow.getAddress(),amount);await escrow.connect(buyer).fund(hash);
  const q=await escrow.fundedShares();expect(q).greaterThan(0n);expect(await token.sharesOf(await escrow.getAddress())).eq(q);
  const snapshot=await network.provider.send('evm_snapshot');const before=await token.sharesOf(sellerAddress);await escrow.connect(seller).markDispatched(ethers.id('test handover'));await escrow.connect(buyer).approveRelease();expect(await token.sharesOf(sellerAddress)-before).eq(q);expect(await escrow.sellerSettledShares()).eq(q);expect(await escrow.sellerUnderlyingAtSettlement()).greaterThan(0n);expect(await token.sharesOf(await escrow.getAddress())).eq(0n);
  await network.provider.send('evm_revert',[snapshot]);const buyerBefore=await token.sharesOf(buyerAddress);await escrow.connect(seller).refundBySeller(ethers.id('test refund'));expect(await token.sharesOf(buyerAddress)-buyerBefore).eq(q);expect(await token.sharesOf(await escrow.getAddress())).eq(0n);
 });
});
