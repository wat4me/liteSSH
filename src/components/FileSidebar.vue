<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, inject, nextTick } from 'vue'
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
import FileEditorModal from './FileEditorModal.vue'
import FilePropertiesModal from './FilePropertiesModal.vue'

const fileListRef = ref<InstanceType<typeof FileList> | null>(null)

const props = defineProps<{
  sessionId: string
  connectionName: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

type TabType = 'files' | 'downloads' | 'uploads'

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
  syncCwdForce,
  toggleFollowTerminalPath,
  submitPathInput,
  togglePathInput,
  refresh,
  resolvePath,
  cleanRemotePath,
} = useSftpNavigation(() => props.sessionId, pwdTracker)

const {
  transfers,
  activeTransfers,
  downloadTransfers,
  uploadTransfers,
  addTransfer,
  updateProgress,
  markCompleted,
  markError,
  cancelTransfer: cancelTransferAction,
  removeTransfer,
  clearFinishedTransfers,
  getSpeed,
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
const pathInputRef = ref<HTMLInputElement | null>(null)

const showEditor = ref(false)
const editorEntry = ref<FileEntry | null>(null)
const showProperties = ref(false)
const propertiesEntry = ref<FileEntry | null>(null)
const showRename = ref(false)
const renameEntry = ref<FileEntry | null>(null)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

watch(showRename, async (val) => {
  if (val) {
    await nextTick()
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  }
})

watch(showPathInput, async (val) => {
  if (val) {
    await nextTick()
    pathInputRef.value?.focus()
    pathInputRef.value?.select()
  }
})

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
  files.value = []
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

async function reloadRestoredDirectory() {
  if (activeTab.value === 'files' && sftpReady.value && currentPath.value && files.value.length === 0) {
    await loadDirectory(currentPath.value)
  }
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
  await syncCwdForce()
  saveCurrentState()
}

async function handleRefresh() {
  refresh()
}

function toggleFileSearch() {
  fileListRef.value?.toggleSearch()
}

function handleFileListKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    e.stopPropagation()
    toggleFileSearch()
  }
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

const EDITABLE_EXTENSIONS = [
  '.txt', '.md', '.markdown', '.log', '.conf', '.cfg', '.ini',
  '.sh', '.bash', '.zsh', '.fish', '.bat', '.cmd', '.ps1',
  '.py', '.rb', '.pl', '.lua', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.xml', '.yaml', '.yml', '.toml', '.csv',
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.cs', '.java', '.kt', '.swift',
  '.go', '.rs', '.php', '.sql', '.env', '.gitignore', '.dockerignore',
  '.rst', '.tex', '.makefile', '.dockerfile', '.vagrantfile', '.jenkinsfile',
]

const EDITABLE_NAMES = [
  'makefile', 'dockerfile', 'vagrantfile', 'jenkinsfile',
  'readme', 'license', 'changelog', '.gitignore', '.gitattributes',
  '.dockerignore', '.eslintrc', '.prettierrc', '.npmrc', '.nvmrc',
]

function canEditFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  if (EDITABLE_NAMES.includes(lower)) return true
  const dotIdx = lower.lastIndexOf('.')
  if (dotIdx === -1) return false
  return EDITABLE_EXTENSIONS.includes(lower.slice(dotIdx))
}

function openEditor(entry: FileEntry) {
  if (!canEditFile(entry.name)) {
    return
  }
  editorEntry.value = entry
  showEditor.value = true
  hideContextMenu()
}

function closeEditor() {
  showEditor.value = false
  editorEntry.value = null
}

function onEditorSaved() {
  refresh()
}

function openProperties(entry: FileEntry) {
  propertiesEntry.value = entry
  showProperties.value = true
  hideContextMenu()
}

function startRename(entry: FileEntry) {
  hideContextMenu()
  renameEntry.value = entry
  renameValue.value = entry.name
  showRename.value = true
}

function cancelRename() {
  showRename.value = false
  renameEntry.value = null
  renameValue.value = ''
}

async function confirmRename() {
  const entry = renameEntry.value
  if (!entry) return
  const newName = renameValue.value.trim()
  if (!newName || newName === entry.name) {
    cancelRename()
    return
  }
  const dir = entry.path.substring(0, entry.path.lastIndexOf('/') + 1)
  const newPath = dir + newName
  showRename.value = false
  renameEntry.value = null
  try {
    await window.liteSSH.sftpRename(props.sessionId, entry.path, newPath)
    refresh()
  } catch (err: any) {
    error.value = err.message || '重命名失败'
  }
}

function closeProperties() {
  showProperties.value = false
  propertiesEntry.value = null
}

function onPropertiesSaved() {
  refresh()
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

async function initPwdTrackerAndSync() {
  initPwdTracker()
  if (followTerminalPath.value && sftpReady.value && terminalPath.value && terminalPath.value !== currentPath.value) {
    await syncCwd()
    saveCurrentState()
  }
}

async function syncFromTrackedPwd(trackedPwd: string): Promise<boolean> {
  if (!sftpReady.value || !followTerminalPath.value) return false

  const cleanTracked = cleanRemotePath(trackedPwd)
  terminalPath.value = cleanTracked
  if (cleanTracked === currentPath.value) return true

  // Save the current known-good path before attempting to load the new one.
  // This is more reliable than pwdTracker.revertCd() because previousPwd can be
  // corrupted by rapid sequential cd commands.
  const knownGoodPath = currentPath.value

  // Use isFallback=true to prevent loadDirectory's internal revert logic
  // (which relies on previousPwd). We handle the revert ourselves here.
  const ok = await loadDirectory(cleanTracked, true)
  if (ok) {
    saveCurrentState()
    return true
  }

  // Failed to load the tracked path — revert to the last known-good path
  if (knownGoodPath) {
    terminalPath.value = knownGoodPath
    pwdTracker.setPwd(props.sessionId, knownGoodPath)
    // Don't need to reload since currentPath/files are still showing knownGoodPath
    saveCurrentState()
  }
  return false
}

async function handleTerminalCd(command: string): Promise<void> {
    if (!sftpReady.value) return
    const trackedPwd = pwdTracker.getPwd(props.sessionId)
    if (!trackedPwd) return
    await syncFromTrackedPwd(trackedPwd)
  }

watch(
  () => pwdTracker.state[props.sessionId]?.pwd,
  async (trackedPwd) => {
    if (!trackedPwd) return
    await syncFromTrackedPwd(trackedPwd)
  },
  { flush: 'post' }
)

watch(() => props.sessionId, async (newId, oldId) => {
  if (oldId) {
    saveCurrentState(oldId)
  }
  if (newId) {
    bindSessionClosedListener(newId)
    if (loadSavedState(newId)) {
      await initPwdTrackerAndSync()
      await reloadRestoredDirectory()
      saveCurrentState()
      return
    }
    resetState()
    await initSftp()
    await initPwdTrackerAndSync()
    saveCurrentState()
  }
})

onMounted(async () => {
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
    await initPwdTrackerAndSync()
    saveCurrentState()
  } else {
    await initPwdTrackerAndSync()
    await reloadRestoredDirectory()
    saveCurrentState()
  }
})

onBeforeUnmount(() => {
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
  <div class="file-sidebar" @click="hideContextMenu" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" @keydown="handleFileListKeydown" tabindex="0">
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
        <div class="toolbar-group">
          <span class="toolbar-group-label">位置</span>
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
        <div class="toolbar-spacer"></div>
        <div class="toolbar-group">
          <span class="toolbar-group-label">操作</span>
          <button class="sidebar-btn" @click="toggleFileSearch" title="搜索文件 (Ctrl+F)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <button class="sidebar-btn" title="上传文件：拖拽本地文件到列表区域">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="sidebar-path" :class="{ editing: showPathInput }" @click="showPathInput || togglePathInput()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="path-icon">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span v-if="!showPathInput" class="path-text">{{ currentPath }}</span>
        <form v-if="showPathInput" class="path-inline-form" @submit.prevent="submitPathInput">
          <input
            ref="pathInputRef"
            v-model="pathInput"
            class="path-input"
            placeholder="输入路径..."
            @blur="submitPathInput"
            @keydown.escape="showPathInput = false"
          />
        </form>
        <svg v-if="!showPathInput" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:0.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>

      <FileList
        ref="fileListRef"
        :files="files"
        :current-path="currentPath"
        :loading="loading"
        :error="error"
        @navigate="handleNavigate"
        @go-up="handleGoUp"
        @download="startDownload"
        @retry="handleRefresh"
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
        :get-speed="getSpeed"
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
        :get-speed="getSpeed"
        @cancel="cancelTransferAction"
        @remove="removeTransfer"
      />
    </div>

    <div v-if="contextMenuVisible && contextMenuEntry" class="context-menu" :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }" @click.stop>
      <button v-if="!contextMenuEntry.isDirectory" class="context-menu-item" @click="onContextMenuDownload">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>下载</span>
      </button>
      <button
        v-if="!contextMenuEntry.isDirectory && canEditFile(contextMenuEntry.name)"
        class="context-menu-item"
        @click="openEditor(contextMenuEntry)"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <span>编辑</span>
      </button>
      <button class="context-menu-item" @click="startRename(contextMenuEntry)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
        </svg>
        <span>重命名</span>
      </button>
      <button class="context-menu-item" @click="openProperties(contextMenuEntry)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>属性</span>
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

    <FileEditorModal
      :visible="showEditor"
      :session-id="sessionId"
      :remote-path="editorEntry?.path || ''"
      :file-name="editorEntry?.name || ''"
      @close="closeEditor"
      @saved="onEditorSaved"
    />

    <FilePropertiesModal
      :visible="showProperties"
      :session-id="sessionId"
      :remote-path="propertiesEntry?.path || ''"
      :file-name="propertiesEntry?.name || ''"
      :initial-permissions="propertiesEntry?.permissions?.substring(1) || ''"
      @close="closeProperties"
      @refresh="onPropertiesSaved"
    />

    <div v-if="showRename" class="rename-overlay" @click.self="cancelRename">
      <div class="rename-modal">
        <div class="rename-title">重命名</div>
        <div class="rename-original">
          <span class="rename-label">原名称</span>
          <span class="rename-original-name" :title="renameEntry?.name">{{ renameEntry?.name }}</span>
        </div>
        <div class="rename-new">
          <span class="rename-label">新名称</span>
          <input
            ref="renameInputRef"
            v-model="renameValue"
            class="rename-input"
            @keydown.enter="confirmRename"
            @keydown.escape="cancelRename"
          />
        </div>
        <div class="rename-actions">
          <button class="rename-cancel-btn" @click="cancelRename">取消</button>
          <button class="rename-confirm-btn" @click="confirmRename">确认</button>
        </div>
      </div>
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
  width: 28px;
  height: 28px;
  border: none;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-tertiary) 70%, transparent), transparent);
  color: var(--text-secondary);
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.sidebar-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
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
  gap: 6px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--border-color);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 3px;
}

.toolbar-group-label {
  font-size: 10px;
  color: var(--text-secondary);
  margin-right: 2px;
}

.toolbar-spacer {
  flex: 1;
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

.sidebar-path.editing {
  cursor: default;
}

.path-inline-form {
  flex: 1;
  min-width: 0;
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
  max-height: calc(100vh - 8px);
  overflow-y: auto;
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

.rename-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.rename-modal {
  width: 360px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 18px;
}

.rename-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 14px;
}

.rename-original,
.rename-new {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.rename-new {
  margin-bottom: 16px;
}

.rename-label {
  width: 52px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
}

.rename-original-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 7px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.rename-input {
  flex: 1;
  padding: 7px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.rename-input:focus {
  border-color: var(--accent);
}

.rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.rename-cancel-btn {
  padding: 6px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.rename-cancel-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.rename-confirm-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.rename-confirm-btn:hover {
  background: var(--accent-hover);
}
</style>
