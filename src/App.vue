<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, provide } from 'vue'
import { ElMessage } from 'element-plus'
import ConnectionsView from './views/ConnectionsView.vue'
import TabBar from './components/TabBar.vue'
import SubTabBar from './components/SubTabBar.vue'
import TerminalTab from './components/TerminalTab.vue'
import FileSidebar from './components/FileSidebar.vue'
import MonitorPanel from './components/MonitorPanel.vue'
import { useTheme } from './composables/useTheme'
import { useTerminalPwd } from './composables/useTerminalPwd'
import type { Connection } from './env.d.ts'
import type { Theme } from './composables/useTheme'
import type { CustomColors } from './composables/useTheme'

const HOME_ID = '__home__'

interface Session {
  id: string
  connectionId: string
  connectionName: string
  tabNumber: number
}

interface ConnectionGroup {
  connectionId: string
  connectionName: string
  sessions: Session[]
  activeSessionId: string | null
  nextTabNumber: number
}

const { theme, customColors } = useTheme()
const pwdTracker = useTerminalPwd()

const connections = ref<Connection[]>([])
const recentConnections = ref<Connection[]>([])
const groups = ref<ConnectionGroup[]>([])
const activeGroupId = ref<string>(HOME_ID)
const sidebarVisible = ref(false)
const sidebarWidth = ref(260)
const sidebarSessionId = ref<string | null>(null)
const sidebarGroupId = ref<string | null>(null)
const connectionsViewRef = ref<InstanceType<typeof ConnectionsView> | null>(null)
const fileSidebarRef = ref<InstanceType<typeof FileSidebar> | null>(null)
const latencyMap = ref<Record<string, number>>({})
const latencyEnabled = ref(true)
const latencyIntervalMs = ref(10000)

const monitorVisible = ref(false)
const monitorWidth = ref(280)
const monitorEnabled = ref(true)
let resizing = false
let resizeStartX = 0
let resizeStartWidth = 0
let resizingRight = false
let resizeStartXRight = 0
let resizeStartWidthRight = 0

function onLatency(sessionId: string, ms: number) {
  if (!latencyEnabled.value) return
  const group = getGroupBySessionId(sessionId)
  if (group) {
    latencyMap.value = { ...latencyMap.value, [group.connectionId]: ms }
  }
}

function onResizeMove(e: MouseEvent) {
  if (resizing) {
    const diff = e.clientX - resizeStartX
    const newWidth = Math.max(180, Math.min(600, resizeStartWidth + diff))
    sidebarWidth.value = newWidth
  }
  if (resizingRight) {
    const diff = resizeStartXRight - e.clientX
    const newWidth = Math.max(200, Math.min(500, resizeStartWidthRight + diff))
    monitorWidth.value = newWidth
  }
}

function onResizeUp() {
  resizing = false
  resizingRight = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function startResize(e: MouseEvent) {
  resizing = true
  resizeStartX = e.clientX
  resizeStartWidth = sidebarWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function startResizeRight(e: MouseEvent) {
  resizingRight = true
  resizeStartXRight = e.clientX
  resizeStartWidthRight = monitorWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
})

provide('theme', theme)
provide('customColors', customColors)
provide('pwdTracker', pwdTracker)

const isHomeActive = computed(() => activeGroupId.value === HOME_ID)

const activeGroup = computed(() => {
  if (isHomeActive.value) return null
  return groups.value.find((g) => g.connectionId === activeGroupId.value) || null
})

const activeSessionId = computed(() => {
  return activeGroup.value?.activeSessionId || null
})

const activeSession = computed(() => {
  if (!activeGroup.value?.activeSessionId) return null
  return activeGroup.value.sessions.find((session) => session.id === activeGroup.value?.activeSessionId) || null
})

const TERMINAL_CACHE_MAX = 12

function getLastSessionId(group: ConnectionGroup | null): string | null {
  if (!group || group.sessions.length === 0) return null
  return group.sessions[group.sessions.length - 1].id
}

function getGroupByConnectionId(connectionId: string | null): ConnectionGroup | null {
  if (!connectionId) return null
  return groups.value.find((group) => group.connectionId === connectionId) || null
}

function getGroupBySessionId(sessionId: string): ConnectionGroup | null {
  return groups.value.find((group) => group.sessions.some((session) => session.id === sessionId)) || null
}

function setSidebarTarget(groupId: string | null, sessionId: string | null) {
  sidebarGroupId.value = groupId
  sidebarSessionId.value = sessionId
}

function syncSidebarState() {
  if (groups.value.length === 0) {
    setSidebarTarget(null, null)
    sidebarVisible.value = false
    return
  }

  const sidebarGroup = getGroupByConnectionId(sidebarGroupId.value)
  if (sidebarGroup) {
    const sessionExists = sidebarSessionId.value
      ? sidebarGroup.sessions.some((session) => session.id === sidebarSessionId.value)
      : false

    if (!sessionExists) {
      sidebarSessionId.value = sidebarGroup.activeSessionId || getLastSessionId(sidebarGroup)
    }
    return
  }

  if (activeGroupId.value !== HOME_ID) {
    const group = getGroupByConnectionId(activeGroupId.value)
    if (group) {
      setSidebarTarget(group.connectionId, group.activeSessionId || getLastSessionId(group))
      return
    }
  }

  setSidebarTarget(null, null)
}

watch([activeGroupId, activeSessionId], ([newGroupId, newSessionId]) => {
  if (newGroupId === HOME_ID) {
    connectionsViewRef.value?.loadData()
    return
  }

  if (!newGroupId) return

  const group = getGroupByConnectionId(newGroupId)
  if (!group) return

  const targetSessionId = newSessionId || group.activeSessionId || getLastSessionId(group)
  if (!targetSessionId) return

  setSidebarTarget(newGroupId, targetSessionId)
}, { immediate: true })

function handleKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return

  if (e.key === 'b') {
    e.preventDefault()
    toggleSidebar()
  } else if (e.key === 'w' && !isHomeActive.value) {
    if (document.activeElement?.closest('.xterm-container')) return
    e.preventDefault()
    const group = activeGroup.value
    if (group) onCloseGroup(group.connectionId)
  }
}

function handleLatencySettingsChange(e: Event) {
  const detail = (e as CustomEvent).detail
  if (detail) {
    latencyEnabled.value = detail.enabled
    latencyIntervalMs.value = detail.intervalMs
  }
}

function handleMonitorSettingsChange(e: Event) {
  const detail = (e as CustomEvent).detail
  if (detail) {
    monitorEnabled.value = detail.enabled
  }
}

onMounted(async () => {
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('latency-settings-change', handleLatencySettingsChange)
  window.addEventListener('monitor-settings-change', handleMonitorSettingsChange)
  const encAvailable = await window.liteSSH.isEncryptionAvailable()
  if (!encAvailable) {
    ElMessage.warning({
      message: '密码加密不可用，连接密码将以明文存储。建议安装系统密钥环（如 gnome-keyring 或 KDE wallet）。',
      duration: 8000,
    })
  }
  latencyEnabled.value = await window.liteSSH.getLatencyEnabled()
  latencyIntervalMs.value = await window.liteSSH.getLatencyIntervalMs()
  monitorEnabled.value = await window.liteSSH.getMonitorEnabled()
  await Promise.all([
    loadConnections(),
    loadRecentConnections(),
  ])
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('latency-settings-change', handleLatencySettingsChange)
  window.removeEventListener('monitor-settings-change', handleMonitorSettingsChange)
})

async function loadConnections() {
  connections.value = await window.liteSSH.getConnections()
}

async function loadRecentConnections() {
  recentConnections.value = await window.liteSSH.getRecentConnections()
}

async function createSession(connectionId: string) {
  await loadConnections()
  const conn = connections.value.find((c) => c.id === connectionId)
  if (!conn) return

  try {
    const sessionId = await window.liteSSH.sshConnect(connectionId)
    let group = groups.value.find((g) => g.connectionId === connectionId)

    const session: Session = {
      id: sessionId,
      connectionId,
      connectionName: conn.name,
      tabNumber: 0,
    }

    if (group) {
      session.tabNumber = group.nextTabNumber++
      group.sessions.push(session)
      group.activeSessionId = sessionId
    } else {
      session.tabNumber = 1
      group = {
        connectionId,
        connectionName: conn.name,
        sessions: [session],
        activeSessionId: sessionId,
        nextTabNumber: 2,
      }
      groups.value.push(group)
    }

    activeGroupId.value = connectionId
    setSidebarTarget(connectionId, sessionId)
    sidebarVisible.value = true
    await window.liteSSH.recordRecentConnection(connectionId)
    await loadRecentConnections()
  } catch (err: any) {
    console.error('SSH connection failed:', err)
    ElMessage.error(err.message || '连接失败')
  }
}

async function onConnect(connectionId: string) {
  await createSession(connectionId)
}

function syncConnectionName(connection: Connection) {
  connections.value = connections.value.map((item) =>
    item.id === connection.id ? { ...item, ...connection } : item
  )
  recentConnections.value = recentConnections.value.map((item) =>
    item.id === connection.id ? { ...item, ...connection } : item
  )

  const group = groups.value.find((item) => item.connectionId === connection.id)
  if (!group) return

  group.connectionName = connection.name
  for (const session of group.sessions) {
    session.connectionName = connection.name
  }
}

function onSelectGroup(connectionId: string) {
  activeGroupId.value = connectionId
}

function onSelectHome() {
  activeGroupId.value = HOME_ID
}

async function onQuickConnect(connectionId: string) {
  await createSession(connectionId)
}

async function onCloseGroup(connectionId: string) {
  const group = getGroupByConnectionId(connectionId)
  if (!group) return

  const sessionIds = group.sessions.map((session) => session.id)
  for (const sessionId of sessionIds) {
    try {
      await window.liteSSH.sshDisconnect(sessionId)
    } catch {}
  }

  const idx = groups.value.findIndex((g) => g.connectionId === connectionId)
  if (idx !== -1) groups.value.splice(idx, 1)

  if (sidebarGroupId.value === connectionId) {
    setSidebarTarget(null, null)
  }

  if (activeGroupId.value === connectionId) {
    activeGroupId.value = groups.value.length > 0 ? groups.value[0].connectionId : HOME_ID
  }

  syncSidebarState()
}

function onSelectSession(sessionId: string) {
  if (!activeGroup.value) return
  activeGroup.value.activeSessionId = sessionId
  setSidebarTarget(activeGroup.value.connectionId, sessionId)
}

function removeSessionFromState(sessionId: string) {
  const group = getGroupBySessionId(sessionId)
  if (!group) return

  const idx = group.sessions.findIndex((session) => session.id === sessionId)
  if (idx === -1) return

  group.sessions.splice(idx, 1)
  pwdTracker.removeSession(sessionId)
  fileSidebarRef.value?.clearSessionState(sessionId)

  if (group.activeSessionId === sessionId) {
    group.activeSessionId = getLastSessionId(group)
  }

  if (sidebarGroupId.value === group.connectionId && sidebarSessionId.value === sessionId) {
    sidebarSessionId.value = group.activeSessionId || getLastSessionId(group)
  }

  if (group.sessions.length === 0) {
    const groupIdx = groups.value.findIndex((item) => item.connectionId === group.connectionId)
    if (groupIdx !== -1) groups.value.splice(groupIdx, 1)

    if (sidebarGroupId.value === group.connectionId) {
      setSidebarTarget(null, null)
    }

    if (activeGroupId.value === group.connectionId) {
      activeGroupId.value = groups.value.length > 0 ? groups.value[0].connectionId : HOME_ID
    }
  }

  syncSidebarState()
}

async function onCloseSession(sessionId: string) {
  const group = getGroupBySessionId(sessionId)
  await window.liteSSH.sshDisconnect(sessionId)
  removeSessionFromState(sessionId)
}

function onSessionClosed(sessionId: string) {
  const group = getGroupBySessionId(sessionId)
  removeSessionFromState(sessionId)
}

function toggleSidebar() {
  sidebarVisible.value = !sidebarVisible.value
}

function toggleMonitor() {
  monitorVisible.value = !monitorVisible.value
}

function onCdCommand(sessionId: string, command: string) {
  // Always track PWD from cd commands, even before sidebar opens
  pwdTracker.handleCd(sessionId, command)
  if (!fileSidebarRef.value) return
  if (sidebarSessionId.value === sessionId) {
    fileSidebarRef.value.handleTerminalCd(command)
  }
}

</script>

<template>
  <div class="app-container">
    <div class="titlebar-spacer">
      <span class="titlebar-text">liteSSH</span>
    </div>
    <div class="workspace">
      <TabBar
        :groups="groups"
        :active-group-id="activeGroupId"
        :recent-connections="recentConnections"
        :latency-map="latencyEnabled ? latencyMap : null"
        :latency-enabled="latencyEnabled"
        @select="onSelectGroup"
        @close="onCloseGroup"
        @select-home="onSelectHome"
        @quick-connect="onQuickConnect"
      />

      <ConnectionsView
        ref="connectionsViewRef"
        v-show="isHomeActive"
        @connect="onConnect"
        @connection-saved="syncConnectionName"
      />

      <div v-show="!isHomeActive" class="workspace-content">
        <div class="left-toolbar">
          <button
            class="toolbar-icon-btn"
            :class="{ active: sidebarVisible }"
            @click="toggleSidebar"
            title="SFTP 文件浏览"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button
            class="toolbar-icon-btn"
            :class="{ active: monitorVisible }"
            @click="toggleMonitor"
            title="服务器监控"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </button>
        </div>

        <template v-if="sidebarVisible && sidebarSessionId">
          <div class="sidebar-panel" :style="{ width: sidebarWidth + 'px' }">
            <FileSidebar
              ref="fileSidebarRef"
              :session-id="sidebarSessionId"
              :connection-name="activeGroup?.connectionName || ''"
              @close="sidebarVisible = false"
            />
          </div>
          <div
            class="resize-handle"
            @mousedown="startResize"
          ></div>
        </template>

        <div class="terminal-section">
          <SubTabBar
            v-if="activeGroup && activeGroup.sessions.length > 0"
            :sessions="activeGroup.sessions"
            :active-session-id="activeGroup.activeSessionId"
            :connection-id="activeGroup.connectionId"
            @select="onSelectSession"
            @close="onCloseSession"
            @add="createSession"
          />
          <div class="terminal-container">
            <KeepAlive :max="TERMINAL_CACHE_MAX">
              <TerminalTab
                v-if="activeSession"
                :key="activeSession.id"
                :session-id="activeSession.id"
                :connection-name="activeSession.connectionName"
                :connection-id="activeSession.connectionId"
                @closed="onSessionClosed"
                @cd-command="onCdCommand"
                @reconnect="createSession"
                @latency="onLatency"
              />
            </KeepAlive>
          </div>
        </div>

        <template v-if="monitorVisible && activeSession">
          <div
            class="resize-handle"
            @mousedown="startResizeRight"
          ></div>
          <div class="monitor-panel-wrapper" :style="{ width: monitorWidth + 'px' }">
            <MonitorPanel
              :key="activeGroup!.connectionId"
              :session-id="activeSession.id"
              :connection-id="activeGroup!.connectionId"
              :connection-name="activeSession.connectionName"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.titlebar-spacer {
  height: 36px;
  min-height: 36px;
  -webkit-app-region: drag;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  padding-left: 16px;
  transition: background-color 0.3s;
}

.titlebar-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}

.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.workspace-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-toolbar {
  width: 40px;
  min-width: 40px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8px;
  gap: 4px;
}

.toolbar-icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
}

.toolbar-icon-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.toolbar-icon-btn.active {
  color: var(--accent);
  background: var(--accent-bg);
}

.sidebar-panel {
  flex-shrink: 0;
  overflow: hidden;
}

.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
}

.resize-handle:hover {
  background: var(--accent);
}

.terminal-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.terminal-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.monitor-panel-wrapper {
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  overflow: hidden;
}
</style>
