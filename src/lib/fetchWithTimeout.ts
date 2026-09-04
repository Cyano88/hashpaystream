const DEFAULT_TIMEOUT_MS = 20_000

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
) {
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(init.signal?.reason)
  init.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new Error('The connection took too long. Try again.')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
    init.signal?.removeEventListener('abort', abortFromCaller)
  }
}
