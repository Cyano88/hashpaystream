import { readFileSync, writeFileSync } from 'node:fs';
const r = JSON.parse(readFileSync('docs/evidence/stock-kraken-continuity.json','utf8'));
const samples = r.samples.map(s => {
  const now = Date.parse(s.completedAt)/1000;
  const trade = s.lastTrade;
  const book = s.depth;
  const usdcRows = Object.entries(s.usdc).find(([key]) => key !== 'last')?.[1];
  const usdc = Array.isArray(usdcRows) ? usdcRows.at(-1) : null;
  const age = Array.isArray(trade) ? now-Number(trade[2]) : null;
  const out = { observedAt:s.completedAt, lastTradeId:trade?.[6], tradeAgeSeconds:age, tradeFresh:age!==null && age>=0 && age<=15, bestBid:book?.bids?.[0], bestAsk:book?.asks?.[0], usdcTrade:usdc, usdcAgeSeconds:usdc ? now-Number(usdc[2]) : null };
  if (s.xlayer && !s.xlayer.error && Array.isArray(trade) && usdc) {
    const underlying = Number(s.xlayer.wrapperInput)*Number(s.xlayer.underlyingUnitsPerWrapper)/1e36;
    const hypotheticalFair = underlying*Number(trade[0])/Number(usdc[0]);
    const actual = Number(s.xlayer.outputUsdcUnits)/1e6;
    out.comparison = { assumedKrakenUnit:'rebased underlying ERC20 unit - UNVERIFIED', underlyingUnits:underlying, hypotheticalFairUsdc:hypotheticalFair, dexOutputUsdc:actual, differenceBps:(actual/hypotheticalFair-1)*10000, block:s.xlayer.block, blockAgeSeconds:now-s.xlayer.blockTimestamp, validForAcceptance:false };
  } else if(s.xlayer) out.chainError = s.xlayer.error;
  return out;
});
const summary = { productionReady:false, exchangeApiUnitsVerified:false, sampleCount:samples.length, freshTradeSamples:samples.filter(s=>s.tradeFresh).length, distinctTradeIds:[...new Set(samples.map(s=>s.lastTradeId).filter(x=>x!==undefined))], websocket:r.websocket, exchangeAsset:r.exchangeAsset, issuerMultiplier:r.issuerMultiplier, samples, probeError:r.error??null, note:'Diagnostic floating-point comparisons only. A finite observation window is not an uptime guarantee. HTTP arrival and heartbeat times do not refresh market prices.' };
writeFileSync('docs/evidence/stock-kraken-continuity-summary.json',JSON.stringify(summary,null,2)+'\n');
const marketEvents = r.websocket.events.filter(e => ['book','trade'].includes(e.data.channel));
summary.websocketMetrics = {
  heartbeats: r.websocket.heartbeats,
  marketSnapshots: marketEvents.filter(e => e.data.type === 'snapshot').length,
  marketUpdates: marketEvents.filter(e => e.data.type === 'update').length,
  bookSnapshotAgeAtReceiptSeconds: marketEvents.filter(e => e.data.channel === 'book' && e.data.type === 'snapshot').map(e => (Date.parse(e.receivedAt)-Date.parse(e.data.data[0].timestamp))/1000),
  checksumVerified: false
};
writeFileSync('docs/evidence/stock-kraken-continuity-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({sampleCount:summary.sampleCount,freshTradeSamples:summary.freshTradeSamples,distinctTradeIds:summary.distinctTradeIds,websocketMetrics:summary.websocketMetrics,exchangeAsset:summary.exchangeAsset,issuerMultiplier:summary.issuerMultiplier,comparisons:samples.filter(s=>s.comparison).map(s=>s.comparison)},null,2));
