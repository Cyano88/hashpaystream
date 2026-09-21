import {stockFailure as fail} from './stock-early-pay-config.js'

// Additional same-pool movement guard, not an independent oracle.
// Tick quantization is approximately one basis point; exact exit/reference checks remain required.
export function assertStockDexHistory(spotTick:number,cumulatives:readonly bigint[],maxBps:number){
 if(!Number.isSafeInteger(spotTick)||Math.abs(spotTick)>887272||!Number.isSafeInteger(maxBps)||maxBps<0||maxBps>10000||!Array.isArray(cumulatives)||cumulatives.length!==3||cumulatives.some(t=>typeof t!=='bigint'||BigInt.asIntN(56,t)!==t))fail('DEX observation history is invalid.',503)
 const mean=(start:bigint,end:bigint,seconds:bigint)=>{const delta=BigInt.asIntN(56,end-start);const result=delta/seconds-(delta<0n&&delta%seconds!==0n?1n:0n);if(result < -887272n||result>887272n)fail('DEX average tick is invalid.',503);return Number(result)}
 const meanTick30m=mean(cumulatives[0],cumulatives[2],1800n),meanTick5m=mean(cumulatives[1],cumulatives[2],300n)
 for(const [a,b] of [[spotTick,meanTick5m],[spotTick,meanTick30m],[meanTick5m,meanTick30m]]){
  const distance=Math.abs(a-b)
  // Even the largest allowed 100% ratio is exceeded by 10,000 ticks; bound exponent work.
  if(distance>10000)fail('DEX spot and time-weighted prices disagree.',409)
  const denominator=10000n**BigInt(distance),numerator=10001n**BigInt(distance)
  if((numerator-denominator)*10000n>BigInt(maxBps)*denominator)fail('DEX spot and time-weighted prices disagree.',409)
 }
 return {spotTick,meanTick5m,meanTick30m}
}
