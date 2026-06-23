export function useTerminalLatency(deps: {
  sessionId: string
  onLatency: (ms: number) => void
}) {
  let lastKeyTime = 0
  let awaitingEcho = false
  let lastLatencyReportTime = 0
  let latestKeystrokeLatency = -1
  let currentRttMs = -1
  let bgLatencyTimer: ReturnType<typeof setInterval> | null = null

  const LATENCY_REPORT_INTERVAL_MS = 10000

  function reportLatency(ms: number) {
    currentRttMs = ms
    const now = performance.now()
    if (now - lastLatencyReportTime >= LATENCY_REPORT_INTERVAL_MS || lastLatencyReportTime === 0) {
      deps.onLatency(ms)
      lastLatencyReportTime = now
      latestKeystrokeLatency = -1
    }
  }

  function getCurrentRtt(): number {
    return currentRttMs
  }

  function onKeystroke() {
    lastKeyTime = performance.now()
    awaitingEcho = true
  }

  function onDataReceived() {
    if (awaitingEcho) {
      latestKeystrokeLatency = Math.round(performance.now() - lastKeyTime)
      reportLatency(latestKeystrokeLatency)
      awaitingEcho = false
    }
  }

  function startBackgroundMonitor() {
    if (bgLatencyTimer) return

    window.liteSSH.sshMeasureLatency(deps.sessionId).then(reportLatency).catch(() => {})

    bgLatencyTimer = setInterval(async () => {
      if (performance.now() - lastLatencyReportTime < LATENCY_REPORT_INTERVAL_MS) return
      if (latestKeystrokeLatency !== -1) {
        reportLatency(latestKeystrokeLatency)
        return
      }
      try {
        const ms = await window.liteSSH.sshMeasureLatency(deps.sessionId)
        reportLatency(ms)
      } catch {}
    }, LATENCY_REPORT_INTERVAL_MS)
  }

  function stopBackgroundMonitor() {
    if (bgLatencyTimer) {
      clearInterval(bgLatencyTimer)
      bgLatencyTimer = null
    }
  }

  function reset() {
    lastKeyTime = 0
    awaitingEcho = false
    lastLatencyReportTime = 0
    latestKeystrokeLatency = -1
    currentRttMs = -1
  }

  return {
    onKeystroke,
    onDataReceived,
    startBackgroundMonitor,
    stopBackgroundMonitor,
    reportLatency,
    getCurrentRtt,
    reset,
  }
}
