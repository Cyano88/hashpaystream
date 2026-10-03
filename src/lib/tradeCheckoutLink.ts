export function isTradeCheckoutUrl(checkout:unknown):checkout is string {
  return typeof checkout==='string'&&/^https:\/\/app\.hashpaylink\.com\/agreements\/(?:xstocks\/xag_|trade\/tag_)[a-f0-9]{64}$/.test(checkout)
}
export function tradeCheckoutLink(checkout: string, thread: string): string {
  if (!isTradeCheckoutUrl(checkout)) throw Error('Invalid checkout link.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(thread)) return checkout;
  const url = new URL(checkout);
  url.searchParams.set('returnTo', 'https://hashpaystream.app/trade?view=enquiries&conversation=' + encodeURIComponent(thread));
  return url.toString();
}
