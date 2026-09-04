import type { SettlementPassResult } from './upfront-settlement-worker.js'

export type SettlementLease = {
  acquired: boolean
  release: () => Promise<void>
}

export type SettlementDaemonDependencies = {
  acquireLease: () => Promise<SettlementLease>
  runPass: () => Promise<SettlementPassResult>
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  cancel: (timer: ReturnType<typeof setTimeout>) => void
  log: (event: Record<string, unknown>) => void
}

export type SettlementDaemon = {
  start: () => void
  stop: () => Promise<void>
  trigger: () => void
}

function boundedDelay(baseIntervalMs: number, consecutiveDeferredPasses: number) {
  const base = Math.min(300_000, Math.max(10_000, baseIntervalMs))
  if (consecutiveDeferredPasses <= 0) return base
  return Math.min(300_000, base * (2 ** Math.min(consecutiveDeferredPasses - 1, 4)))
}

export function createUpfrontSettlementDaemon(
  dependencies: SettlementDaemonDependencies,
  intervalMs = 30_000,
): SettlementDaemon {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined
  let stopped = true
  let rerun = false
  let consecutiveDeferredPasses = 0
  let lastReport = ''

  const scheduleNext = (delayMs: number) => {
    if (stopped) return
    if (timer) dependencies.cancel(timer)
    timer = dependencies.schedule(() => {
      timer = undefined
      void tick()
    }, delayMs)
    timer.unref?.()
  }

  const execute = async () => {
    const lease = await dependencies.acquireLease()
    if (!lease.acquired) {
      scheduleNext(boundedDelay(intervalMs, 0))
      return
    }
    try {
      const result = await dependencies.runPass()
      consecutiveDeferredPasses = result.deferred > 0
        ? consecutiveDeferredPasses + 1
        : 0
      const report = JSON.stringify({
        eligible: result.eligible,
        settled: result.settled,
        alreadySettled: result.alreadySettled,
        deferred: result.deferred,
        codes: result.codes,
      })
      if (result.settled > 0 || result.alreadySettled > 0 || (result.deferred > 0 && report !== lastReport)) {
        dependencies.log({
          component: 'hashpaystream-upfront-settlement-daemon',
          event: result.deferred > 0 ? 'settlement_deferred' : 'settlement_pass_completed',
          ...result,
        })
      }
      lastReport = report
    } finally {
      await lease.release()
    }
    if (!stopped) {
      const delay = rerun ? 0 : boundedDelay(intervalMs, consecutiveDeferredPasses)
      rerun = false
      scheduleNext(delay)
    }
  }

  const tick = async () => {
    if (stopped) return
    if (running) {
      rerun = true
      return
    }
    running = execute().catch(reason => {
      consecutiveDeferredPasses += 1
      dependencies.log({
        component: 'hashpaystream-upfront-settlement-daemon',
        event: 'worker_pass_failed',
        code: reason instanceof Error && /^[A-Z0-9_]{3,80}$/.test(reason.message)
          ? reason.message
          : 'SETTLEMENT_WORKER_FAILED',
      })
      if (!stopped) scheduleNext(boundedDelay(intervalMs, consecutiveDeferredPasses))
    }).finally(() => {
      running = undefined
    })
    await running
  }

  return {
    start: () => {
      if (!stopped) return
      stopped = false
      void tick()
    },
    trigger: () => {
      if (stopped) return
      void tick()
    },
    stop: async () => {
      stopped = true
      rerun = false
      if (timer) {
        dependencies.cancel(timer)
        timer = undefined
      }
      await running
    },
  }
}
