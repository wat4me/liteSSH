<script setup lang="ts">
import { defineAsyncComponent, onMounted, onBeforeUnmount, provide, ref, computed } from 'vue'
import ConnectionsView from './views/ConnectionsView.vue'
import TabBar from './components/TabBar.vue'
import type { AppBootstrapData, Connection } from './env.d'
import { useTheme } from './composables/useTheme'
import { useTerminalPwd } from './composables/useTerminalPwd'
import { useSessionManager, HOME_ID, type Session } from './composables/useSessionManager'
import { useSidebarState } from './composables/useSidebarState'
import { useLatencyState } from './composables/useLatencyState'
import { useAppKeyboard } from './composables/useAppKeyboard'
import { useSplitTerminal } from './composables/useSplitTerminal'
import type { BatchCommandTarget } from './composables/useBatchCommand'

const TerminalTab = defineAsyncComponent(() => import('./components/TerminalTab.vue'))
const FileSidebar = defineAsyncComponent(() => import('./components/FileSidebar.vue'))
const MonitorPanel = defineAsyncComponent(() => import('./components/MonitorPanel.vue'))
const AiSidebar = defineAsyncComponent(() => import('./components/AiSidebar.vue'))
const SubTabBar = defineAsyncComponent(() => import('./components/SubTabBar.vue'))
const BatchCommandPanel = defineAsyncComponent(() => import('./components/BatchCommandPanel.vue'))

const { theme, customColors } = useTheme()
const pwdTracker = useTerminalPwd()

const session = useSessionManager({ pwdTracker })

const {
  groups,
  connections,
  recentConnections,
  activeGroupId,
  isHomeActive,
  activeGroup,
  activeSession,
  activeSessionId,
  onConnect,
  onCloseGroup,
  onSelectGroup,
  onSelectHome,
  onQuickConnect,
  onSelectSession,
  onCloseSession,
  onSessionClosed,
  createSession,
  syncConnectionName,
  getGroupBySessionId,
  getGroupByConnectionId,
  getLastSessionId,
  connectSidebar,
  loadConnections,
  loadRecentConnections,
  hydrateConnectionData,
} = session

const connectionsBootstrap = ref<Pick<AppBootstrapData, 'connections' | 'groups'> | null>(null)
const bootstrapPending = ref(true)

const sidebar = useSidebarState({
  groups,
  activeGroupId,
  activeSessionId,
  HOME_ID,
  getGroupByConnectionId,
  getLastSessionId,
})

const {
  sidebarVisible,
  aiSidebarVisible,
  sidebarWidth,
  monitorWidth,
  monitorVisible,
  monitorEnabled,
  sidebarSessionId,
  sidebarGroupId,
  aiSelectionRequest,
  connectionsViewRef,
  fileSidebarRef,
  toggleSidebar,
  toggleAiSidebar,
  toggleMonitor,
  setSidebarTarget,
  syncSidebarState,
  startResize,
  startResizeRight,
  handleAiSelection,
  handleAiSelectionConsumed,
  handleMonitorSettingsChange,
} = sidebar

connectSidebar({
  sidebarVisible,
  aiSidebarVisible,
  sidebarGroupId,
  sidebarSessionId,
  fileSidebarRef,
  setSidebarTarget,
  syncSidebarState,
})

const {
  latencyMap,
  sessionLatencyMap,
  latencyEnabled,
  latencyIntervalMs,
  onLatency,
  clearSessionLatency,
  handleLatencySettingsChange,
} = useLatencyState({
  getGroupBySessionId,
})

const { handleKeydown } = useAppKeyboard({
  isHomeActive,
  activeGroup,
  toggleSidebar,
  onCloseGroup,
})

const {
  splitMode,
  splitRatio,
  isSplit,
  toggleHorizontal,
  toggleVertical,
  closeSplit,
  startSplitResize,
} = useSplitTerminal()

const terminalContainerRef = ref<HTMLElement | null>(null)

function onSplitDividerMousedown(e: MouseEvent) {
  if (terminalContainerRef.value) {
    startSplitResize(e, terminalContainerRef.value)
  }
}

const batchPanelVisible = ref(false)

function toggleBatchPanel() {
  batchPanelVisible.value = !batchPanelVisible.value
}

function findConnection(connectionId: string): Connection | null {
  return connections.value.find((connection) => connection.id === connectionId) || null
}

function getSshAddress(connectionId: string): string {
  const connection = findConnection(connectionId)
  if (!connection) return ''
  return `${connection.username}@${connection.host}:${connection.port}`
}

function getSessionSshAddress(session: Session | null | undefined): string {
  if (!session) return ''
  return getSshAddress(session.connectionId)
}

const activeGroupSshAddress = computed(() => {
  if (!activeGroup.value) return ''
  return getSshAddress(activeGroup.value.connectionId)
})

function getTerminalLabel(session: Session | null | undefined): string {
  return session ? `终端 ${session.tabNumber}` : ''
}

function getSessionDisplayName(session: Session | null | undefined): string {
  if (!session) return ''
  return `${session.connectionName} · ${getTerminalLabel(session)}`
}

function buildBatchSessionTarget(session: Session): BatchCommandTarget {
  return {
    id: session.id,
    connectionName: session.connectionName,
    sshAddress: getSshAddress(session.connectionId),
    tabNumber: session.tabNumber,
    terminalLabel: getTerminalLabel(session),
    displayName: getSessionDisplayName(session),
  }
}

const batchSessions = computed<BatchCommandTarget[]>(() => {
  const sessions: BatchCommandTarget[] = []
  for (const group of groups.value) {
    for (const session of group.sessions) {
      sessions.push(buildBatchSessionTarget(session))
    }
  }
  return sessions
})

const secondarySession = computed(() => {
  if (!activeGroup.value || activeGroup.value.sessions.length < 2) return null
  const activeId = activeGroup.value.activeSessionId
  return activeGroup.value.sessions.find(s => s.id !== activeId) || activeGroup.value.sessions[1]
})

const splitHasSecondary = computed(() => isSplit.value && !!secondarySession.value)
const showSessionTabs = computed(() => {
  if (!activeGroup.value || activeGroup.value.sessions.length === 0) return false
  return !(splitHasSecondary.value && activeGroup.value.sessions.length === 2)
})
const showSplitModeBar = computed(() => splitHasSecondary.value && !showSessionTabs.value && !!activeGroup.value)

function getPrimaryPaneStyle() {
  if (splitMode.value === 'vertical') {
    return { flex: `0 0 calc(${splitRatio.value}% - 1px)`, minWidth: '0' }
  }
  return { flex: `0 0 calc(${splitRatio.value}% - 1px)`, minHeight: '0' }
}

function getSecondaryPaneStyle() {
  if (splitMode.value === 'vertical') {
    return { flex: `0 0 calc(${100 - splitRatio.value}% - 1px)`, minWidth: '0' }
  }
  return { flex: `0 0 calc(${100 - splitRatio.value}% - 1px)`, minHeight: '0' }
}

function handleSessionClosed(sessionId: string) {
  clearSessionLatency(sessionId)
  onSessionClosed(sessionId)
}

function handleCloseSession(sessionId: string) {
  clearSessionLatency(sessionId)
  return onCloseSession(sessionId)
}

function onCdCommand(sessionId: string, command: string) {
  pwdTracker.handleCd(sessionId, command)
}

function onPwdOutput(sessionId: string, pwd: string) {
  pwdTracker.setPwd(sessionId, pwd)
}

provide('theme', theme)
provide('customColors', customColors)
provide('pwdTracker', pwdTracker)

onMounted(async () => {
  document.addEventListener('keydown', handleKeydown)
  window.addEventListener('latency-settings-change', handleLatencySettingsChange)
  window.addEventListener('monitor-settings-change', handleMonitorSettingsChange)
  try {
    const bootstrap = await window.liteSSH.getAppBootstrap()
    hydrateConnectionData({
      connections: bootstrap.connections,
      recentConnections: bootstrap.recentConnections,
    })
    connectionsBootstrap.value = {
      connections: bootstrap.connections,
      groups: bootstrap.groups,
    }
    latencyEnabled.value = bootstrap.latencyEnabled
    latencyIntervalMs.value = bootstrap.latencyIntervalMs
    monitorEnabled.value = bootstrap.monitorEnabled

    if (!bootstrap.encryptionAvailable) {
      const { ElMessage } = await import('element-plus')
      ElMessage.warning({
        message: 'Secure credential encryption is unavailable. Passwords will be stored in plain text.',
        duration: 8000,
      })
    }

    bootstrapPending.value = false
    return
  } catch (err) {
    console.error('[App Bootstrap]', err)
  }
  const encAvailable = await window.liteSSH.isEncryptionAvailable()
  if (!encAvailable) {
    const { ElMessage } = await import('element-plus')
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
  bootstrapPending.value = false
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('latency-settings-change', handleLatencySettingsChange)
  window.removeEventListener('monitor-settings-change', handleMonitorSettingsChange)
})
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
        :initial-data="connectionsBootstrap"
        :initial-data-pending="bootstrapPending"
        @connect="onConnect"
        @connection-saved="syncConnectionName"
      />

      <div v-show="!isHomeActive" class="workspace-content">
        <div class="left-toolbar">
          <button
            class="toolbar-icon-btn"
            :class="{ active: aiSidebarVisible }"
            @click="toggleAiSidebar"
            title="AI 助手"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l1.4 5.1L18 4.4l-2.7 4.7L20 10.5l-5 1.5 3.5 4-4.8-1.9L12 22l-1.7-7.9L5.5 16 9 12 4 10.5l4.7-1.4L6 4.4l4.6 2.7L12 2z"/>
            </svg>
          </button>
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
          <button
            class="toolbar-icon-btn"
            :class="{ active: batchPanelVisible }"
            @click="toggleBatchPanel"
            title="批量执行"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 17 10 11 4 5"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
          </button>
        </div>

        <div v-show="activeSession && aiSidebarVisible" class="sidebar-panel" :style="{ width: sidebarWidth + 'px' }">
          <KeepAlive :max="12">
            <AiSidebar
              v-if="activeSession"
              :key="activeSession!.id"
              :session-id="activeSession!.id"
              :selection-request="aiSelectionRequest"
              @close="aiSidebarVisible = false"
              @selection-consumed="handleAiSelectionConsumed"
            />
          </KeepAlive>
        </div>
        <div
          v-show="activeSession && aiSidebarVisible"
          class="resize-handle"
          @mousedown="startResize"
        ></div>

        <template v-if="!aiSidebarVisible && sidebarVisible && sidebarSessionId">
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
            v-if="showSessionTabs && activeGroup && activeGroup.sessions.length > 0"
            :sessions="activeGroup.sessions"
            :active-session-id="activeGroup.activeSessionId"
            :connection-id="activeGroup.connectionId"
            :latency-map="sessionLatencyMap"
            :latency-enabled="latencyEnabled"
            @select="onSelectSession"
            @close="handleCloseSession"
            @add="createSession"
          >
            <template #actions>
              <div class="terminal-layout-actions">
                <span class="layout-action-label">布局</span>
                <button
                  class="layout-action-btn"
                  :class="{ active: splitMode === 'horizontal' }"
                  @click="toggleHorizontal"
                  title="上下分屏"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                  </svg>
                </button>
                <button
                  class="layout-action-btn"
                  :class="{ active: splitMode === 'vertical' }"
                  @click="toggleVertical"
                  title="左右分屏"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="12" y1="3" x2="12" y2="21"/>
                  </svg>
                </button>
              </div>
            </template>
          </SubTabBar>
          <div v-else-if="showSplitModeBar && activeGroup" class="split-mode-bar">
            <div class="split-mode-info">
              <span class="split-mode-name">{{ activeGroup.connectionName }}</span>
              <span v-if="activeGroupSshAddress" class="split-mode-meta">{{ activeGroupSshAddress }}</span>
            </div>
            <div class="terminal-layout-actions">
              <span class="layout-action-label">布局</span>
              <button
                class="layout-action-btn"
                @click="createSession(activeGroup.connectionId)"
                title="新建终端"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
              <button
                class="layout-action-btn"
                :class="{ active: splitMode === 'horizontal' }"
                @click="toggleHorizontal"
                title="上下分屏"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="3" y1="12" x2="21" y2="12"/>
                </svg>
              </button>
              <button
                class="layout-action-btn"
                :class="{ active: splitMode === 'vertical' }"
                @click="toggleVertical"
                title="左右分屏"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <line x1="12" y1="3" x2="12" y2="21"/>
                </svg>
              </button>
            </div>
          </div>
          <div
            ref="terminalContainerRef"
            class="terminal-container"
            :class="{ 'split-horizontal': splitMode === 'horizontal', 'split-vertical': splitMode === 'vertical' }"
          >
            <div
              class="terminal-pane"
              :style="splitHasSecondary ? getPrimaryPaneStyle() : { flex: '1' }"
            >
              <div v-if="splitHasSecondary && activeSession" class="split-pane-header">
                <div class="split-pane-info">
                  <div class="split-pane-title-row">
                    <span class="split-pane-tag">{{ getTerminalLabel(activeSession) }}</span>
                    <span class="split-pane-name">{{ activeSession.connectionName }}</span>
                  </div>
                  <div v-if="getSessionSshAddress(activeSession)" class="split-pane-meta">
                    {{ getSessionSshAddress(activeSession) }}
                  </div>
                </div>
                <button
                  class="split-pane-close"
                  @click="handleCloseSession(activeSession.id)"
                  :title="`关闭${getTerminalLabel(activeSession)}`"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div class="terminal-pane-body">
                <KeepAlive :max="12">
                  <TerminalTab
                    v-if="activeSession"
                    :key="activeSession!.id"
                    :session-id="activeSession!.id"
                    :connection-name="activeSession!.connectionName"
                    :connection-id="activeSession!.connectionId"
                    @closed="handleSessionClosed"
                    @cd-command="onCdCommand"
                    @pwd-output="onPwdOutput"
                    @reconnect="createSession"
                    @latency="onLatency"
                    @ai-selection="handleAiSelection"
                  />
                </KeepAlive>
              </div>
            </div>
            <template v-if="splitHasSecondary && secondarySession">
              <div
                class="split-divider"
                :class="{ horizontal: splitMode === 'horizontal', vertical: splitMode === 'vertical' }"
                @mousedown="onSplitDividerMousedown"
              ></div>
              <div
                class="terminal-pane"
                :style="getSecondaryPaneStyle()"
              >
                <div class="split-pane-header">
                  <div class="split-pane-info">
                    <div class="split-pane-title-row">
                      <span class="split-pane-tag">{{ getTerminalLabel(secondarySession) }}</span>
                      <span class="split-pane-name">{{ secondarySession.connectionName }}</span>
                    </div>
                    <div v-if="getSessionSshAddress(secondarySession)" class="split-pane-meta">
                      {{ getSessionSshAddress(secondarySession) }}
                    </div>
                  </div>
                  <button
                    class="split-pane-close"
                    @click="handleCloseSession(secondarySession.id)"
                    :title="`关闭${getTerminalLabel(secondarySession)}`"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            <div class="batch-toolbar-badge" v-if="batchPanelVisible && batchSessions.length > 0">{{ batchSessions.length }}</div>
          </button>
                </div>
                <div class="terminal-pane-body">
                  <KeepAlive :max="12">
                    <TerminalTab
                      :key="secondarySession.id"
                      :session-id="secondarySession.id"
                      :connection-name="secondarySession.connectionName"
                      :connection-id="secondarySession.connectionId"
                      @closed="handleSessionClosed"
                      @cd-command="onCdCommand"
                      @pwd-output="onPwdOutput"
                      @reconnect="createSession"
                      @latency="onLatency"
                      @ai-selection="handleAiSelection"
                    />
                  </KeepAlive>
                </div>
              </div>
            </template>
          </div>
        </div>

        <template v-if="batchPanelVisible && batchSessions.length > 0">
          <div class="resize-handle" @mousedown="startResizeRight"></div>
          <div class="batch-panel-wrapper">
            <BatchCommandPanel
              :sessions="batchSessions"
              @close="batchPanelVisible = false"
            />
          </div>
        </template>

        <template v-if="monitorVisible && activeSession">
          <div
            class="resize-handle"
            @mousedown="startResizeRight"
          ></div>
          <div class="monitor-panel-wrapper" :style="{ width: monitorWidth + 'px' }">
            <MonitorPanel
              :key="activeGroup!.connectionId"
              :session-id="activeSession!.id"
              :connection-id="activeGroup!.connectionId"
              :connection-name="activeSession!.connectionName"
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
  position: relative;
}

.toolbar-icon-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.toolbar-icon-btn.active {
  color: var(--accent);
  background: var(--accent-bg);
}

.batch-toolbar-badge {
  position: absolute;
  right: 2px;
  top: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
}

.toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 4px 0;
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

.split-mode-bar {
  height: 30px;
  min-height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 8px 0 10px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}

.split-mode-info {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.split-mode-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.split-mode-meta {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-layout-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.layout-action-label {
  font-size: 10px;
  color: var(--text-secondary);
  margin-right: 2px;
}

.layout-action-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.layout-action-btn:hover {
  color: var(--accent);
  border-color: var(--border-color);
  background: var(--bg-tertiary);
}

.layout-action-btn.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-bg);
}

.terminal-container {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.terminal-container.split-vertical {
  flex-direction: row;
}

.terminal-pane {
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.terminal-pane-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.split-pane-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.split-pane-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.split-pane-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.split-pane-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.split-pane-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.split-pane-meta {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.split-pane-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.split-pane-close:hover {
  background: var(--hover-bg);
  color: var(--danger);
}

.split-divider {
  flex-shrink: 0;
  background: var(--border-color);
  position: relative;
  z-index: 5;
}

.split-divider.horizontal {
  height: 2px;
  cursor: row-resize;
}

.split-divider.vertical {
  width: 2px;
  cursor: col-resize;
}

.split-divider:hover {
  background: var(--accent);
}

.batch-panel-wrapper {
  width: 320px;
  min-width: 280px;
  max-width: 500px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  overflow: hidden;
  flex-shrink: 0;
}

.monitor-panel-wrapper {
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  overflow: hidden;
}
</style>
