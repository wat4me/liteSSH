<script setup lang="ts">
import { onMounted, onBeforeUnmount, provide } from 'vue'
import ConnectionsView from './views/ConnectionsView.vue'
import TabBar from './components/TabBar.vue'
import SubTabBar from './components/SubTabBar.vue'
import TerminalTab from './components/TerminalTab.vue'
import FileSidebar from './components/FileSidebar.vue'
import MonitorPanel from './components/MonitorPanel.vue'
import AiSidebar from './components/AiSidebar.vue'
import { useTheme } from './composables/useTheme'
import { useTerminalPwd } from './composables/useTerminalPwd'
import { useSessionManager, HOME_ID } from './composables/useSessionManager'
import { useSidebarState } from './composables/useSidebarState'
import { useLatencyState } from './composables/useLatencyState'
import { useAppKeyboard } from './composables/useAppKeyboard'

const { theme, customColors } = useTheme()
const pwdTracker = useTerminalPwd()

const session = useSessionManager({ pwdTracker })

const {
  groups,
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
} = session

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
  latencyEnabled,
  latencyIntervalMs,
  onLatency,
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
            v-if="activeGroup && activeGroup.sessions.length > 0"
            :sessions="activeGroup.sessions"
            :active-session-id="activeGroup.activeSessionId"
            :connection-id="activeGroup.connectionId"
            @select="onSelectSession"
            @close="onCloseSession"
            @add="createSession"
          />
          <div class="terminal-container">
            <KeepAlive :max="12">
              <TerminalTab
                v-if="activeSession"
                :key="activeSession!.id"
                :session-id="activeSession!.id"
                :connection-name="activeSession!.connectionName"
                :connection-id="activeSession!.connectionId"
                @closed="onSessionClosed"
                @cd-command="onCdCommand"
                @pwd-output="onPwdOutput"
                @reconnect="createSession"
                @latency="onLatency"
                @ai-selection="handleAiSelection"
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