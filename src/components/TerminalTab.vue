<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, onActivated, onDeactivated, nextTick, inject } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { getTerminalColors } from '../composables/useTheme'
import type { Theme } from '../composables/useTheme'
import type { CustomColors } from '../composables/useTheme'

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
const searchVisible = ref(false)
const searchQuery = ref('')
const selectionMenuVisible = ref(false)
const selectionMenuX = ref(0)
const selectionMenuY = ref(0)
const selectedText = ref('')
let searchInputRef: HTMLInputElement | null = null
let unsubData: (() => void) | null = null
let unsubClosed: (() => void) | null = null
let unsubError: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null
let renderBatch = ''
let renderBatchRafId: number | null = null
let commandBuffer = ''
let commandBufferDirty = false
let pendingSubmitTimer: ReturnType<typeof setTimeout> | null = null
let bgLatencyTimer: ReturnType<typeof setInterval> | null = null
let writeQueue = ''
let writeTimer: ReturnType<typeof setTimeout> | null = null
let pastingDepth = 0
let pastingBuffer = ''
let pwdQuery: {
  startMarker: string
  endMarker: string
  buffer: string
  started: boolean
  timer: ReturnType<typeof setTimeout>
  resolve: (pwd: string) => void
  reject: (error: Error) => void
} | null = null
let pwdOutputSuppression: {
  startMarker: string
  endMarker: string
  buffer: string
  started: boolean
  timer: ReturnType<typeof setTimeout>
} | null = null
let pwdQueryDrainTimer: ReturnType<typeof setTimeout> | null = null
const BRACKET_PASTE_START = '\x1b[200~'
const BRACKET_PASTE_END = '\x1b[201~'

type TerminalPwdRequestDetail = {
  sessionId: string
  handled?: boolean
  resolve: (pwd: string) => void
  reject: (error: Error) => void
}

function updatePasteState(data: string) {
  pastingBuffer += data
  while (pastingBuffer.length > 0) {
    const startIdx = pastingBuffer.indexOf(BRACKET_PASTE_START)
    const endIdx = pastingBuffer.indexOf(BRACKET_PASTE_END)
    if (startIdx === -1 && endIdx === -1) {
      pastingBuffer = ''
      break
    }
    if (endIdx !== -1 && (startIdx === -1 || endIdx < startIdx)) {
      pastingDepth = Math.max(0, pastingDepth - 1)
      pastingBuffer = pastingBuffer.substring(endIdx + BRACKET_PASTE_END.length)
    } else {
      pastingDepth++
      pastingBuffer = pastingBuffer.substring(startIdx + BRACKET_PASTE_START.length)
    }
  }
  if (pastingBuffer.length > 20) pastingBuffer = ''
}

function isPasting(): boolean {
  return pastingDepth > 0
}
let capturedSubmitLine = ''

function stripTerminalSequences(text: string): string {
  return text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\r/g, '\n')
}

function extractPwdFromQueryOutput(output: string): string | null {
  const lines = stripTerminalSequences(output)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]
    if (line.startsWith('/')) return line
  }
  return null
}

function clearPwdQuery() {
  if (!pwdQuery) return
  clearTimeout(pwdQuery.timer)
  pwdQuery = null
}

function clearPwdOutputSuppression() {
  if (!pwdOutputSuppression) return
  clearTimeout(pwdOutputSuppression.timer)
  pwdOutputSuppression = null
}

function suppressLatePwdOutput(query: { startMarker: string; endMarker: string }, timeoutMs = 5000) {
  clearPwdOutputSuppression()
  const timer = setTimeout(() => {
    pwdOutputSuppression = null
  }, timeoutMs)
  pwdOutputSuppression = {
    startMarker: query.startMarker,
    endMarker: query.endMarker,
    buffer: '',
    started: false,
    timer,
  }
}

function startPwdQueryDrain() {
  if (pwdQueryDrainTimer) clearTimeout(pwdQueryDrainTimer)
  pwdQueryDrainTimer = setTimeout(() => {
    pwdQueryDrainTimer = null
  }, 120)
}

function finishPwdQuery(output: string) {
  const query = pwdQuery
  if (!query) return

  const pwd = extractPwdFromQueryOutput(output)
  clearPwdQuery()
  startPwdQueryDrain()

  if (!pwd) {
    query.reject(new Error('Unable to read terminal pwd'))
    return
  }

  emit('pwdOutput', props.sessionId, pwd)
  query.resolve(pwd)
}

function processPwdQueryData(data: string): string {
  if (pwdQueryDrainTimer) return ''
  const query = pwdQuery
  if (!query) return processSuppressedPwdOutput(data)

  query.buffer += data

  if (!query.started) {
    const startIndex = query.buffer.indexOf(query.startMarker)
    if (startIndex === -1) return ''
    query.started = true
    query.buffer = query.buffer.slice(startIndex + query.startMarker.length)
  }

  const endIndex = query.buffer.indexOf(query.endMarker)
  if (endIndex === -1) return ''

  finishPwdQuery(query.buffer.slice(0, endIndex))
  return ''
}

function processSuppressedPwdOutput(data: string): string {
  const suppression = pwdOutputSuppression
  if (!suppression) return data

  suppression.buffer += data

  if (!suppression.started) {
    const startIndex = suppression.buffer.indexOf(suppression.startMarker)
    if (startIndex === -1) return ''
    suppression.started = true
    suppression.buffer = suppression.buffer.slice(startIndex + suppression.startMarker.length)
  }

  const endIndex = suppression.buffer.indexOf(suppression.endMarker)
  if (endIndex === -1) return ''

  clearPwdOutputSuppression()
  startPwdQueryDrain()
  return ''
}

function requestInteractivePwd(): Promise<string> {
  if (!terminal) return Promise.reject(new Error('Terminal is not ready'))

  clearPwdOutputSuppression()
  if (pwdQuery) {
    const previous = pwdQuery
    clearPwdQuery()
    suppressLatePwdOutput(previous)
    previous.reject(new Error('Superseded by a new pwd request'))
  }

  const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const startMarker = `__LITESSH_PWD_${token}_START__`
  const endMarker = `__LITESSH_PWD_${token}_END__`

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const query = pwdQuery
      if (!query) return
      clearPwdQuery()
      suppressLatePwdOutput(query)
      reject(new Error('Terminal pwd request timeout'))
    }, 5000)

    pwdQuery = {
      startMarker,
      endMarker,
      buffer: '',
      started: false,
      timer,
      resolve,
      reject,
    }

    const command =
      `_lssh_a=__LITESSH_; _lssh_b=PWD_${token}_; ` +
      `printf '\\n%s%sSTART__\\n' "$_lssh_a" "$_lssh_b"; ` +
      `pwd; ` +
      `printf '\\n%s%sEND__\\n' "$_lssh_a" "$_lssh_b"; ` +
      `unset _lssh_a _lssh_b\r`

    flushRenderBatch(() => {
      window.liteSSH.sshWrite(props.sessionId, command)
    })
  })
}

function onRequestTerminalPwd(event: Event) {
  const detail = (event as CustomEvent<TerminalPwdRequestDetail>).detail
  if (!detail || detail.sessionId !== props.sessionId) return
  detail.handled = true
  requestInteractivePwd().then(detail.resolve, detail.reject)
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

function isLocallyEchoable(data: string): boolean {
  if (data.length === 0) return false
  if (data.charCodeAt(0) === 0x1b) return false
  for (const ch of data) {
    const code = ch.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return false
  }
  return true
}

function getVisibleCommandLine(): string {
  if (!terminal) return ''
  try {
    const activeBuffer = (terminal as any).buffer?.active
    if (!activeBuffer) return ''
    const cursorY = activeBuffer.baseY + activeBuffer.cursorY
    // Scan backwards from cursor for the first non-empty line (handles cursor advance, multi-line output)
    for (let offset = 0; offset < 5; offset++) {
      const line = activeBuffer.getLine(cursorY - offset)
      const text = line?.translateToString(true) ?? ''
      if (text.trim()) return text
    }
    return ''
  } catch {
    return ''
  }
}

function stripShellNotifications(line: string): string {
  return line.replace(/\[Pasted[^\]]*\]\s*/g, '')
}

function inferSubmittedCommand(command: string): string {
  const trimmedCommand = command.trim()
  if (!trimmedCommand) return trimmedCommand
  const visibleLine = stripShellNotifications(getVisibleCommandLine())
  if (!visibleLine.trim()) return trimmedCommand
  const commandStart = visibleLine.lastIndexOf(trimmedCommand)
  if (commandStart !== -1) {
    return visibleLine.slice(commandStart).trim()
  }

  const firstToken = trimmedCommand.split(/\s+/)[0]
  if (!firstToken) return trimmedCommand

  // 改进 fallback：尝试用常见 shell 提示符分隔符提取命令
  const separators = ['$ ', '# ', '> ', '% ']
  let lastSepIndex = -1
  for (const sep of separators) {
    const idx = visibleLine.lastIndexOf(sep)
    if (idx > lastSepIndex) lastSepIndex = idx
  }
  if (lastSepIndex !== -1) {
    const candidate = visibleLine.slice(lastSepIndex + 2).trim()
    if (candidate.startsWith(firstToken)) {
      return candidate
    }
  }

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

function extractCommandFromLine(line: string): string {
  if (!line.trim()) return ''
  const separators = ['$ ', '# ', '> ', '% ']
  let lastSepIndex = -1
  for (const sep of separators) {
    const idx = line.lastIndexOf(sep)
    if (idx > lastSepIndex) lastSepIndex = idx
  }
  if (lastSepIndex !== -1) {
    return line.slice(lastSepIndex + 2).trim()
  }
  return line.trim()
}

function extractCommandFromVisibleLine(): string {
  return extractCommandFromLine(stripShellNotifications(getVisibleCommandLine()))
}

function submitBufferedCommand() {
  let cmd = ''
  const submitLine = capturedSubmitLine
  capturedSubmitLine = ''

  if (commandBufferDirty) {
    if (submitLine.trim()) {
      cmd = extractCommandFromLine(submitLine)
    }
  } else if (commandBuffer.trim()) {
    cmd = inferSubmittedCommand(commandBuffer)
  }

  if (!cmd) {
    const visibleCmd = extractCommandFromVisibleLine()
    if (visibleCmd) {
      cmd = visibleCmd
    }
  }

  if (!cmd) {
    cmd = commandBuffer.trim()
  }

  if (/(?:^|[;&|]\s*)cd(?:\s|$)/.test(cmd)) {
    // Delay cdCommand to let terminal render first
    setTimeout(() => {
      emit('cdCommand', props.sessionId, cmd)
    }, 50)
  }
  commandBuffer = ''
  commandBufferDirty = false
  pendingSubmitTimer = null
}

function flushRenderBatch(callback?: () => void) {
  if (!terminal || renderBatch.length === 0) {
    renderBatch = ''
    if (renderBatchRafId) {
      cancelAnimationFrame(renderBatchRafId)
      renderBatchRafId = null
    }
    callback?.()
    return
  }
  const data = renderBatch
  renderBatch = ''
  if (renderBatchRafId) {
    cancelAnimationFrame(renderBatchRafId)
    renderBatchRafId = null
  }
  terminal.write(data, callback)
}

function scheduleRenderFlush() {
  if (renderBatchRafId) return
  renderBatchRafId = requestAnimationFrame(() => {
    renderBatchRafId = null
    flushRenderBatch()
  })
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

function toggleSearch() {
  searchVisible.value = !searchVisible.value
  if (searchVisible.value) {
    searchQuery.value = ''
    nextTick(() => {
      searchInputRef?.focus()
      searchInputRef?.select()
    })
  } else {
    searchAddon?.clearDecorations()
    terminal?.focus()
  }
}

function doSearch(query: string) {
  if (!searchAddon || !query) {
    searchAddon?.clearDecorations()
    return
  }
  searchAddon.findNext(query, {
    decorations: {
      matchBackground: '#ffb80066',
      activeMatchBackground: '#ffb80099',
      matchBorder: '#ffb800',
      activeMatchBorder: '#ff8c00',
      matchOverviewRuler: '#ffb800',
      activeMatchColorOverviewRuler: '#ff8c00',
    },
  })
}

function onSearchInput() {
  doSearch(searchQuery.value)
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    searchAddon?.findNext(searchQuery.value)
  } else if (e.key === 'Escape') {
    toggleSearch()
  }
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

  // Clear selection when user scrolls viewport away from bottom (prevents ghost highlight)
  terminal.onScroll((newPosition: number) => {
    const bufferLength = terminal!.buffer.active.length
    if (newPosition < bufferLength - terminal!.rows && terminal!.hasSelection()) {
      terminal!.clearSelection()
    }
  })

  terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    if (event.type !== 'keydown') return true

    const ctrlOrCmd = event.ctrlKey || event.metaKey

    if (ctrlOrCmd && event.key === '=') {
      event.preventDefault()
      if (fontSize.value < 24) {
        fontSize.value++
        terminal?.options && (terminal.options.fontSize = fontSize.value)
        window.liteSSH.setTerminalFontSize(fontSize.value).catch(() => {})
      }
      return false
    }

    if (ctrlOrCmd && event.key === '-') {
      event.preventDefault()
      if (fontSize.value > 10) {
        fontSize.value--
        terminal?.options && (terminal.options.fontSize = fontSize.value)
        window.liteSSH.setTerminalFontSize(fontSize.value).catch(() => {})
      }
      return false
    }

    if (ctrlOrCmd && event.key === 'f') {
      event.preventDefault()
      toggleSearch()
      return false
    }

    if (ctrlOrCmd && event.key === 'v') {
      event.preventDefault()
      window.liteSSH.clipboardReadText().then((text: string) => {
        if (text && terminal) {
          terminal.paste(text)
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

  let lastKeyTime = 0
  let awaitingEcho = false
  let lastLatencyReportTime = 0
  let latestKeystrokeLatency = -1

  function reportLatency(ms: number) {
    const now = performance.now()
    if (now - lastLatencyReportTime >= 10000 || lastLatencyReportTime === 0) {
      emit('latency', props.sessionId, ms)
      lastLatencyReportTime = now
      latestKeystrokeLatency = -1
    }
  }

  // Queue for chunked data sending

  function processWriteQueue() {
    if (writeQueue.length === 0) {
      writeTimer = null
      return
    }
    const chunk = writeQueue.substring(0, 32)
    writeQueue = writeQueue.substring(32)
    window.liteSSH.sshWrite(props.sessionId, chunk)

    if (writeQueue.length > 0) {
      writeTimer = setTimeout(processWriteQueue, 10)
    } else {
      writeTimer = null
    }
  }

  terminal.onData((data) => {
    updatePasteState(data)

    if (data.length === 1 && isLocallyEchoable(data) && !isPasting()) {
      lastKeyTime = performance.now()
      awaitingEcho = true
    }

    const isSubmit = data === '\r' || data === '\n'
    const isCancel = data === '\x03' || data === '\x15'
    const isBackspace = data === '\x7f' || data === '\x08'
    const isTab = data === '\t' || data === '\x09'
    const isEscape = data.charCodeAt(0) === 0x1b
    const hasNewline = data.includes('\r') || data.includes('\n')

    if (isSubmit) {
      capturedSubmitLine = stripShellNotifications(getVisibleCommandLine())
      if (pendingSubmitTimer) {
        clearTimeout(pendingSubmitTimer)
      }
      pendingSubmitTimer = setTimeout(() => {
        submitBufferedCommand()
      }, 20)
    } else if (isCancel) {
      if (pendingSubmitTimer) {
        clearTimeout(pendingSubmitTimer)
        pendingSubmitTimer = null
      }
      commandBuffer = ''
      commandBufferDirty = false
    } else if (isBackspace) {
      if (commandBuffer.length > 0) commandBuffer = commandBuffer.slice(0, -1)
    } else if (data === '\x17') {
      commandBuffer = commandBuffer.replace(/\S+\s*$/, '')
    } else if (isTab) {
      commandBufferDirty = true
    } else if (isLocallyEchoable(data) && !isPasting()) {
      commandBuffer += data
    } else if (isEscape) {
      commandBuffer = ''
      commandBufferDirty = true
    } else if (hasNewline) {
      commandBufferDirty = true
      const lines = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').split(/\r?\n/)
      for (const line of lines) {
        const trimmed = line.trim()
        if (/(?:^|[;&|]\s*)cd(?:\s|$)/.test(trimmed)) {
          setTimeout(() => {
            emit('cdCommand', props.sessionId, trimmed)
          }, 50)
        }
      }
      if (pendingSubmitTimer) {
        clearTimeout(pendingSubmitTimer)
      }
      pendingSubmitTimer = setTimeout(() => {
        submitBufferedCommand()
      }, 20)
    }

    if (data.length > 32 || writeQueue.length > 0) {
      writeQueue += data
      if (!writeTimer) {
        processWriteQueue()
      }
    } else {
      window.liteSSH.sshWrite(props.sessionId, data)
    }
  })

  bgLatencyTimer = setInterval(async () => {
    if (performance.now() - lastLatencyReportTime < 10000) return
    if (latestKeystrokeLatency !== -1) {
      reportLatency(latestKeystrokeLatency)
      return
    }
    try {
      const ms = await window.liteSSH.sshMeasureLatency(props.sessionId)
      reportLatency(ms)
    } catch {}
  }, 10000)

  // Initial measurement
  window.liteSSH.sshMeasureLatency(props.sessionId).then(reportLatency).catch(() => {})

  unsubData = window.liteSSH.onSshData(props.sessionId, (data) => {
    if (awaitingEcho) {
      latestKeystrokeLatency = Math.round(performance.now() - lastKeyTime)
      reportLatency(latestKeystrokeLatency)
      awaitingEcho = false
    }
    if (!terminal) return
    const visibleData = processPwdQueryData(data)
    if (visibleData.length > 0) {
      renderBatch += visibleData
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
  if (pwdQuery) {
    const query = pwdQuery
    clearPwdQuery()
    suppressLatePwdOutput(query)
    query.reject(new Error('Terminal disposed'))
  }
  clearPwdOutputSuppression()
  if (pwdQueryDrainTimer) {
    clearTimeout(pwdQueryDrainTimer)
    pwdQueryDrainTimer = null
  }
  if (pendingSubmitTimer) {
    clearTimeout(pendingSubmitTimer)
    pendingSubmitTimer = null
  }
  if (bgLatencyTimer) {
    clearInterval(bgLatencyTimer)
    bgLatencyTimer = null
  }
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  writeQueue = ''
  commandBuffer = ''
  renderBatch = ''
  if (renderBatchRafId) {
    cancelAnimationFrame(renderBatchRafId)
    renderBatchRafId = null
  }
  if (resizeDebounceTimer) {
    clearTimeout(resizeDebounceTimer)
    resizeDebounceTimer = null
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
        ref="el => searchInputRef = el"
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
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
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
