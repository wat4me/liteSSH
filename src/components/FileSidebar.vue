<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, inject } from 'vue'
import type { FileEntry } from '../env.d.ts'
import { useSftpNavigation } from '../composables/useSftpNavigation'
import { useTransfers } from '../composables/useTransfers'
import { useDragDrop } from '../composables/useDragDrop'
import { useContextMenu } from '../composables/useContextMenu'
import { useSessionState } from '../composables/useSessionState'
import type { TerminalPwdTracker } from '../composables/useTerminalPwd'
import FileList from './FileList.vue'
import TransferList from './TransferList.vue'
import UploadConfirmModal from './UploadConfirmModal.vue'

const props = defineProps<{
  sessionId: string
  connectionName: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

type TabType = 'files' | 'downloads' | 'uploads'
const FOLLOW_SYNC_POLL_MS = 60_000

const activeTab = ref<TabType>('files')
const pwdTracker = inject<TerminalPwdTracker>('pwdTracker')!

const {
  currentPath,
  files,
  loading,
  error,
  sftpReady,
  pathInput,
  showPathInput,
  homePath,
  shellHomePath,
  terminalPath,
  lastPathDebug,
  followTerminalPath,
  previousTerminalPath,
  initSftp,
  loadDirectory,
  navigateTo,
  goUp,
  goToHome,
  syncCwd,
  toggleFollowTerminalPath,
  submitPathInput,
  togglePathInput,
  refresh,
} = useSftpNavigation(() => props.sessionId, pwdTracker)

const {
  transfers,
  downloadTransfers,
  uploadTransfers,
  addTransfer,
  updateProgress,
  markCompleted,
  markError,
  cancelTransfer: cancelTransferAction,
  removeTransfer,
  clearFinishedTransfers,
  formatSize,
} = useTransfers(() => props.sessionId)

const {
  contextMenuVisible,
  contextMenuX,
  contextMenuY,
  contextMenuEntry,
  hideContextMenu,
  onContextMenu,
} = useContextMenu()

const { persistSessionState, restoreSessionState, clearSessionState } = useSessionState()

const showUploadConfirm = ref(false)
const uploadFiles = ref<{ name: string; path: string }[]>([])
const uploadTargetPath = ref('')

function handleFilesDropped(files: { name: string; path: string }[]) {
  uploadFiles.value = files
  uploadTargetPath.value = currentPath.value
  showUploadConfirm.value = true
}

const { isDragOver, onDragOver, onDragLeave, onDrop } = useDragDrop(handleFilesDropped)

let unsubClosed: (() => void) | null = null
let unsubStart: (() => void) | null = null
let unsubProgress: (() => void) | null = null
let unsubComplete: (() => void) | null = null
let unsubError: (() => void) | null = null
let followSyncTimer: ReturnType<typeof setInterval> | null = null

function handleSessionClosed(sessionId: string) {
  if (props.sessionId !== sessionId) return
  sftpReady.value = false
  error.value = '连接已断开'
  saveCurrentState(sessionId)
}

function bindSessionClosedListener(sessionId: string) {
  unsubClosed?.()
  unsubClosed = window.liteSSH.onSshClosed(sessionId, () => {
    handleSessionClosed(sessionId)
  })
}

function saveCurrentState(sessionId = props.sessionId) {
  persistSessionState(sessionId, {
    activeTab: activeTab.value,
    currentPath: currentPath.value,
    files: files.value,
    error: error.value,
    sftpReady: sftpReady.value,
    pathInput: pathInput.value,
    homePath: homePath.value,
    shellHomePath: shellHomePath.value,
    terminalPath: terminalPath.value,
    lastPathDebug: lastPathDebug.value,
    followTerminalPath: followTerminalPath.value,
    previousTerminalPath: previousTerminalPath.value,
  })
}

function loadSavedState(sessionId: string): boolean {
  const cached = restoreSessionState(sessionId)
  if (!cached) return false
  activeTab.value = cached.activeTab
  currentPath.value = cached.currentPath
  files.value = cached.files
  error.value = cached.error
  sftpReady.value = cached.sftpReady
  pathInput.value = cached.pathInput
  homePath.value = cached.homePath
  shellHomePath.value = cached.shellHomePath
  terminalPath.value = cached.terminalPath
  lastPathDebug.value = cached.lastPathDebug
  followTerminalPath.value = cached.followTerminalPath
  previousTerminalPath.value = cached.previousTerminalPath
  // If SFTP is not ready, return false to trigger initSftp
  if (!sftpReady.value) return false
  return true
}

function resetState() {
  files.value = []
  currentPath.value = ''
  terminalPath.value = ''
  previousTerminalPath.value = ''
  homePath.value = ''
  shellHomePath.value = ''
  pathInput.value = ''
  lastPathDebug.value = ''
  error.value = ''
  sftpReady.value = false
}

async function handleNavigate(entry: FileEntry) {
  await navigateTo(entry)
  saveCurrentState()
}

async function handleGoUp() {
  await goUp()
  saveCurrentState()
}

async function handleSyncCwd() {
  await syncCwd()
  saveCurrentState()
}

async function handleRefresh() {
  refresh()
}

async function handleToggleFollow() {
  await toggleFollowTerminalPath()
  saveCurrentState()
}

function startDownload(entry: FileEntry) {
  if (entry.isDirectory) return
  const transferId = `dl-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  window.liteSSH.sftpDownload(props.sessionId, entry.path, entry.name, transferId)
  activeTab.value = 'downloads'
}

function onContextMenuDownload() {
  if (contextMenuEntry.value) {
    startDownload(contextMenuEntry.value)
  }
  hideContextMenu()
}

async function confirmUpload() {
  for (const file of uploadFiles.value) {
    const transferId = `ul-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    window.liteSSH.sftpUpload(props.sessionId, file.path, currentPath.value, file.name, transferId)
  }
  showUploadConfirm.value = false
  uploadFiles.value = []
  activeTab.value = 'uploads'
}

function cancelUpload() {
  showUploadConfirm.value = false
  uploadFiles.value = []
}

function openInFolder(localPath: string) {
  window.liteSSH.shellShowItemInFolder(localPath)
}

function startFollowSyncTimer() {
  if (followSyncTimer) return
  followSyncTimer = setInterval(async () => {
    if (!sftpReady.value || loading.value) return
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return
    if (!currentPath.value) return
    try {
      await window.liteSSH.sftpRealpath(props.sessionId, currentPath.value)
    } catch {
      return
    }
  }, FOLLOW_SYNC_POLL_MS)
}

function stopFollowSyncTimer() {
  if (followSyncTimer) {
    clearInterval(followSyncTimer)
    followSyncTimer = null
  }
}

function initPwdTracker() {
  if (!pwdTracker.hasSession(props.sessionId)) {
    pwdTracker.initSession(props.sessionId, homePath.value, terminalPath.value)
  }
  // Sync terminalPath from the global tracker (may have been updated by cd commands from App.vue)
  const tracked = pwdTracker.getPwd(props.sessionId)
  if (tracked && tracked !== terminalPath.value) {
    terminalPath.value = tracked
  }
}

function handleTerminalCd(command: string) {
  const match = command.match(/(?:^|[;&|]\s*)cd\s+(.+?)$/)
  const path = match ? match[1].trim() : command.trim()
  if (!path || path === '~') {
    goToHome()
    return
  }
  const basePath = terminalPath.value || currentPath.value || '/'
  const absolutePath = path.startsWith('/') ? path : (basePath === '/' ? `/${path}` : `${basePath}/${path}`)
  window.liteSSH.sftpRealpath(props.sessionId, absolutePath).then((resolved) => {
    terminalPath.value = resolved
    if (followTerminalPath.value && sftpReady.value) {
      requestAnimationFrame(() => {
        loadDirectory(resolved).then(() => saveCurrentState())
      })
    }
  }).catch(() => {
    pwdTracker.revertCd(props.sessionId)
  })
}

watch(() => props.sessionId, async (newId, oldId) => {
  if (oldId) {
    saveCurrentState(oldId)
  }
  if (newId) {
    bindSessionClosedListener(newId)
    if (loadSavedState(newId)) {
      initPwdTracker()
      return
    }
    resetState()
    await initSftp()
    initPwdTracker()
    saveCurrentState()
  }
})

watch(followTerminalPath, (on) => {
  if (on) startFollowSyncTimer()
  else stopFollowSyncTimer()
})

onMounted(async () => {
  if (followTerminalPath.value) startFollowSyncTimer()
  bindSessionClosedListener(props.sessionId)

  unsubStart = window.liteSSH.onTransferStart((sessionId, transferId, fileName, localPath, direction) => {
    addTransfer(sessionId, transferId, fileName, localPath, direction)
  })

  unsubProgress = window.liteSSH.onTransferProgress((sessionId, transferId, transferred, total) => {
    updateProgress(sessionId, transferId, transferred, total)
  })

  unsubComplete = window.liteSSH.onTransferComplete((sessionId, transferId) => {
    markCompleted(sessionId, transferId)
  })

  unsubError = window.liteSSH.onTransferError((sessionId, transferId, errorMsg) => {
    markError(sessionId, transferId, errorMsg)
  })

  globalThis.addEventListener('click', hideContextMenu)
  if (!loadSavedState(props.sessionId)) {
    await initSftp()
    initPwdTracker()
    saveCurrentState()
  } else {
    initPwdTracker()
  }
})

onBeforeUnmount(() => {
  stopFollowSyncTimer()
  saveCurrentState()
  unsubClosed?.()
  unsubStart?.()
  unsubProgress?.()
  unsubComplete?.()
  unsubError?.()
  globalThis.removeEventListener('click', hideContextMenu)
})

defineExpose({ handleTerminalCd, clearSessionState })
</script>

<template>
  <div class="file-sidebar" @click="hideContextMenu" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <div v-if="isDragOver && currentPath" class="drag-overlay">
      <div class="drag-overlay-content">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span>上传到 {{ currentPath }}</span>
      </div>
    </div>
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
        <span v-if="downloadTransfers.length > 0" class="sidebar-tab-badge">{{ downloadTransfers.length }}</span>
      </button>
      <button
        class="sidebar-tab"
        :class="{ active: activeTab === 'uploads' }"
        @click="activeTab = 'uploads'"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span>上传</span>
        <span v-if="uploadTransfers.length > 0" class="sidebar-tab-badge">{{ uploadTransfers.length }}</span>
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
        <button class="sidebar-btn" @click="handleSyncCwd" title="同步终端目录">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l5.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
        <button class="sidebar-btn" @click="handleRefresh" title="刷新">
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

      <FileList
        :files="files"
        :current-path="currentPath"
        :loading="loading"
        :error="error"
        @navigate="handleNavigate"
        @go-up="handleGoUp"
        @download="startDownload"
        @context-menu="onContextMenu"
      />

      <div class="follow-footer">
        <div class="follow-footer-text">
          <div class="follow-footer-title">跟随终端目录</div>
          <div class="follow-footer-desc">开启后执行 cd 自动同步文件目录</div>
        </div>
        <button
          class="follow-switch"
          :class="{ on: followTerminalPath }"
          @click="handleToggleFollow"
          :title="followTerminalPath ? '跟随终端目录：已开启' : '跟随终端目录：已关闭'"
        >
          <span class="follow-switch-thumb"></span>
        </button>
      </div>
    </div>

    <div v-else-if="activeTab === 'downloads'" class="sidebar-content">
      <div class="downloads-toolbar">
        <button class="downloads-btn" @click="clearFinishedTransfers('download')">清理记录</button>
      </div>
      <TransferList
        :transfers="downloadTransfers"
        direction="download"
        empty-text="暂无下载记录"
        @cancel="cancelTransferAction"
        @remove="removeTransfer"
        @open-folder="openInFolder"
      />
    </div>

    <div v-else-if="activeTab === 'uploads'" class="sidebar-content">
      <div class="downloads-toolbar">
        <button class="downloads-btn" @click="clearFinishedTransfers('upload')">清理记录</button>
      </div>
      <TransferList
        :transfers="uploadTransfers"
        direction="upload"
        empty-text="暂无上传记录"
        @cancel="cancelTransferAction"
        @remove="removeTransfer"
      />
    </div>

    <div v-if="contextMenuVisible && contextMenuEntry && !contextMenuEntry.isDirectory" class="context-menu" :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }" @click.stop>
      <button class="context-menu-item" @click="onContextMenuDownload">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>下载文件</span>
      </button>
    </div>

    <UploadConfirmModal
      :visible="showUploadConfirm"
      :files="uploadFiles"
      :target-path="uploadTargetPath"
      :existing-files="files"
      @confirm="confirmUpload"
      @cancel="cancelUpload"
    />
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

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drag-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--accent);
  font-size: 14px;
  font-weight: 600;
}
</style>
