<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, inject } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { getTerminalColors } from '../composables/useTheme'
import type { Theme } from '../composables/useTheme'

const props = defineProps<{
  sessionId: string
  connectionName: string
}>()

const emit = defineEmits<{
  (e: 'closed', sessionId: string): void
}>()

const terminalRef = ref<HTMLDivElement>()
const theme = inject<import('vue').Ref<Theme>>('theme')!
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let unsubData: (() => void) | null = null
let unsubClosed: (() => void) | null = null
let unsubError: (() => void) | null = null

let pendingData: string[] = []
let rafId: number | null = null

function flushPendingData() {
  rafId = null
  if (!terminal || pendingData.length === 0) {
    pendingData.length = 0
    return
  }
  if (pendingData.length === 1) {
    terminal.write(pendingData[0])
  } else {
    terminal.write(pendingData.join(''))
  }
  pendingData.length = 0
}

function scheduleFlush() {
  if (rafId === null) {
    rafId = requestAnimationFrame(flushPendingData)
  }
}

onMounted(async () => {
  if (!terminalRef.value) return

  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Cascadia Code, Fira Code, Consolas, Courier New, monospace',
    theme: getTerminalColors(theme.value),
    allowProposedApi: true,
    scrollback: 5000,
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  terminal.open(terminalRef.value)
  terminal.writeln(`\x1b[1;34mConnecting to ${props.connectionName}...\x1b[0m\r\n`)

  terminal.onData((data) => {
    window.liteSSH.sshWrite(props.sessionId, data)
  })

  unsubData = window.liteSSH.onSshData((sessionId, data) => {
    if (sessionId === props.sessionId) {
      pendingData.push(data)
      scheduleFlush()
    }
  })

  unsubClosed = window.liteSSH.onSshClosed((sessionId) => {
    if (sessionId === props.sessionId && terminal) {
      flushPendingData()
      terminal.writeln('\r\n\x1b[1;31m--- Connection closed ---\x1b[0m')
      emit('closed', sessionId)
    }
  })

  unsubError = window.liteSSH.onSshError((sessionId, error) => {
    if (sessionId === props.sessionId && terminal) {
      flushPendingData()
      terminal.writeln(`\r\n\x1b[1;31m--- Error: ${error} ---\x1b[0m`)
    }
  })

  await nextTick()
  if (fitAddon) {
    fitAddon.fit()
    const dims = fitAddon.proposeDimensions()
    if (dims) {
      window.liteSSH.sshResize(props.sessionId, dims.cols, dims.rows)
    }
  }

  terminal.focus()

  const resizeObserver = new ResizeObserver(() => {
    if (fitAddon && terminal) {
      try {
        fitAddon.fit()
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          window.liteSSH.sshResize(props.sessionId, dims.cols, dims.rows)
        }
      } catch {}
    }
  })
  resizeObserver.observe(terminalRef.value)

  onBeforeUnmount(() => {
    resizeObserver.disconnect()
  })
})

onBeforeUnmount(() => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
  }
  pendingData.length = 0
  unsubData?.()
  unsubClosed?.()
  unsubError?.()
  terminal?.dispose()
})
</script>

<template>
  <div ref="terminalRef" class="xterm-container"></div>
</template>

<style scoped>
.xterm-container {
  width: 100%;
  height: 100%;
  padding: 4px;
}
</style>
