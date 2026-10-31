import { encodeAbiParameters, keccak256, parseAbi, type Address, type Hex } from 'viem'
export const STOCK_PROTOCOL_VERSION = 1
export function stockEarningsId(employer:Address,salt:Hex) { return keccak256(encodeAbiParameters([{type:'address'},{type:'bytes32'}],[employer,salt])) }
export type StockFundingDraft = { id:Hex; salt:Hex; employer:Address; worker:Address; amount:string; payAt:number; title:string; employerId:string }
export type StockEarningsAction = 'fundEarnings'|'approveEarnings'|'cancelUnapprovedEarnings'|'releaseEarnings'
export const STOCK_OFFER_TYPES = { StockOffer: [
  { name: 'earningsId', type: 'bytes32' }, { name: 'funder', type: 'address' }, { name: 'asset', type: 'address' },
  { name: 'tokenAmount', type: 'uint256' }, { name: 'principal', type: 'uint256' }, { name: 'feeBps', type: 'uint16' },
  { name: 'payAt', type: 'uint48' }, { name: 'expiresAt', type: 'uint48' }, { name: 'nonce', type: 'bytes32' },
] } as const
export const STOCK_RISK_TYPES = { RiskApproval: [
  { name: 'offerHash', type: 'bytes32' }, { name: 'observedAt', type: 'uint48' },
  { name: 'validUntil', type: 'uint48' }, { name: 'policyVersion', type: 'uint256' },
] } as const
export type StockOfferWire = { earningsId: Hex; funder: Address; asset: Address; tokenAmount: string; principal: string; feeBps: number; payAt: number; expiresAt: number; nonce: Hex }
export type StockRiskWire = { offerHash: Hex; observedAt: number; validUntil: number; policyVersion: string }
export function stockOfferMessage(offer: StockOfferWire) { return { ...offer, principal: BigInt(offer.principal), tokenAmount: BigInt(offer.tokenAmount) } }
export function stockDomain(chainId: number, escrow: Address) { return { name: 'HashPayStream Stock Early Pay', version: '1', chainId, verifyingContract: escrow } as const }
export const STOCK_ESCROW_ABI = parseAbi([
 'struct Offer { bytes32 earningsId; address funder; address asset; uint256 tokenAmount; uint256 principal; uint16 feeBps; uint48 payAt; uint48 expiresAt; bytes32 nonce; }',
 'struct RiskApproval { bytes32 offerHash; uint48 observedAt; uint48 validUntil; uint256 policyVersion; }',
 'function usdc() view returns (address)',
 'function maxFeeBps() view returns (uint16)',
 'function maxRiskAge() view returns (uint48)',
 'function riskSigner() view returns (address)',
 'function policyVersion() view returns (uint256)',
 'function paused() view returns (bool)',
 'function allowedAsset(address) view returns (bool)',
 'function allowedFunder(address) view returns (bool)',
 'function inventory(address,address) view returns (uint256)',
 'function earnings(bytes32) view returns (address employer,address worker,uint256 available,uint48 payAt,bool approved)',
 'function claims(bytes32) view returns (address funder,address worker,bytes32 earningsId,uint256 repayment,uint48 payAt,bool settled)',
 'function usedOffers(bytes32) view returns (bool)',
 'function fundEarnings(bytes32 salt,address worker,uint256 amount,uint48 payAt) returns (bytes32)',
 'function approveEarnings(bytes32 id)',
 'function cancelUnapprovedEarnings(bytes32 id)',
 'function depositStock(address asset,uint256 amount)',
 'function withdrawStock(address asset,uint256 amount)',
 'function cancelOffer(Offer offer)',
 'function acceptOffer(Offer offer,bytes funderSignature,RiskApproval risk,bytes riskSignature)',
 'function settle(bytes32 id)',
 'function releaseEarnings(bytes32 id)',
 'event StockDelivered(bytes32 indexed offerHash,bytes32 indexed earningsId,address indexed funder,address worker,address asset,uint256 tokenAmount,uint256 principal,uint256 fee,uint48 payAt)',
 'event FunderRepaid(bytes32 indexed offerHash,address indexed funder,uint256 amount)',
])
export const STOCK_TOKEN_ABI = parseAbi(['function decimals() view returns (uint8)','function approve(address,uint256) returns (bool)','function allowance(address,address) view returns (uint256)','function balanceOf(address) view returns (uint256)'])
export type StockClientConfig = { version: 1; chainId: number; escrow: Address; usdc: Address; asset: Address; assetSymbol: string; assetDecimals: number; maxFeeBps: number; confirmations: number }
