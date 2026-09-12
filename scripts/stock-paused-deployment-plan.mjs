import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {keccak256} from 'viem'
const evidence=JSON.parse(readFileSync('docs/evidence/stock-xlayer-candidate.json','utf8'))
const artifact=JSON.parse(readFileSync('contracts/artifacts/src/StockEarlyPayEscrow.sol/StockEarlyPayEscrow.json','utf8'))
if(evidence.chainId!==196||evidence.candidate.wrapper.symbol!=='wSPYx'||artifact.contractName!=='StockEarlyPayEscrow')throw Error('Unexpected deployment candidate')
const plan={
 schema:1,chainId:196,status:'DRAFT_BLOCKED',deploymentApproved:false,unsignedTransaction:null,
 contract:'StockEarlyPayEscrow',evidenceBlock:evidence.blockNumber,
 evidenceSha256:createHash('sha256').update(readFileSync('docs/evidence/stock-xlayer-candidate.json')).digest('hex'),
 sourceSha256:createHash('sha256').update(readFileSync('contracts/src/StockEarlyPayEscrow.sol')).digest('hex'),
 creationBytecodeHash:keccak256(artifact.bytecode),
 constructorOrder:['usdc','owner','riskSigner','maxFeeBps','maxRiskAge'],
 constructorDraft:{usdc:evidence.candidate.payment.address,owner:null,riskSigner:null,maxFeeBps:100,maxRiskAge:60},
 proposedAsset:evidence.candidate.wrapper,
 deploymentPostconditions:{paused:true,allowedAsset:false,allowedFunder:false,totalUsdcLiability:'0',policyVersion:1},
 proposedPilotPolicy:{
  status:'UNAPPROVED_NOT_CALIBRATED_NOT_ENABLED',
  maxFeeBps:100,maxRiskAgeSeconds:60,maxSourcePriceAgeSeconds:15,maxQuoteTtlSeconds:30,maxQuoteDeviationBps:50,
  maxPrincipalUsdcUnits:'100000000',maxRepaymentDelaySeconds:604800,maxOutstandingClaimsPerWorker:1,
  minExecutableExitLiquidityUsdcUnits:'1000000000',
  maxIntradayRangeBps:300,maxFiveMinuteAbsoluteMoveBps:50,
  volatilityDefinition:'Intraday high-low divided by previous regular-session close; five-minute absolute return. Require complete timestamped adjusted data.',
  tradeWindow:'US regular session only; issuer and independent feed must both report open',
  confirmations:null,
  note:'Principal, tenor, per-worker caps, session and corporate-action checks require implementation; not enforced by current config merely by appearing here.'
 },
 requiredBeforeDeployment:[...evidence.blockers,'Approve constructor fee ceiling and risk age before immutable deployment',
  'Provide reviewed owner/multisig and distinct risk/settlement signer addresses','Review compiler artifact against current source and complete security review'],
 requiredBeforeUnpause:['Pin deployed runtime and creation block','Implement participant-bound eligibility and verified unit-aware pricing',
  'Implement and test pilot caps and corporate-action blackout','Verify provider account network and executable exit liquidity',
  'Rehearse actual stock delivery and fixed USDC repayment with approved participants','Review implementation-upgrade monitoring and incident pause','Enable mainnet API/worker only through reviewed release'],
 broadcast:false
}
writeFileSync('docs/evidence/stock-paused-deployment-plan.json',JSON.stringify(plan,null,2)+'\n')
console.log('Paused deployment review packet prepared: DRAFT_BLOCKED. No unsigned transaction emitted; owner, risk signer and approvals are missing.')
