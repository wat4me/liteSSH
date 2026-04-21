<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import type { FileEntry, TransferItem } from '../env.d.ts'

const props = defineProps<{
  sessionId: string
  connectionName: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

type TabType = 'files' | 'downloads'

const activeTab = ref<TabType>('files')
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuEntry = ref<FileEntry | null>(null)

const currentPath = ref('')
const files = ref<FileEntry[]>([])
const loading = ref(false)
const error = ref('')
const sftpReady = ref(false)
const pathInput = ref('')
const showPathInput = ref(false)
const homePath = ref('')
const shellHomePath = ref('')
const terminalPath = ref('')
const lastPathDebug = ref('')
const followTerminalPath = ref(true)
const previousTerminalPath = ref('')

const transfers = reactive<Map<string, TransferItem>>(new Map())

let unsubClosed: (() => void) | null = null
let unsubStart: (() => void) | null = null
let unsubProgress: (() => void) | null = null
let unsubComplete: (() => void) | null = null
let unsubError: (() => void) | null = null

async function initSftp() {
  if (sftpReady.value) return
  loading.value = true
  error.value = ''
  try {
    await window.liteSSH.sftpInit(props.sessionId)
    sftpReady.value = true
    const [home, shellHomeRaw] = await Promise.all([
      window.liteSSH.sftpRealpath(props.sessionId, '.'),
      window.liteSSH.sftpExecHome(props.sessionId).catch(() => ''),
    ])
    homePath.value = home
    shellHomePath.value = shellHomeRaw.trim() || home
    terminalPath.value = home
    currentPath.value = home
    pathInput.value = home
    await loadDirectory(home)
  } catch (err: any) {
    error.value = err.message || 'SFTP 初始化失败'
  } finally {
    loading.value = false
  }
}

async function loadDirectory(path: string) {
  loading.value = true
  error.value = ''
  try {
    const entries = await window.liteSSH.sftpReaddir(props.sessionId, path)
    files.value = entries.filter(e => e.name !== '.' && e.name !== '..')
    currentPath.value = path
    pathInput.value = path
  } catch (err: any) {
    const message = err.message || '无法加载目录'
    error.value = lastPathDebug.value ? `${message}\n${lastPathDebug.value}` : message
  } finally {
    loading.value = false
  }
}

async function navigateTo(entry: FileEntry) {
  if (entry.isDirectory || entry.isSymlink) {
    await loadDirectory(entry.path)
  }
}

async function goUp() {
  if (currentPath.value === '/') return
  const parts = currentPath.value.split('/').filter(Boolean)
  parts.pop()
  const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/')
  await loadDirectory(parentPath)
}

async function goToHome() {
  try {
    const home = await window.liteSSH.sftpRealpath(props.sessionId, '.')
    await loadDirectory(home)
  } catch {}
}

async function syncCwd() {
  if (!terminalPath.value) {
    error.value = '无法获取终端当前目录'
    return
  }
  await loadDirectory(terminalPath.value)
}

async function toggleFollowTerminalPath() {
  followTerminalPath.value = !followTerminalPath.value
  if (followTerminalPath.value) {
    await syncCwd()
  }
}

async function submitPathInput() {
  const path = pathInput.value.trim()
  if (path && path !== currentPath.value) {
    await loadDirectory(path)
  }
  showPathInput.value = false
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

function startDownload(entry: FileEntry) {
  if (entry.isDirectory) return
  const transferId = `dl-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  window.liteSSH.sftpDownload(props.sessionId, entry.path, entry.name, transferId)
  activeTab.value = 'downloads'
}

function normalizePosixPath(basePath: string, inputPath: string): string {
  const isAbs = inputPath.startsWith('/')
  const parts = (isAbs ? inputPath : `${basePath}/${inputPath}`).split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (stack.length > 0) stack.pop()
      continue
    }
    stack.push(part)
  }
  return '/' + stack.join('/')
}

function decodeShellPathArg(raw: string): string {
  let result = ''
  let i = 0
  let inSingle = false
  let inDouble = false

  while (i < raw.length) {
    const ch = raw[i]

    if (inSingle) {
      if (ch === "'") {
        inSingle = false
      } else {
        result += ch
      }
      i++
      continue
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false
        i++
        continue
      }
      if (ch === '\\' && i + 1 < raw.length) {
        const next = raw[i + 1]
        if (next === '"' || next === '\\' || next === '$' || next === '`') {
          result += next
          i += 2
          continue
        }
      }
      result += ch
      i++
      continue
    }

    if (ch === "'") {
      inSingle = true
      i++
      continue
    }

    if (ch === '"') {
      inDouble = true
      i++
      continue
    }

    if (ch === '\\') {
      if (i + 1 < raw.length) {
        result += raw[i + 1]
        i += 2
      } else {
        i++
      }
      continue
    }

    result += ch
    i++
  }

  return result
}

function splitShellArgs(raw: string): string[] {
  const args: string[] = []
  let current = ''
  let i = 0
  let inSingle = false
  let inDouble = false

  while (i < raw.length) {
    const ch = raw[i]

    if (inSingle) {
      current += ch
      if (ch === "'") inSingle = false
      i++
      continue
    }

    if (inDouble) {
      current += ch
      if (ch === '"') inDouble = false
      i++
      continue
    }

    if (ch === "'") {
      inSingle = true
      current += ch
      i++
      continue
    }

    if (ch === '"') {
      inDouble = true
      current += ch
      i++
      continue
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        args.push(decodeShellPathArg(current))
        current = ''
      }
      i++
      continue
    }

    if (ch === '\\' && i + 1 < raw.length) {
      current += ch + raw[i + 1]
      i += 2
      continue
    }

    current += ch
    i++
  }

  if (current.length > 0) {
    args.push(decodeShellPathArg(current))
  }

  return args
}

function mapShellPathToSftpPath(path: string): string {
  if (!path.startsWith('/')) return path
  const normalizedPath = normalizePosixPath('/', path)
  const normalizedShellHome = shellHomePath.value ? normalizePosixPath('/', shellHomePath.value) : ''
  const normalizedSftpHome = homePath.value ? normalizePosixPath('/', homePath.value) : ''
  if (!normalizedShellHome || !normalizedSftpHome || normalizedShellHome === normalizedSftpHome) {
    return normalizedPath
  }
  if (normalizedPath === normalizedShellHome) {
    return normalizedSftpHome
  }
  if (normalizedPath.startsWith(`${normalizedShellHome}/`)) {
    const suffix = normalizedPath.slice(normalizedShellHome.length).replace(/^\/+/, '')
    return normalizePosixPath(normalizedSftpHome, suffix)
  }
  return normalizedPath
}

async function resolveCdPath(command: string): Promise<string | null> {
  const match = command.match(/(?:^|[;&|]\s*)cd(?:\s+(.+?))?(?=\s*(?:[;&|]|$))/)
  if (!match) return null
  const rawArg = (match[1] || '').trim()
  if (!rawArg) {
    const home = homePath.value || await window.liteSSH.sftpRealpath(props.sessionId, '.')
    lastPathDebug.value = [
      `cmd=${command}`,
      `raw=${rawArg || '(empty)'}`,
      `shellHome=${shellHomePath.value || '(empty)'}`,
      `sftpHome=${homePath.value || '(empty)'}`,
      `candidate=${home}`,
      `resolved=${home}`,
    ].join('\n')
    return home
  }
  if (rawArg === '-') {
    const previous = previousTerminalPath.value || terminalPath.value || null
    lastPathDebug.value = [
      `cmd=${command}`,
      `raw=${rawArg}`,
      `shellHome=${shellHomePath.value || '(empty)'}`,
      `sftpHome=${homePath.value || '(empty)'}`,
      `candidate=${previous || '(null)'}`,
      `resolved=${previous || '(null)'}`,
    ].join('\n')
    return previous
  }
  const parsedArgs = splitShellArgs(rawArg)
  if (parsedArgs.length > 1) {
    lastPathDebug.value = [
      `cmd=${command}`,
      `raw=${rawArg}`,
      `parsed=${parsedArgs.join(' | ')}`,
      'skip=cd has multiple args',
    ].join('\n')
    return null
  }

  const decodedArg = parsedArgs[0] ?? ''
  if (!decodedArg) {
    lastPathDebug.value = [
      `cmd=${command}`,
      `raw=${rawArg}`,
      'parsed=(empty)',
      'skip=empty after parsing',
    ].join('\n')
    return null
  }

  if (decodedArg === '~') {
    const home = homePath.value || await window.liteSSH.sftpRealpath(props.sessionId, '.')
    lastPathDebug.value = [
      `cmd=${command}`,
      `raw=${rawArg}`,
      `decoded=${decodedArg}`,
      `shellHome=${shellHomePath.value || '(empty)'}`,
      `sftpHome=${homePath.value || '(empty)'}`,
      `candidate=${home}`,
      `resolved=${home}`,
    ].join('\n')
    return home
  }
  if (decodedArg.startsWith('~/')) {
    const home = homePath.value || await window.liteSSH.sftpRealpath(props.sessionId, '.')
    const candidate = normalizePosixPath(home, decodedArg.slice(2))
    lastPathDebug.value = [
      `cmd=${command}`,
      `raw=${rawArg}`,
      `decoded=${decodedArg}`,
      `shellHome=${shellHomePath.value || '(empty)'}`,
      `sftpHome=${homePath.value || '(empty)'}`,
      `candidate=${candidate}`,
      `resolved=${candidate}`,
    ].join('\n')
    return candidate
  }
  const basePath = terminalPath.value || currentPath.value || homePath.value || '/'
  const shellPath = normalizePosixPath(decodedArg.startsWith('/') ? '/' : basePath, decodedArg)
  const candidate = mapShellPathToSftpPath(shellPath)
  try {
    const resolved = await window.liteSSH.sftpRealpath(props.sessionId, candidate)
    lastPathDebug.value = [
      `cmd=${command}`,
      `raw=${rawArg}`,
      `decoded=${decodedArg}`,
      `base=${basePath}`,
      `shellPath=${shellPath}`,
      `shellHome=${shellHomePath.value || '(empty)'}`,
      `sftpHome=${homePath.value || '(empty)'}`,
      `candidate=${candidate}`,
      `resolved=${resolved}`,
    ].join('\n')
    return resolved
  } catch (err: any) {
    lastPathDebug.value = [
      `cmd=${command}`,
      `raw=${rawArg}`,
      `decoded=${decodedArg}`,
      `base=${basePath}`,
      `shellPath=${shellPath}`,
      `shellHome=${shellHomePath.value || '(empty)'}`,
      `sftpHome=${homePath.value || '(empty)'}`,
      `candidate=${candidate}`,
      `realpathError=${err?.message || 'unknown'}`,
    ].join('\n')
    return candidate
  }
}

async function handleTerminalCd(command: string) {
  const resolved = await resolveCdPath(command)
  if (resolved) {
    previousTerminalPath.value = terminalPath.value
    terminalPath.value = resolved
    if (followTerminalPath.value) {
      await loadDirectory(resolved)
    }
  }
}

async function refresh() {
  if (followTerminalPath.value) {
    await syncCwd()
    return
  }
  if (currentPath.value) {
    await loadDirectory(currentPath.value)
  }
}

function togglePathInput() {
  showPathInput.value = !showPathInput.value
  if (showPathInput.value) {
    pathInput.value = currentPath.value
  }
}

function onContextMenu(e: MouseEvent, entry: FileEntry) {
  e.preventDefault()
  contextMenuEntry.value = entry
  contextMenuX.value = e.clientX
  contextMenuY.value = e.clientY
  contextMenuVisible.value = true
}

function onContextMenuDownload() {
  if (contextMenuEntry.value && !contextMenuEntry.value.isDirectory) {
    startDownload(contextMenuEntry.value)
  }
  contextMenuVisible.value = false
}

function hideContextMenu() {
  contextMenuVisible.value = false
}

function cancelTransfer(id: string) {
  window.liteSSH.sftpCancelTransfer(id)
  const item = transfers.get(id)
  if (item) {
    item.status = 'error'
    item.error = '已取消'
  }
}

function removeTransfer(id: string) {
  transfers.delete(id)
}

function clearFinishedTransfers() {
  for (const [id, item] of transfers) {
    if (item.status !== 'downloading') {
      transfers.delete(id)
    }
  }
}

function clearAllTransfers() {
  for (const [id, item] of transfers) {
    if (item.status === 'downloading') {
      window.liteSSH.sftpCancelTransfer(id)
    }
  }
  transfers.clear()
}

function openInFolder(localPath: string) {
  window.liteSSH.shellShowItemInFolder(localPath)
}

watch(() => props.sessionId, async (newId) => {
  if (newId) {
    sftpReady.value = false
    files.value = []
    currentPath.value = ''
    terminalPath.value = ''
    previousTerminalPath.value = ''
    homePath.value = ''
    shellHomePath.value = ''
    error.value = ''
    await initSftp()
  }
})

onMounted(async () => {
  unsubClosed = window.liteSSH.onSshClosed((sessionId) => {
    if (sessionId === props.sessionId) {
      sftpReady.value = false
      error.value = '连接已断开'
    }
  })

  unsubStart = window.liteSSH.onTransferStart((transferId, fileName, localPath) => {
    transfers.set(transferId, {
      id: transferId,
      fileName,
      localPath,
      transferred: 0,
      total: 0,
      status: 'downloading',
    })
  })

  unsubProgress = window.liteSSH.onTransferProgress((transferId, transferred, total) => {
    const item = transfers.get(transferId)
    if (item) {
      item.transferred = transferred
      item.total = total
    }
  })

  unsubComplete = window.liteSSH.onTransferComplete((transferId) => {
    const item = transfers.get(transferId)
    if (item) {
      item.status = 'completed'
      item.transferred = item.total
    }
  })

  unsubError = window.liteSSH.onTransferError((transferId, errorMsg) => {
    const item = transfers.get(transferId)
    if (item) {
      item.status = 'error'
      item.error = errorMsg
    }
  })

  globalThis.addEventListener('click', hideContextMenu)
  await initSftp()
})

onBeforeUnmount(() => {
  unsubClosed?.()
  unsubStart?.()
  unsubProgress?.()
  unsubComplete?.()
  unsubError?.()
  globalThis.removeEventListener('click', hideContextMenu)
})

defineExpose({ handleTerminalCd })
</script>

<template>
  <div class="file-sidebar" @click="hideContextMenu">
    <div class="sidebar-tabs">
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'files' }"
        @click="activeTab = 'files'"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span>文件</span>
      </button>
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'downloads' }"
        @click="activeTab = 'downloads'"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>下载</span>
        <span v-if="transfers.size > 0" class="sidebar-tab-badge">{{ transfers.size }}</span>
      </button>
      <div style="flex:1"></div>
      <button class="sidebar-btn sidebar-btn-close" @click="emit('close')" title="关闭侧栏">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div v-if="activeTab === 'files'" class="sidebar-content">
      <div class="sidebar-toolbar">
        <button class="sidebar-btn" @click="goToHome" title="主目录">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </button>
        <button class="sidebar-btn" @click="syncCwd" title="同步终端目录">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l5.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
        <button class="sidebar-btn" @click="refresh" title="刷新">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      <div class="sidebar-path" @click="togglePathInput">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="path-icon">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span v-if="!showPathInput" class="path-text">{{ currentPath }}</span>
        <svg v-if="!showPathInput" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:0.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      <form v-if="showPathInput" class="path-form" @submit.prevent="submitPathInput">
        <input
          v-model="pathInput"
          class="path-input"
          placeholder="输入路径..."
          @blur="submitPathInput"
          @keydown.escape="showPathInput = false"
        />
      </form>

      <div v-if="error" class="sidebar-error">{{ error }}</div>

      <div v-if="loading && files.length === 0" class="sidebar-loading">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span>加载中...</span>
      </div>

      <div class="file-list" v-else>
        <div
          v-if="currentPath !== '/'"
          class="file-entry file-entry-parent"
          @click="goUp"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="file-icon">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="file-name">..</span>
        </div>

        <div
          v-for="entry in files"
          :key="entry.path"
          class="file-entry"
          :class="{ 'file-entry-dir': entry.isDirectory || entry.isSymlink }"
          @click="entry.isDirectory || entry.isSymlink ? navigateTo(entry) : undefined"
          @contextmenu="onContextMenu($event, entry)"
        >
          <svg v-if="entry.isDirectory" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="file-icon file-icon-dir">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <svg v-else-if="entry.isSymlink" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="file-icon file-icon-link">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="file-icon file-icon-file">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <span class="file-name" :title="entry.name">{{ entry.name }}</span>
          <span v-if="!entry.isDirectory && entry.size > 0" class="file-size">{{ formatSize(entry.size) }}</span>
          <button
            v-if="!entry.isDirectory"
            class="file-download-btn"
            @click.stop="startDownload(entry)"
            title="下载"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
        </div>

        <div v-if="files.length === 0 && currentPath && !loading" class="sidebar-empty">
          空目录
        </div>
      </div>

      <div class="follow-footer">
        <div class="follow-footer-text">
          <div class="follow-footer-title">跟随终端目录</div>
          <div class="follow-footer-desc">开启后执行 cd 自动同步文件目录</div>
        </div>
        <button
          class="follow-switch"
          :class="{ on: followTerminalPath }"
          @click="toggleFollowTerminalPath"
          :title="followTerminalPath ? '跟随终端目录：已开启' : '跟随终端目录：已关闭'"
        >
          <span class="follow-switch-thumb"></span>
        </button>
      </div>
    </div>

    <div v-else class="sidebar-content">
      <div class="downloads-toolbar">
        <button class="downloads-btn" @click="clearFinishedTransfers">清理完成</button>
        <button class="downloads-btn downloads-btn-danger" @click="clearAllTransfers">清空</button>
      </div>
      <div v-if="transfers.size === 0" class="sidebar-empty" style="margin-top:40px">
        暂无下载记录
      </div>
      <div class="transfer-list">
        <div
          v-for="[id, item] in transfers"
          :key="id"
          class="transfer-item"
          :class="{ 'transfer-completed': item.status === 'completed', 'transfer-error': item.status === 'error' }"
          @click="item.status === 'completed' ? openInFolder(item.localPath) : undefined"
        >
          <div class="transfer-info">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="transfer-file-icon" v-if="item.status !== 'completed'">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="transfer-done-icon">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <div class="transfer-text">
              <span class="transfer-name" :title="item.localPath">{{ item.fileName }}</span>
              <span v-if="item.status === 'downloading'" class="transfer-detail">
                {{ formatSize(item.transferred) }} / {{ formatSize(item.total) }}
              </span>
              <span v-else-if="item.status === 'completed'" class="transfer-detail transfer-detail-ok">
                已完成 · 点击打开所在文件夹
              </span>
              <span v-else class="transfer-detail transfer-detail-err">
                {{ item.error || '错误' }}
              </span>
            </div>
          </div>
          <div v-if="item.status === 'downloading'" class="transfer-progress-bar">
            <div
              class="transfer-progress-fill"
              :style="{ width: (item.total ? Math.min(100, Math.round(item.transferred / item.total * 100)) : 0) + '%' }"
            ></div>
          </div>
          <button
            v-if="item.status === 'downloading'"
            class="transfer-action"
            @click.stop="cancelTransfer(id)"
            title="取消"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <button
            v-if="item.status === 'error'"
            class="transfer-action"
            @click.stop="removeTransfer(id)"
            title="移除"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div v-if="contextMenuVisible && contextMenuEntry && !contextMenuEntry.isDirectory" class="context-menu" :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }" @click.stop>
      <button class="context-menu-item" @click="onContextMenuDownload">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>下载文件</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  overflow: hidden;
  user-select: none;
  position: relative;
}

.sidebar-tabs {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding: 0 2px;
  gap: 2px;
}

.sidebar-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 10px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
  position: relative;
}

.sidebar-tab:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sidebar-tab.active {
  color: var(--accent);
}

.sidebar-tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 4px;
  right: 4px;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
}

.sidebar-tab-badge {
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.sidebar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.sidebar-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sidebar-btn-close:hover {
  color: var(--danger);
}

.sidebar-btn-toggle-on {
  color: var(--accent);
  background: var(--accent-bg);
}

.follow-badge {
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.sidebar-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-path {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
  transition: background 0.15s;
  min-height: 26px;
}

.sidebar-path:hover {
  background: var(--bg-tertiary);
}

.path-icon {
  flex-shrink: 0;
}

.path-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  flex: 1;
}

.path-form {
  padding: 0 10px 4px;
}

.path-input {
  width: 100%;
  padding: 3px 8px;
  font-size: 11px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text-primary);
  outline: none;
}

.sidebar-error {
  padding: 6px 10px;
  font-size: 11px;
  color: var(--danger);
  background: rgba(248, 81, 73, 0.1);
  margin: 4px 8px;
  border-radius: 4px;
}

.sidebar-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  color: var(--text-secondary);
  font-size: 12px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.file-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.follow-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.follow-footer-text {
  min-width: 0;
}

.follow-footer-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.follow-footer-desc {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.follow-switch {
  width: 38px;
  height: 22px;
  border: none;
  border-radius: 999px;
  background: var(--bg-tertiary);
  position: relative;
  cursor: pointer;
  transition: background 0.15s;
  flex-shrink: 0;
  padding: 0;
}

.follow-switch.on {
  background: var(--accent);
}

.follow-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}

.follow-switch.on .follow-switch-thumb {
  transform: translateX(16px);
}

.file-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: default;
  transition: background 0.1s;
  min-height: 24px;
}

.file-entry-dir {
  cursor: pointer;
}

.file-entry:hover {
  background: var(--hover-bg);
}

.file-entry-parent:hover {
  background: var(--hover-bg);
}

.file-icon {
  flex-shrink: 0;
}

.file-icon-dir {
  color: #58a6ff;
}

.file-icon-link {
  color: #d2a8ff;
}

.file-icon-file {
  color: var(--text-secondary);
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.file-download-btn {
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.file-download-btn:hover {
  color: var(--accent);
  background: var(--accent-bg);
}

.sidebar-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
}

.downloads-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color);
}

.downloads-btn {
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
}

.downloads-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

.downloads-btn-danger:hover {
  color: var(--danger);
  border-color: var(--danger);
}

.transfer-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.transfer-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  transition: background 0.15s;
}

.transfer-item:hover {
  background: var(--hover-bg);
}

.transfer-completed {
  cursor: pointer;
}

.transfer-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.transfer-file-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
  margin-top: 1px;
}

.transfer-done-icon {
  flex-shrink: 0;
  color: var(--success);
  margin-top: 1px;
}

.transfer-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.transfer-name {
  font-size: 11px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-detail {
  font-size: 10px;
  color: var(--text-secondary);
}

.transfer-detail-ok {
  color: var(--success);
}

.transfer-detail-err {
  color: var(--danger);
}

.transfer-progress-bar {
  width: 60px;
  height: 3px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
  flex-shrink: 0;
}

.transfer-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s;
}

.transfer-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 3px;
  flex-shrink: 0;
  transition: all 0.15s;
}

.transfer-action:hover {
  color: var(--danger);
  background: rgba(248, 81, 73, 0.15);
}

.context-menu {
  position: fixed;
  z-index: 10000;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  padding: 4px 0;
  min-width: 140px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s;
  text-align: left;
}

.context-menu-item:hover {
  background: var(--accent-bg);
  color: var(--accent);
}
</style>
