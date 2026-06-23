import { ref, computed } from 'vue'

export interface BatchCommandTarget {
  id: string
  connectionName: string
  sshAddress: string
  tabNumber: number
  terminalLabel: string
  displayName: string
}

export interface BatchCommandResult {
  sessionId: string
  connectionName: string
  sshAddress: string
  tabNumber: number
  terminalLabel: string
  displayName: string
  command: string
  output: string
  status: 'pending' | 'running' | 'success' | 'error'
  error?: string
  startedAt?: number
  completedAt?: number
}

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b[()][AB012]/g, '')
    .replace(/\x0f|\x0e/g, '')
    .replace(/\r/g, '')
}

export function useBatchCommand() {
  const results = ref<BatchCommandResult[]>([])
  const isRunning = ref(false)
  const command = ref('')

  const hasResults = computed(() => results.value.length > 0)
  const successCount = computed(() => results.value.filter(r => r.status === 'success').length)
  const errorCount = computed(() => results.value.filter(r => r.status === 'error').length)
  const pendingCount = computed(() => results.value.filter(r => r.status === 'pending' || r.status === 'running').length)

  async function executeBatch(
    sessions: BatchCommandTarget[],
    cmd: string,
    timeoutMs = 30000
  ) {
    if (!cmd.trim() || sessions.length === 0) return

    isRunning.value = true
    command.value = cmd
    results.value = sessions.map(s => ({
      sessionId: s.id,
      connectionName: s.connectionName,
      sshAddress: s.sshAddress,
      tabNumber: s.tabNumber,
      terminalLabel: s.terminalLabel,
      displayName: s.displayName,
      command: cmd,
      output: '',
      status: 'pending' as const,
    }))

    const promises = results.value.map(async (result) => {
      result.status = 'running'
      result.startedAt = Date.now()

      try {
        const output = await window.liteSSH.sshExec(result.sessionId, cmd, timeoutMs)
        result.output = stripAnsi(output)
        result.status = 'success'
      } catch (err: any) {
        result.error = err.message || 'Command failed'
        result.output = stripAnsi(result.error || '')
        result.status = 'error'
      }
      result.completedAt = Date.now()
    })

    await Promise.all(promises)
    isRunning.value = false
  }

  function clearResults() {
    results.value = []
    command.value = ''
  }

  return {
    results,
    isRunning,
    command,
    hasResults,
    successCount,
    errorCount,
    pendingCount,
    executeBatch,
    clearResults,
  }
}
