import { isAddress, type Address, type Hex } from 'viem'
import { stockFailure as fail } from './stock-early-pay-config.js'

export type StockParticipantScope={
 chainId:number;asset:Address;worker:Address;funder:Address;earningsId:Hex;
 principalUsdcUnits:string;policyVersion:string
}
export type StockParticipantClearance=StockParticipantScope & {
 checkedAt:number;expiresAt:number;workerEligible:boolean;funderEligible:boolean;
 workerJurisdiction:string;funderJurisdiction:string;reviewReference:string
}
/** A trusted risk adapter must obtain actual participant review evidence.
 * Wallet ownership and asset transferability are not participant eligibility.
 * This validator does not itself grant issuer or jurisdictional approval.
 */
export function assertStockParticipantClearance(value:unknown,expected:StockParticipantScope,now:number,maxAge:number):StockParticipantClearance{
 const p=value as Partial<StockParticipantClearance>|undefined
 const addressMatches=(a:unknown,b:string)=>typeof a==='string'&&isAddress(a)&&a.toLowerCase()===b.toLowerCase()
 if(!p||p.chainId!==expected.chainId||!addressMatches(p.asset,expected.asset)||!addressMatches(p.worker,expected.worker)||
    !addressMatches(p.funder,expected.funder)||p.earningsId!==expected.earningsId||p.principalUsdcUnits!==expected.principalUsdcUnits||
    p.policyVersion!==expected.policyVersion)fail('Participant eligibility does not match this funding request.',409)
 if(p.workerEligible!==true||p.funderEligible!==true)fail('This funding request is not approved for both participants.',409)
 const checkedAt=p.checkedAt,expiresAt=p.expiresAt
 if(typeof checkedAt!=='number'||typeof expiresAt!=='number'||!Number.isSafeInteger(p.checkedAt)||!Number.isSafeInteger(p.expiresAt)||checkedAt<=0||checkedAt>now||
    now-checkedAt>maxAge||expiresAt<=now||expiresAt-checkedAt>maxAge)fail('Participant eligibility is missing or expired.',409)
 if(typeof p.workerJurisdiction!=='string'||!/^[A-Z]{2}$/.test(p.workerJurisdiction)||
    typeof p.funderJurisdiction!=='string'||!/^[A-Z]{2}$/.test(p.funderJurisdiction)||
    typeof p.reviewReference!=='string'||!p.reviewReference.trim()||p.reviewReference.length>180)fail('Participant review evidence is incomplete.',409)
 return p as StockParticipantClearance
}
