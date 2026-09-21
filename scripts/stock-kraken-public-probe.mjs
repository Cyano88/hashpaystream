// Public market data only. No credentials, app imports, or account operations.
const marker = 'HPS_STOCK_REMOTE_PROBE_20260912';
const deadline = setTimeout(() => { console.log(marker + ' ' + JSON.stringify({ error: '75s deadline exceeded', productionReady: false })); process.exit(1); }, 75000);
const report = { observedAt: new Date().toISOString(), productionReady: false, wrapperUnitsVerified: false };
async function get(endpoint, params) {
  const url = new URL('https://api.kraken.com/0/public/' + endpoint);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error(endpoint + ' HTTP ' + response.status);
  let body = '';
  for await (const chunk of response.body) {
    body += Buffer.from(chunk).toString('utf8');
    if (body.length > 2000000) throw new Error('Response too large');
  }
  const data = JSON.parse(body);
  if (!Array.isArray(data.error) || data.error.length || !data.result) throw new Error(endpoint + ' invalid response: ' + JSON.stringify(data.error));
  return data.result;
}
try {
  const pairs = await get('AssetPairs', { aclass_base: 'tokenized_asset', assetVersion: '1' });
  const match = Object.entries(pairs).find(([key, p]) => /^spyx\/usd$/i.test(key) && /^spyx$/i.test(p.base) && p.quote === 'USD');
  if (!match) throw new Error('SPYx/USD absent from tokenized asset catalog');
  const [key, p] = match;
  report.pair = { key, altname: p.altname, wsname: p.wsname, base: p.base, quote: p.quote, status: p.status, aclass_base: p.aclass_base };
  const params = { pair: p.altname, assetVersion: '1', asset_class: 'tokenized_asset', count: '10' };
  const results = await Promise.allSettled([get('Depth', params), get('Trades', params)]);
  for (const [index, result] of results.entries()) {
    const name = index === 0 ? 'depth' : 'trades';
    report[name] = result.status === 'fulfilled' ? result.value : { error: result.reason.message };
  }
  report.completedAt = new Date().toISOString();
} catch (error) { report.error = error.message; }
finally { clearTimeout(deadline); console.log(marker + ' ' + JSON.stringify(report)); }
