import { ref } from 'vue'
import type { ConnectionGroup } from './useSessionManager'

export function useLatencyState(deps: {
  getGroupBySessionId: (sessionId: string) => ConnectionGroup | null
}) {
  const latencyMap = ref<Record<string, number>>({})
  const sessionLatencyMap = ref<Record<string, number>>({})
  const latencyEnabled = ref(true)
  const latencyIntervalMs = ref(10000)

  function onLatency(sessionId: string, ms: number) {
    if (!latencyEnabled.value) return
    sessionLatencyMap.value[sessionId] = ms
    const group = deps.getGroupBySessionId(sessionId)
    if (group) {
      latencyMap.value[group.connectionId] = ms
    }
  }

  function clearSessionLatency(sessionId: string) {
    if (sessionId in sessionLatencyMap.value) {
      delete sessionLatencyMap.value[sessionId]
    }
  }

  function handleLatencySettingsChange(e: Event) {
    const detail = (e as CustomEvent).detail
    if (detail && detail.enabled !== undefined) {
      latencyEnabled.value = detail.enabled
    }
    if (detail && detail.intervalMs !== undefined) {
      latencyIntervalMs.value = detail.intervalMs
    }
  }

  return {
    latencyMap,
    sessionLatencyMap,
    latencyEnabled,
    latencyIntervalMs,
    onLatency,
    clearSessionLatency,
    handleLatencySettingsChange,
  }
}
