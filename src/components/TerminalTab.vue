<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, inject, watch } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { getTerminalColors } from '../composables/useTheme'
import type { Theme } from '../composables/useTheme'
import type { CustomColors } from '../composables/useTheme'

const props = defineProps<{
  sessionId: string
  connectionName: string
  isActive: boolean
}>()

const emit = defineEmits<{
  (e: 'closed', sessionId: string): void
  (e: 'cdCommand', sessionId: string, command: string): void
  (e: 'commandSubmitted', sessionId: string, command: string): void
}>()

const terminalRef = ref<HTMLDivElement>()
const theme = inject<import('vue').Ref<Theme>>('theme')!
const customColors = inject<import('vue').Ref<CustomColors>>('customColors')!
let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let unsubData: (() => void) | null = null
let unsubClosed: (() => void) | null = null
let unsubError: (() => void) | null = null
let commandBuffer = ''
let pendingLocalEcho = ''
let pendingSubmitTimer: ReturnType<typeof setTimeout> | null = null
const ENABLE_OPTIMISTIC_LOCAL_ECHO = true
const MAX_PENDING_LOCAL_ECHO = 1024

function isLocallyEchoable(data: string): boolean {
  if (data.length === 0) return false
  if (data.charCodeAt(0) === 0x1b) return false
  for (const ch of data) {
    const code = ch.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return false
  }
  return true
}

function getCommonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length)
  let i = 0
  while (i < len && a[i] === b[i]) i++
  return i
}

function appendPendingLocalEcho(data: string) {
  pendingLocalEcho += data
  if (pendingLocalEcho.length > MAX_PENDING_LOCAL_ECHO) {
    pendingLocalEcho = pendingLocalEcho.slice(-MAX_PENDING_LOCAL_ECHO)
  }
}

function applyOptimisticLocalEcho(data: string) {
  if (!ENABLE_OPTIMISTIC_LOCAL_ECHO || !terminal) return
  if (!isLocallyEchoable(data)) return
  terminal.write(data)
  appendPendingLocalEcho(data)
}

function reconcileRemoteData(data: string): string {
  if (!ENABLE_OPTIMISTIC_LOCAL_ECHO || pendingLocalEcho.length === 0 || data.length === 0) {
    return data
  }

  const consumed = getCommonPrefixLength(pendingLocalEcho, data)
  if (consumed > 0) {
    pendingLocalEcho = pendingLocalEcho.slice(consumed)
    return data.slice(consumed)
  }

  // If remote output no longer matches optimistic echo, trust remote stream and reset local prediction.
  pendingLocalEcho = ''
  return data
}

function getVisibleCommandLine(): string {
  if (!terminal) return ''
  try {
    const activeBuffer = (terminal as any).buffer?.active
    if (!activeBuffer) return ''
    const line = activeBuffer.getLine(activeBuffer.baseY + activeBuffer.cursorY)
    return line?.translateToString(true) ?? ''
  } catch {
    return ''
  }
}

function inferSubmittedCommand(command: string): string {
  const trimmedCommand = command.trim()
  if (!trimmedCommand) return trimmedCommand
  const visibleLine = getVisibleCommandLine()
  if (!visibleLine) return trimmedCommand
  const commandStart = visibleLine.lastIndexOf(trimmedCommand)
  if (commandStart !== -1) {
    return visibleLine.slice(commandStart).trim()
  }

  const firstToken = trimmedCommand.split(/\s+/)[0]
  if (!firstToken) return trimmedCommand

  const tokenWithSpaces = ` ${firstToken} `
  const tokenAtEnd = ` ${firstToken}`
  const exactAtStart = visibleLine.startsWith(firstToken) ? 0 : -1
  const withSpacesIndex = visibleLine.lastIndexOf(tokenWithSpaces)
  const atEndIndex = visibleLine.endsWith(tokenAtEnd) ? visibleLine.length - tokenAtEnd.length : -1

  let fallbackStart = -1
  if (withSpacesIndex !== -1) {
    fallbackStart = withSpacesIndex + 1
  } else if (atEndIndex !== -1) {
    fallbackStart = atEndIndex + 1
  } else if (exactAtStart === 0) {
    fallbackStart = 0
  }

  if (fallbackStart !== -1) {
    const visibleCommand = visibleLine.slice(fallbackStart).trim()
    if (visibleCommand.startsWith(firstToken)) {
      return visibleCommand
    }
  }

  return trimmedCommand
}

function submitBufferedCommand() {
  const cmd = inferSubmittedCommand(commandBuffer)
  if (cmd.length > 0) {
    emit('commandSubmitted', props.sessionId, cmd)
  }
  if (/(?:^|[;&|]\s*)cd(?:\s|$)/.test(cmd)) {
    emit('cdCommand', props.sessionId, cmd)
  }
  commandBuffer = ''
  pendingSubmitTimer = null
}

watch(() => props.isActive, (newValue, oldValue) => {
  if (newValue && !oldValue && terminal && fitAddon) {
    requestAnimationFrame(() => {
      nextTick(() => {
        if (terminal && fitAddon && terminalRef.value) {
          try {
            fitAddon.fit()
            terminal.refresh(0, terminal.rows - 1)
          } catch {}
        }
      })
    })
  }
})

onMounted(async () => {
  if (!terminalRef.value) return

  terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Cascadia Code, Fira Code, Consolas, Courier New, monospace',
    theme: getTerminalColors(theme.value, customColors.value),
    allowProposedApi: true,
    scrollback: 5000,
  })

  fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  terminal.open(terminalRef.value)
  terminal.writeln(`\x1b[1;34mConnecting to ${props.connectionName}...\x1b[0m\r\n`)

  terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    if (event.type !== 'keydown') return true

    const ctrlOrCmd = event.ctrlKey || event.metaKey

    if (ctrlOrCmd && event.key === 'v') {
      event.preventDefault()
      window.liteSSH.clipboardReadText().then((text: string) => {
        if (text && terminal) {
          const processed = text.replace(/\r\n|\n/g, '\r')
          window.liteSSH.sshWrite(props.sessionId, processed)
        }
      }).catch(() => {})
      return false
    }

    if (event.ctrlKey && !event.metaKey && event.key === 'c') {
      if (terminal && terminal.hasSelection()) {
        event.preventDefault()
        const text = terminal.getSelection()
        window.liteSSH.clipboardWriteText(text).catch(() => {})
        return false
      }
      return true
    }

    if (event.metaKey && !event.ctrlKey && event.key === 'c') {
      if (terminal && terminal.hasSelection()) {
        event.preventDefault()
        const text = terminal.getSelection()
        window.liteSSH.clipboardWriteText(text).catch(() => {})
      }
      return false
    }

    return true
  })

  terminal.onData((data) => {
    if (data === '\r' || data === '\n') {
      if (pendingSubmitTimer) {
        clearTimeout(pendingSubmitTimer)
      }
      pendingSubmitTimer = setTimeout(() => {
        submitBufferedCommand()
      }, 20)
    } else if (data === '\x03' || data === '\x15') {
      if (pendingSubmitTimer) {
        clearTimeout(pendingSubmitTimer)
        pendingSubmitTimer = null
      }
      commandBuffer = ''
    } else if (data === '\x7f' || data === '\x08') {
      if (commandBuffer.length > 0) commandBuffer = commandBuffer.slice(0, -1)
      if (ENABLE_OPTIMISTIC_LOCAL_ECHO && pendingLocalEcho.length > 0 && terminal) {
        pendingLocalEcho = pendingLocalEcho.slice(0, -1)
        terminal.write('\b \b')
      }
    } else if (data === '\x17') {
      commandBuffer = commandBuffer.replace(/\S+\s*$/, '')
    } else if (isLocallyEchoable(data)) {
      commandBuffer += data
    } else if (data.charCodeAt(0) === 0x1b) {
      commandBuffer = ''
    } else {
    }

    applyOptimisticLocalEcho(data)
    window.liteSSH.sshWrite(props.sessionId, data)
  })

  unsubData = window.liteSSH.onSshData((sessionId, data) => {
    if (sessionId === props.sessionId && terminal) {
      const renderData = reconcileRemoteData(data)
      if (renderData.length > 0) {
        terminal.write(renderData)
      }
    }
  })

  unsubClosed = window.liteSSH.onSshClosed((sessionId) => {
    if (sessionId === props.sessionId && terminal) {
      terminal.writeln('\r\n\x1b[1;31m--- Connection closed ---\x1b[0m')
      emit('closed', sessionId)
    }
  })

  unsubError = window.liteSSH.onSshError((sessionId, error) => {
    if (sessionId === props.sessionId && terminal) {
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
      if (!terminalRef.value || terminalRef.value.offsetWidth === 0) return
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
  if (pendingSubmitTimer) {
    clearTimeout(pendingSubmitTimer)
    pendingSubmitTimer = null
  }
  commandBuffer = ''
  pendingLocalEcho = ''
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
