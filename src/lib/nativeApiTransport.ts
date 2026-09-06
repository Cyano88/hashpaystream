import { Capacitor, CapacitorHttp } from '@capacitor/core'

const API_PATH_PREFIX = '/api/hashpaystream'
// https://hashpaystream.app remains the local Capacitor origin; native API traffic uses the resolvable backend host.
const PRODUCTION_ORIGIN = 'https://hashpaystream.onrender.com'
const TRADE_PILOT_ORIGIN = String(import.meta.env.VITE_HASHPAYSTREAM_TRADE_API_ORIGIN ?? '').trim()
if (TRADE_PILOT_ORIGIN && TRADE_PILOT_ORIGIN !== 'https://hashpaystream-trade-pilot.onrender.com') throw new Error('Invalid Trade pilot origin')
let installed = false

function abortError() {
  return new DOMException('The request was aborted.', 'AbortError')
}

function responseBody(data: unknown) {
  if (data === undefined || data === null) return ''
  return typeof data === 'string' ? data : JSON.stringify(data)
}

export function installNativeApiTransport() {
  if (installed || !Capacitor.isNativePlatform()) return
  installed = true

  const browserFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const source = input instanceof Request ? input.url : String(input)
    const requestedUrl = new URL(source, window.location.href)
    const isLocalHashPayStreamApi = requestedUrl.origin === window.location.origin
      && requestedUrl.pathname.startsWith(API_PATH_PREFIX)
    if (!isLocalHashPayStreamApi) return browserFetch(input, init)
    if (init.signal?.aborted) throw abortError()

    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    const rawBody = init.body ?? (input instanceof Request ? await input.clone().text() : undefined)
    const contentType = headers.get('content-type') ?? ''
    let data: unknown = rawBody
    if (typeof rawBody === 'string' && contentType.toLowerCase().includes('application/json')) {
      try { data = JSON.parse(rawBody) } catch { data = rawBody }
    }

    const nativeResponse = await CapacitorHttp.request({
      url: `${TRADE_PILOT_ORIGIN && requestedUrl.pathname.startsWith('/api/hashpaystream/v1/trade/') ? TRADE_PILOT_ORIGIN : PRODUCTION_ORIGIN}${requestedUrl.pathname}${requestedUrl.search}`,
      method,
      headers: Object.fromEntries(headers.entries()),
      ...(rawBody === undefined || method === 'GET' || method === 'HEAD' ? {} : { data }),
      connectTimeout: 15_000,
      readTimeout: 30_000,
      responseType: 'json',
    })
    if (init.signal?.aborted) throw abortError()

    const responseHeaders = new Headers()
    Object.entries(nativeResponse.headers ?? {}).forEach(([key, value]) => responseHeaders.set(key, String(value)))
    if (!responseHeaders.has('content-type')) responseHeaders.set('content-type', 'application/json; charset=utf-8')
    const body = responseBody(nativeResponse.data)
    return new Response(nativeResponse.status === 204 || nativeResponse.status === 205 ? null : body, {
      status: nativeResponse.status,
      headers: responseHeaders,
    })
  }
}
