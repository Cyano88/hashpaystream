// Circle's iframe must not overtake the application's launch wordmark.
export function waitForLaunchSurface(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { observer.disconnect(); signal.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(new Error('Wallet verification cancelled.')) }
    const check = () => { if (!document.querySelector('.hashpaystream-reference-launch')) { cleanup(); resolve() } }
    const observer = new MutationObserver(check)
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    observer.observe(document.body, { childList: true, subtree: true })
    check()
  })
}
