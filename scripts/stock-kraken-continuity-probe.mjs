// Bounded public-only diagnostic. No credentials, app imports, or transactions.
const marker = 'HPS_STOCK_CONTINUITY_20260912';
const report = { startedAt: new Date().toISOString(), productionReady: false, exchangeApiUnitsVerified: false, samples: [], websocket: { messages: 0, heartbeats: 0, events: [] } };
const finish = () => { console.log(marker + ' ' + JSON.stringify(report)); process.exit(0); };
const deadline = setTimeout(() => { report.error = '95 second deadline exceeded'; finish(); }, 95000);
async function json(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!r.ok) throw Error('HTTP ' + r.status);
  let text = '';
  for await (const chunk of r.body) { text += Buffer.from(chunk).toString('utf8'); if (text.length > 2000000) throw Error('Oversized response'); }
  return JSON.parse(text);
}
async function kraken(endpoint, params) {
  const r = await json('https://api.kraken.com/0/public/' + endpoint + '?' + new URLSearchParams(params));
  if (!Array.isArray(r.error) || r.error.length || !r.result) throw Error(JSON.stringify(r.error));
  return r.result;
}
async function safe(fn) { try { return await fn(); } catch (e) { return { error: e.message }; } }
async function chain() {
  const { createPublicClient, http, parseAbi, encodePacked } = await import('viem');
  const c = createPublicClient({ transport: http('https://rpc.xlayer.tech', { timeout: 10000, retryCount: 0 }) });
  if (await c.getChainId() !== 196) throw Error('Wrong chain');
  const b = await c.getBlock();
  const wrapper = '0xE7E553Cd128F0011777323A0b44a7b96EA1CB540';
  const underlying = '0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48';
  const abi = parseAbi(['function asset() view returns(address)', 'function convertToAssets(uint256) view returns(uint256)', 'function quoteExactInput(bytes,uint256) returns(uint256,uint160[],uint32[],uint256)']);
  const [asset, conversion] = await Promise.all(['asset', 'convertToAssets'].map(functionName => c.readContract({ address: wrapper, abi, functionName, args: functionName === 'asset' ? [] : [10n ** 18n], blockNumber: b.number })));
  if (asset.toLowerCase() !== underlying.toLowerCase() || conversion <= 0n) throw Error('Wrapper identity/conversion mismatch');
  const path = encodePacked(['address','uint24','address','uint24','address'], [wrapper,500,'0x4ae46a509f6b1d9056937ba4500cb143933d2dc8',100,'0xB6CEceAB302E2E4948951eE7843FC24E92933061']);
  const q = await c.simulateContract({ address: '0xd1b797d92d87b688193a2b976efc8d577d204343', abi, functionName: 'quoteExactInput', args: [path,130000000000000000n], blockNumber: b.number });
  if ((await c.getBlock({ blockNumber: b.number })).hash !== b.hash) throw Error('Block changed');
  return { observedAt: new Date().toISOString(), block: String(b.number), blockHash: b.hash, blockTimestamp: Number(b.timestamp), underlyingUnitsPerWrapper: String(conversion), wrapperInput: '130000000000000000', outputUsdcUnits: String(q.result[0]), diagnosticOnly: true, runtimePinsRevalidated: false };
}
let socket;
try {
  const pairs = await kraken('AssetPairs', { aclass_base: 'tokenized_asset', assetVersion: '1' });
  const match = Object.entries(pairs).find(([k,p]) => k.toLowerCase() === 'spyx/usd' && p.base.toLowerCase() === 'spyx' && p.quote === 'USD');
  if (!match) throw Error('SPYx/USD missing');
  report.pair = match;
  const pair = match[1].altname;
  try {
    socket = new WebSocket('wss://ws.kraken.com/v2');
    socket.addEventListener('open', () => {
      report.websocket.openedAt = new Date().toISOString();
      for (const channel of ['book','trade']) socket.send(JSON.stringify({ method:'subscribe', params:{ channel, symbol:[match[1].wsname], snapshot:true, ...(channel === 'book' ? {depth:10} : {}) } }));
    });
    socket.addEventListener('message', e => {
      report.websocket.messages++;
      if (String(e.data).length > 200000) return;
      try {
        const data = JSON.parse(e.data);
        if (data.channel === 'heartbeat') report.websocket.heartbeats++;
        else if (report.websocket.events.length < 20) report.websocket.events.push({ receivedAt: new Date().toISOString(), data });
      } catch { report.websocket.parseError = true; }
    });
    socket.addEventListener('error', () => { report.websocket.error = 'WebSocket connection error'; });
  } catch(e) { report.websocket.error = e.message; }
  const metadata = Promise.all([
    safe(() => kraken('Assets',{asset:'SPYx',aclass:'tokenized_asset',assetVersion:'1'})),
    safe(() => json('https://api.backed.fi/api/v2/public/assets/SPYx/multiplier?network=XLayer'))
  ]).then(([exchangeAsset, issuerMultiplier]) => Object.assign(report,{exchangeAsset,issuerMultiplier}));
  for (let i=0; i<6; i++) {
    const startedAt = new Date().toISOString();
    const params = {pair,assetVersion:'1',asset_class:'tokenized_asset',count:'10'};
    const [depth,trades,usdc,xlayer] = await Promise.all([
      safe(() => kraken('Depth',params)), safe(() => kraken('Trades',params)),
      safe(() => kraken('Trades',{pair:'USDCUSD',count:'1'})),
      i===0 || i===5 ? safe(chain) : Promise.resolve(null)
    ]);
    const book = Object.values(depth)[0];
    const rows = Object.entries(trades).find(([k]) => k!=='last')?.[1];
    report.samples.push({startedAt, completedAt:new Date().toISOString(), depth:depth.error ? depth : book, lastTrade:Array.isArray(rows) ? rows.at(-1) : trades, usdc, ...(xlayer ? {xlayer} : {})});
    if (i<5) await new Promise(resolve => setTimeout(resolve,10000));
  }
  await metadata;
} catch(e) { report.error = e.message; }
finally { socket?.close(); clearTimeout(deadline); report.completedAt = new Date().toISOString(); finish(); }
