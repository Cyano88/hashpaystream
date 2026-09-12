import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { StockRiskPolicy } from '../src/lib/stockFundingOffers.js'
import type { StockClientConfig } from '../src/lib/stockEarlyPayProtocol.js'

export function stockFailure(message: string, status = 409): never { throw Object.assign(new Error(message), { status }) }
export type StockConfig = StockClientConfig & {
 marketDataProvider?:'pyth-pro'|'alpaca-sip'; pythKey?:string;
 marketAdapter?: 'xlayer-dex-v1'; marketCredentials?: {key:string;secret:string;paper:boolean}; riskAuthorization?:string;
 rpcUrl: string; runtimeHash: Hex; riskKey: Hex; riskSigner: Address; riskUrl: string;
 ownershipSecret: string; participantIds: string[]; reviewedEarningsIds: string[];
 deploymentBlock:number; policy: StockRiskPolicy; maxRiskAge: number; quoteTtlSeconds: number
}
const integer = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max
const addr = (x: unknown): Address => {
 if (typeof x !== 'string' || !isAddress(x) || /^0x0{40}$/i.test(x)) stockFailure('Stock deployment configuration is incomplete.', 503)
 return getAddress(x)
}
export function readStockConfig(env: NodeJS.ProcessEnv): StockConfig {
 if (env.HASHPAYSTREAM_STOCK_EARLY_PAY_ENABLED !== 'true') stockFailure('Stock early pay is not enabled.', 503)
 let raw: Record<string, unknown>
 try { raw = JSON.parse(env.HASHPAYSTREAM_STOCK_CONFIG ?? '') } catch { stockFailure('Stock deployment configuration is incomplete.', 503) }
 // Deployment target is X Layer mainnet (196). Only local rehearsals are enabled
 // until a stock escrow, asset and risk policy have been reviewed and pinned.
 if (!raw || ![31337].includes(Number(raw.chainId)) || typeof raw.chainId !== 'number') stockFailure('Stock early pay has not been approved for this network.', 503)
 const chainId = raw.chainId as number
 if(raw.marketDataProvider!==undefined&&!['pyth-pro','alpaca-sip'].includes(String(raw.marketDataProvider)))stockFailure('Unknown independent stock provider.',503)
 if(raw.marketAdapter!==undefined&&raw.marketAdapter!=='xlayer-dex-v1')stockFailure('Unknown stock market adapter.',503)
 if(!integer(raw.deploymentBlock,0,Number.MAX_SAFE_INTEGER))stockFailure('Stock deployment block is required for receipt recovery.',503)
 let rpc: URL, risk: URL
 try { rpc = new URL(String(raw.rpcUrl)); risk = new URL(String(raw.riskUrl)) } catch { stockFailure('Stock endpoints are not configured.',503) }
 const local = (url: URL) => ['localhost','127.0.0.1','[::1]'].includes(url.hostname)
 if (rpc.username || rpc.password || risk.username || risk.password ||
     (chainId === 31337 && (env.NODE_ENV === 'production' || !local(rpc) || !local(risk))) ||
     (chainId !== 31337 && (rpc.protocol !== 'https:' || risk.protocol !== 'https:')) ||
     !['http:','https:'].includes(rpc.protocol) || !['http:','https:'].includes(risk.protocol)) stockFailure('Stock endpoints do not match the selected environment.',503)
 if (!integer(raw.maxFeeBps,0,10_000) || !integer(raw.maxRiskAge,1,300) || !integer(raw.quoteTtlSeconds,1,300) ||
     !integer(raw.confirmations,1,64) || !integer(raw.assetDecimals,0,18) ||
     typeof raw.assetSymbol !== 'string' || !/^[A-Za-z0-9._-]{1,24}$/.test(raw.assetSymbol) ||
     typeof raw.runtimeHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(raw.runtimeHash)) stockFailure('Stock risk policy is incomplete.',503)
 const p = raw.policy as Record<string,unknown> | undefined
 if (!p || !integer(p.maxVolatilityBps,0,10_000) || !integer(p.maxPriceAgeSeconds,1,Number(raw.maxRiskAge)) ||
     !integer(p.maxQuoteDeviationBps,0,10_000) || typeof p.minExecutableLiquidityUsdcUnits !== 'string' ||
     !/^[1-9][0-9]{0,77}$/.test(p.minExecutableLiquidityUsdcUnits)) stockFailure('Stock risk policy is incomplete.',503)
 const key = env.HASHPAYSTREAM_STOCK_RISK_SIGNER_KEY
 if (!key || !/^0x[a-fA-F0-9]{64}$/.test(key)) stockFailure('Stock risk approval is unavailable.',503)
 let riskSigner: Address
 try { riskSigner = privateKeyToAccount(key as Hex).address } catch { stockFailure('Stock risk approval is unavailable.',503) }
 const participantIds = raw.participantIds
 if (!Array.isArray(participantIds) || !participantIds.length || participantIds.some(x => typeof x !== 'string' || !x || x.length > 180)) stockFailure('Stock pilot eligibility is not configured.',503)
 const reviewed = raw.reviewedEarningsIds ?? []
 if (!Array.isArray(reviewed) || reviewed.some(x => typeof x !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(x))) stockFailure('Stock review configuration is invalid.',503)
 const secret = env.HASHPAYSTREAM_APP_OWNERSHIP_SECRET ?? ''
 if (secret.length < 32) stockFailure('Stock identity binding is not configured.',503)
 const asset = addr(raw.asset), usdc = addr(raw.usdc)
 if (asset === usdc) stockFailure('Stock and payment assets must differ.',503)
 return {
  marketDataProvider:(raw.marketDataProvider??'pyth-pro') as 'pyth-pro'|'alpaca-sip',pythKey:env.HASHPAYSTREAM_PYTH_PRO_KEY,
  marketAdapter:raw.marketAdapter as 'xlayer-dex-v1'|undefined,
  marketCredentials:raw.marketAdapter==='xlayer-dex-v1'?{key:env.HASHPAYSTREAM_ALPACA_KEY??'',secret:env.HASHPAYSTREAM_ALPACA_SECRET??'',paper:env.HASHPAYSTREAM_ALPACA_PAPER==='true'}:undefined,
  riskAuthorization:env.HASHPAYSTREAM_STOCK_RISK_ADAPTER_TOKEN,
  version:1,chainId,deploymentBlock:Number(raw.deploymentBlock),escrow:addr(raw.escrow),asset,usdc,assetSymbol:raw.assetSymbol,assetDecimals:Number(raw.assetDecimals),
  maxFeeBps:Number(raw.maxFeeBps),maxRiskAge:Number(raw.maxRiskAge),quoteTtlSeconds:Number(raw.quoteTtlSeconds),
  confirmations:Number(raw.confirmations),rpcUrl:rpc.href,riskUrl:risk.href,runtimeHash:raw.runtimeHash as Hex,
  riskKey:key as Hex,riskSigner,ownershipSecret:secret,participantIds,reviewedEarningsIds:reviewed.map(x=>x.toLowerCase()),
  policy:{chainId,asset,assetSymbol:raw.assetSymbol,assetDecimals:Number(raw.assetDecimals),maxFeeBps:Number(raw.maxFeeBps),
   maxVolatilityBps:Number(p.maxVolatilityBps),maxPriceAgeSeconds:Number(p.maxPriceAgeSeconds),maxQuoteDeviationBps:Number(p.maxQuoteDeviationBps),
   minExecutableLiquidityUsdcUnits:p.minExecutableLiquidityUsdcUnits}
 }
}
export function publicStockConfig(c: StockConfig): StockClientConfig {
 return {version:1,chainId:c.chainId,escrow:c.escrow,usdc:c.usdc,asset:c.asset,assetSymbol:c.assetSymbol,assetDecimals:c.assetDecimals,maxFeeBps:c.maxFeeBps,confirmations:c.confirmations}
}
