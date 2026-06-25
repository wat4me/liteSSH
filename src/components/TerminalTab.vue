<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick, inject } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { getTerminalColors } from '../composables/useTheme'
import type { Theme, CustomColors } from '../composables/useTheme'
import { usePasteDetection } from '../composables/usePasteDetection'
import { useCommandBuffer } from '../composables/useCommandBuffer'
import { useRenderBatch } from '../composables/useRenderBatch'
import { useWriteQueue } from '../composables/useWriteQueue'
import { useTerminalPwdQuery } from '../composables/useTerminalPwdQuery'
import { useTerminalSearch } from '../composables/useTerminalSearch'
import { useTerminalKeyHandler } from '../composables/useTerminalKeyHandler'
import { useTerminalLatency } from '../composables/useTerminalLatency'

const props = defineProps<{
  sessionId: string
  connectionName: string
  connectionId: string
}>()

const emit = defineEmits<{
  (e: 'closed', sessionId: string): void
  (e: 'cdCommand', sessionId: string, command: string): void
  (e: 'pwdOutput', sessionId: string, pwd: string): void
  (e: 'reconnect', connectionId: string): void
  (e: 'latency', sessionId: string, ms: number): void
  (e: 'aiSelection', text: string, mode: 'send' | 'insert'): void
}>()

const terminalRef = ref<HTMLDivElement>()
const theme = inject<import('vue').Ref<Theme>>('theme')!
const customColors = inject<import('vue').Ref<CustomColors>>('customColors')!

let terminal: Terminal | null = null
let fitAddon: FitAddon | null = null
let searchAddon: SearchAddon | null = null
const disconnected = ref(false)
const fontSize = ref(14)
const selectionMenuVisible = ref(false)
const selectionMenuX = ref(0)
const selectionMenuY = ref(0)
const selectedText = ref('')
let resizeObserver: ResizeObserver | null = null
let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null
let unsubData: (() => void) | null = null
let unsubClosed: (() => void) | null = null
let unsubError: (() => void) | null = null

const getTerminal = () => terminal
const getSearchAddon = () => searchAddon

const { updatePasteState, isPasting } = usePasteDetection()

const {
  commandBuffer,
  commandBufferDirty,
  capturedSubmitLine,
  submitBufferedCommand,
  getVisibleCommandLine,
  scheduleSubmit,
  cancelPendingSubmit,
  resetCommandBuffer,
} = useCommandBuffer({
  getTerminal,
  onCdCommand: (cmd) => emit('cdCommand', props.sessionId, cmd),
})

const {
  flushRenderBatch,
  scheduleRenderFlush,
  appendRenderBatch,
  resetRenderBatch,
} = useRenderBatch(getTerminal)

const {
  enqueueWrite,
  clearWriteQueue,
  getWriteQueueLength,
} = useWriteQueue()

const {
  processPwdQueryData,
  requestInteractivePwd,
  dispose: disposePwdQuery,
} = useTerminalPwdQuery({
  getTerminal,
  flushRenderBatch,
  writeToSsh: (data) => window.liteSSH.sshWrite(props.sessionId, data),
  onPwdOutput: (pwd) => emit('pwdOutput', props.sessionId, pwd),
})

const {
  searchVisible,
  searchQuery,
  setSearchInputRef,
  toggleSearch,
  onSearchInput,
  onSearchKeydown,
} = useTerminalSearch({ getTerminal, getSearchAddon })

const {
  onKeystroke,
  onDataReceived,
  startBackgroundMonitor,
  stopBackgroundMonitor,
} = useTerminalLatency({
  sessionId: props.sessionId,
  onLatency: (ms) => emit('latency', props.sessionId, ms),
})

const { handleKey } = useTerminalKeyHandler({
  getTerminal,
  getFontSize: () => fontSize.value,
  setFontSize: (size) => {
    fontSize.value = size
    if (terminal) terminal.options.fontSize = size
    window.liteSSH.setTerminalFontSize(size).catch(() => {})
  },
  toggleSearch,
})

function isLocallyEchoable(data: string): boolean {
  if (data.length === 0) return false
  if (data.charCodeAt(0) === 0x1b) return false
  for (const ch of data) {
    const code = ch.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return false
  }
  return true
}

let cursorPulseTimer: ReturnType<typeof setTimeout> | null = null

function pulseCursor() {
  if (!terminalRef.value) return
  terminalRef.value.classList.add('cursor-pulse')
  if (cursorPulseTimer) clearTimeout(cursorPulseTimer)
  cursorPulseTimer = setTimeout(() => {
    terminalRef.value?.classList.remove('cursor-pulse')
    cursorPulseTimer = null
  }, 120)
}

function hideSelectionMenu() {
  selectionMenuVisible.value = false
}

function openSelectionMenu(event: MouseEvent) {
  if (!terminal || !terminal.hasSelection()) return
  const text = terminal.getSelection().trim()
  if (!text) return
  event.preventDefault()
  event.stopPropagation()
  selectedText.value = text
  selectionMenuX.value = event.clientX
  selectionMenuY.value = event.clientY
  selectionMenuVisible.value = true
}

function sendSelectionToAi(mode: 'send' | 'insert') {
  const text = selectedText.value || terminal?.getSelection()?.trim() || ''
  if (!text) return
  emit('aiSelection', text, mode)
  hideSelectionMenu()
}

function performResize() {
  if (!terminal || !fitAddon || !terminalRef.value || terminalRef.value.offsetWidth === 0) return
  try {
    if (terminal.hasSelection()) {
      terminal.clearSelection()
    }
    fitAddon.fit()
    const dims = fitAddon.proposeDimensions()
    if (dims) {
      window.liteSSH.sshResize(props.sessionId, dims.cols, dims.rows)
    }
  } catch {}
}

function syncTerminalSize() {
  if (!fitAddon || !terminal || !terminalRef.value || terminalRef.value.offsetWidth === 0) return
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer)
    resizeDebounceTimer = null
  }
  resizeDebounceTimer = setTimeout(() => {
    resizeDebounceTimer = null
    if (!terminal || !fitAddon || !terminalRef.value || terminalRef.value.offsetWidth === 0) return
    flushRenderBatch(performResize)
  }, 80)
}

function handleReconnect() {
  emit('reconnect', props.connectionId)
}

function scheduleTerminalRefresh(shouldFocus = false) {
  requestAnimationFrame(() => {
    nextTick(() => {
      if (!terminal || !fitAddon || !terminalRef.value) return
      if (resizeDebounceTimer) {
        clearTimeout(resizeDebounceTimer)
        resizeDebounceTimer = null
      }
      const afterWrite = () => {
        performResize()
        try { terminal!.refresh(0, terminal!.rows - 1) } catch {}
        if (shouldFocus) {
          terminal!.focus()
        }
      }
      flushRenderBatch(afterWrite)
    })
  })
}

function attachResizeObserver() {
  if (!terminalRef.value || resizeObserver) return
  resizeObserver = new ResizeObserver(() => {
    syncTerminalSize()
  })
  resizeObserver.observe(terminalRef.value)
}

function detachResizeObserver() {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer)
    resizeDebounceTimer = null
  }
}

type TerminalPwdRequestDetail = {
  sessionId: string
  handled?: boolean
  resolve: (pwd: string) => void
  reject: (error: Error) => void
}

function onRequestTerminalPwd(event: Event) {
  const detail = (event as CustomEvent<TerminalPwdRequestDetail>).detail
  if (!detail || detail.sessionId !== props.sessionId) return
  detail.handled = true
  requestInteractivePwd().then(detail.resolve, detail.reject)
}

onActivated(() => {
  attachResizeObserver()
  scheduleTerminalRefresh(true)
})

onDeactivated(() => {
  detachResizeObserver()
})

onMounted(async () => {
  if (!terminalRef.value) return

  try {
    fontSize.value = await window.liteSSH.getTerminalFontSize()
  } catch {
    fontSize.value = 14
  }

  terminal = new Terminal({
    cursorBlink: true,
    fontSize: fontSize.value,
    fontFamily: 'Cascadia Code, Fira Code, Consolas, Courier New, monospace',
    theme: getTerminalColors(theme.value, customColors.value),
    allowProposedApi: true,
    scrollback: 5000,
  })

  fitAddon = new FitAddon()
  searchAddon = new SearchAddon()
  terminal.loadAddon(fitAddon)
  terminal.loadAddon(searchAddon)

  terminal.open(terminalRef.value)
  terminal.writeln(`\x1b[1;34mConnecting to ${props.connectionName}...\x1b[0m\r\n`)

  terminal.onScroll((newPosition: number) => {
    const bufferLength = terminal!.buffer.active.length
    if (newPosition < bufferLength - terminal!.rows && terminal!.hasSelection()) {
      terminal!.clearSelection()
    }
  })

  terminal.attachCustomKeyEventHandler(handleKey)

  terminal.onData((data) => {
    updatePasteState(data)

    if (data.length === 1 && isLocallyEchoable(data) && !isPasting()) {
      onKeystroke()
      pulseCursor()
    }

    const isSubmit = data === '\r' || data === '\n'
    const isCancel = data === '\x03' || data === '\x15'
    const isBackspace = data === '\x7f' || data === '\x08'
    const isTab = data === '\t' || data === '\x09'
    const isEscape = data.charCodeAt(0) === 0x1b
    const hasNewline = data.includes('\r') || data.includes('\n')

    if (isSubmit) {
      capturedSubmitLine.value = getVisibleCommandLine().replace(/\[Pasted[^\]]*\]\s*/g, '')
      scheduleSubmit()
    } else if (isCancel) {
      cancelPendingSubmit()
      resetCommandBuffer()
    } else if (isBackspace) {
      if (commandBuffer.value.length > 0) commandBuffer.value = commandBuffer.value.slice(0, -1)
    } else if (data === '\x17') {
      commandBuffer.value = commandBuffer.value.replace(/\S+\s*$/, '')
    } else if (isTab) {
      commandBufferDirty.value = true
    } else if (isLocallyEchoable(data) && !isPasting()) {
      commandBuffer.value += data
    } else if (isEscape) {
      commandBuffer.value = ''
      commandBufferDirty.value = true
    } else if (hasNewline) {
      commandBufferDirty.value = true
      const lines = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (/(?:^|[;&|]\s*)cd(?:\s|$)/.test(trimmed)) {
          setTimeout(() => {
            emit('cdCommand', props.sessionId, trimmed)
          }, 50)
        }
      }
      scheduleSubmit()
    }

    if (data.length > 32 || getWriteQueueLength() > 0) {
      enqueueWrite(data, props.sessionId)
    } else {
      window.liteSSH.sshWrite(props.sessionId, data)
    }
  })

  startBackgroundMonitor()

  unsubData = window.liteSSH.onSshData(props.sessionId, (data) => {
    onDataReceived()
    if (!terminal) return
    const visibleData = processPwdQueryData(data)
    if (visibleData.length > 0) {
      appendRenderBatch(visibleData)
      scheduleRenderFlush()
    }
  })

  unsubClosed = window.liteSSH.onSshClosed(props.sessionId, () => {
    flushRenderBatch()
    if (terminal) {
      terminal.writeln('\r\n\x1b[1;31m--- Connection closed ---\x1b[0m')
      disconnected.value = true
    }
  })

  unsubError = window.liteSSH.onSshError(props.sessionId, (error) => {
    flushRenderBatch()
    if (terminal) {
      terminal.writeln(`\r\n\x1b[1;31m--- Error: ${error} ---\x1b[0m`)
    }
  })

  window.addEventListener('request-terminal-pwd', onRequestTerminalPwd)
  window.addEventListener('click', hideSelectionMenu)

  await nextTick()
  attachResizeObserver()
  scheduleTerminalRefresh(true)
})

watch([theme, customColors], () => {
  if (terminal) {
    terminal.options.theme = getTerminalColors(theme.value, customColors.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('request-terminal-pwd', onRequestTerminalPwd)
  window.removeEventListener('click', hideSelectionMenu)
  disposePwdQuery()
  cancelPendingSubmit()
  stopBackgroundMonitor()
  clearWriteQueue()
  resetCommandBuffer()
  resetRenderBatch()
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer)
    resizeDebounceTimer = null
  }
  if (cursorPulseTimer) {
    clearTimeout(cursorPulseTimer)
    cursorPulseTimer = null
  }
  detachResizeObserver()
  unsubData?.()
  unsubClosed?.()
  unsubError?.()
  terminal?.dispose()
})
</script>

<template>
  <div class="terminal-wrapper" @contextmenu="openSelectionMenu">
    <div v-if="searchVisible" class="search-bar">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        :ref="(el) => setSearchInputRef(el as HTMLInputElement)"
        v-model="searchQuery"
        class="search-input"
        placeholder="搜索..."
        @input="onSearchInput"
        @keydown="onSearchKeydown"
      />
      <span class="search-hint">Enter 下一个 · Esc 关闭</span>
      <button class="search-close" @click="toggleSearch" title="关闭搜索">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div ref="terminalRef" class="xterm-container"></div>
    <div
      v-if="selectionMenuVisible"
      class="terminal-selection-menu"
      :style="{ left: selectionMenuX + 'px', top: selectionMenuY + 'px' }"
      @click.stop
    >
      <button class="terminal-selection-menu-item" @click="sendSelectionToAi('send')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>
        </svg>
        <span>发送给 AI</span>
      </button>
      <button class="terminal-selection-menu-item" @click="sendSelectionToAi('insert')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 4v16"/><path d="M8 4h8"/><path d="M8 20h8"/>
        </svg>
        <span>放入 AI 输入框</span>
      </button>
    </div>
    <div v-if="disconnected" class="reconnect-overlay">
      <div class="reconnect-card">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        <span class="reconnect-text">连接已断开</span>
        <button class="reconnect-btn" @click="handleReconnect">重新连接</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.terminal-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.search-bar svg {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  padding: 4px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  outline: none;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-hint {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
  opacity: 0.6;
}

.search-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
}

.search-close:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.xterm-container {
  width: 100%;
  height: 100%;
  padding: 4px;
}

/* 按键反馈：光标短暂高亮，提示按键已被客户端接收 */
.xterm-container.cursor-pulse :deep(.xterm-cursor-layer .xterm-cursor) {
  opacity: 1 !important;
  filter: brightness(1.4) drop-shadow(0 0 2px var(--accent, #4a9eff));
  transition: filter 0.05s ease-out;
}

.terminal-selection-menu {
  position: fixed;
  z-index: 10000;
  min-width: 150px;
  padding: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.terminal-selection-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.terminal-selection-menu-item:hover {
  background: var(--accent-bg);
  color: var(--accent);
}

.reconnect-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(2px);
}

.reconnect-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 32px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  color: var(--text-secondary);
}

.reconnect-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.reconnect-btn {
  padding: 8px 24px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.reconnect-btn:hover {
  background: var(--accent-hover);
}
</style>
