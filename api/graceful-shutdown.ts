export type ShutdownSignal = 'SIGTERM' | 'SIGINT'

type ShutdownServer = {
  close: (callback: (error?: Error) => void) => void
  closeIdleConnections?: () => void
  closeAllConnections?: () => void
}

type ShutdownEvent = {
  component: 'hashpaystream-lifecycle'
  event: 'shutdown_started' | 'shutdown_complete' | 'shutdown_failed' | 'shutdown_forced'
  signal: ShutdownSignal
  graceMs?: number
}

export type GracefulShutdownDependencies = {
  server: ShutdownServer
  onDraining: () => void
  schedule: typeof setTimeout
  cancel: typeof clearTimeout
  exit: (code: number) => void
  log: (event: ShutdownEvent) => void
}

function safeLog(log: GracefulShutdownDependencies['log'], event: ShutdownEvent) {
  try {
    log(event)
  } catch {
    // Logging must never interfere with process shutdown.
  }
}

export function createHashPayStreamShutdown(
  dependencies: GracefulShutdownDependencies,
  graceMs = 25_000,
) {
  let started = false

  return function shutdown(signal: ShutdownSignal) {
    if (started) return false
    started = true
    dependencies.onDraining()
    safeLog(dependencies.log, {
      component: 'hashpaystream-lifecycle',
      event: 'shutdown_started',
      signal,
      graceMs,
    })

    let settled = false
    const timer = dependencies.schedule(() => {
      if (settled) return
      settled = true
      safeLog(dependencies.log, {
        component: 'hashpaystream-lifecycle',
        event: 'shutdown_forced',
        signal,
        graceMs,
      })
      try {
        dependencies.server.closeAllConnections?.()
      } catch {
        // Exit still proceeds if the runtime cannot close connections explicitly.
      }
      dependencies.exit(1)
    }, graceMs)
    timer.unref?.()

    try {
      dependencies.server.close(error => {
        if (settled) return
        settled = true
        dependencies.cancel(timer)
        if (error) {
          safeLog(dependencies.log, {
            component: 'hashpaystream-lifecycle',
            event: 'shutdown_failed',
            signal,
          })
          dependencies.exit(1)
          return
        }
        safeLog(dependencies.log, {
          component: 'hashpaystream-lifecycle',
          event: 'shutdown_complete',
          signal,
        })
        dependencies.exit(0)
      })
      try {
        dependencies.server.closeIdleConnections?.()
      } catch {
        // Active requests can still drain through server.close().
      }
    } catch {
      if (!settled) {
        settled = true
        dependencies.cancel(timer)
        safeLog(dependencies.log, {
          component: 'hashpaystream-lifecycle',
          event: 'shutdown_failed',
          signal,
        })
        dependencies.exit(1)
      }
    }
    return true
  }
}
