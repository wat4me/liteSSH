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

let dataBuffer = ''
let flushTimer: ReturnType<typeof setTimeout> | null = null
let localEchoBuffer = ''
let echoTimeout: ReturnType<typeof setTimeout> | null = null

function isLocallyEchoable(data: string): boolean {
  if (data.length === 0) return false
  if (data.charCodeAt(0) === 0x1b) return false
  for (const ch of data) {
    const code = ch.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return false
  }
  return true
}

function suppressEcho(data: string): string {
  if (localEchoBuffer.length === 0) return data

  let dataPos = 0
  let echoPos = 0

  while (dataPos < data.length && echoPos < localEchoBuffer.length) {
    if (data[dataPos] === '\x1b') {
      const csi = data.substring(dataPos).match(/^\x1b\[[\d;]*[A-Za-z]/)
      if (csi) {
        dataPos += csi[0].length
        continue
      }
      const ss3 = data.substring(dataPos).match(/^\x1b[O\[(]./)
      if (ss3) {
        dataPos += ss3[0].length
        continue
      }
    }
    if (data[dataPos] === localEchoBuffer[echoPos]) {
      dataPos++
      echoPos++
    } else {
      localEchoBuffer = ''
      return data
    }
  }

  localEchoBuffer = localEchoBuffer.substring(echoPos)
  return data.substring(dataPos)
}

function flushDataBuffer() {
  flushTimer = null
  if (!terminal || dataBuffer.length === 0) {
    dataBuffer = ''
    return
  }
  const remaining = suppressEcho(dataBuffer)
  dataBuffer = ''
  if (remaining.length > 0) {
    terminal.write(remaining)
  }
}

function appendData(data: string) {
  dataBuffer += data
  if (flushTimer === null) {
    flushTimer = setTimeout(flushDataBuffer, 0)
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
    if (isLocallyEchoable(data)) {
      localEchoBuffer += data
      terminal!.write(data)
      if (echoTimeout) clearTimeout(echoTimeout)
      echoTimeout = setTimeout(() => {
        localEchoBuffer = ''
        echoTimeout = null
      }, 1000)
    }
    window.liteSSH.sshWrite(props.sessionId, data)
  })

  unsubData = window.liteSSH.onSshData((sessionId, data) => {
    if (sessionId === props.sessionId) {
      appendData(data)
    }
  })

  unsubClosed = window.liteSSH.onSshClosed((sessionId) => {
    if (sessionId === props.sessionId && terminal) {
      flushDataBuffer()
      terminal.writeln('\r\n\x1b[1;31m--- Connection closed ---\x1b[0m')
      emit('closed', sessionId)
    }
  })

  unsubError = window.liteSSH.onSshError((sessionId, error) => {
    if (sessionId === props.sessionId && terminal) {
      flushDataBuffer()
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
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
  }
  if (echoTimeout !== null) {
    clearTimeout(echoTimeout)
  }
  dataBuffer = ''
  localEchoBuffer = ''
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
