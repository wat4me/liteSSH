<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, provide } from 'vue'
import ConnectionsView from './views/ConnectionsView.vue'
import TabBar from './components/TabBar.vue'
import SubTabBar from './components/SubTabBar.vue'
import TerminalTab from './components/TerminalTab.vue'
import FileSidebar from './components/FileSidebar.vue'
import { useTheme } from './composables/useTheme'
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

const connections = ref<Connection[]>([])
const groups = ref<ConnectionGroup[]>([])
const activeGroupId = ref<string>(HOME_ID)
const sidebarVisible = ref(false)
const sidebarWidth = ref(260)
const sidebarSessionId = ref<string | null>(null)
const connectionsViewRef = ref<InstanceType<typeof ConnectionsView> | null>(null)
const fileSidebarRef = ref<InstanceType<typeof FileSidebar> | null>(null)

let resizing = false
let resizeStartX = 0
let resizeStartWidth = 0

function startResize(e: MouseEvent) {
  resizing = true
  resizeStartX = e.clientX
  resizeStartWidth = sidebarWidth.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResizeMove(e: MouseEvent) {
  if (!resizing) return
  const diff = e.clientX - resizeStartX
  const newWidth = Math.max(180, Math.min(600, resizeStartWidth + diff))
  sidebarWidth.value = newWidth
}

function onResizeUp() {
  resizing = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
})

provide('theme', theme)
provide('customColors', customColors)

const isHomeActive = computed(() => activeGroupId.value === HOME_ID)

const activeGroup = computed(() => {
  if (isHomeActive.value) return null
  return groups.value.find((g) => g.connectionId === activeGroupId.value) || null
})

const activeSessionId = computed(() => {
  return activeGroup.value?.activeSessionId || null
})

watch(activeSessionId, (sessionId) => {
  if (sessionId) {
    sidebarSessionId.value = sessionId
  }
}, { immediate: true })

watch(groups, () => {
  if (!sidebarSessionId.value) return
  const exists = groups.value.some((group) =>
    group.sessions.some((session) => session.id === sidebarSessionId.value)
  )
  if (!exists) {
    sidebarSessionId.value = activeSessionId.value
  }
}, { deep: true })

onMounted(async () => {
  connections.value = await window.liteSSH.getConnections()
})

async function createSession(connectionId: string) {
  let conn = connections.value.find((c) => c.id === connectionId)
  if (!conn) {
    connections.value = await window.liteSSH.getConnections()
    conn = connections.value.find((c) => c.id === connectionId)
  }
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
    sidebarVisible.value = true
  } catch (err: any) {
    console.error('SSH connection failed:', err)
  }
}

async function onConnect(connectionId: string) {
  await createSession(connectionId)
}

function onSelectGroup(connectionId: string) {
  activeGroupId.value = connectionId
}

function onSelectHome() {
  activeGroupId.value = HOME_ID
}

async function onCloseGroup(connectionId: string) {
  const group = groups.value.find((g) => g.connectionId === connectionId)
  if (!group) return

  for (const s of group.sessions) {
    try {
      await window.liteSSH.sshDisconnect(s.id)
    } catch {}
  }

  const idx = groups.value.findIndex((g) => g.connectionId === connectionId)
  if (idx !== -1) groups.value.splice(idx, 1)

  if (activeGroupId.value === connectionId) {
    activeGroupId.value = groups.value.length > 0 ? groups.value[0].connectionId : HOME_ID
  }

  if (groups.value.length === 0) {
    sidebarVisible.value = false
  }
}

function onSelectSession(sessionId: string) {
  if (!activeGroup.value) return
  activeGroup.value.activeSessionId = sessionId
}

async function onCloseSession(sessionId: string) {
  const group = groups.value.find((g) =>
    g.sessions.some((s) => s.id === sessionId)
  )
  if (!group) return

  await window.liteSSH.sshDisconnect(sessionId)

  const idx = group.sessions.findIndex((s) => s.id === sessionId)
  if (idx !== -1) group.sessions.splice(idx, 1)

  if (group.activeSessionId === sessionId) {
    group.activeSessionId = group.sessions.length > 0 ? group.sessions[group.sessions.length - 1].id : null
  }

  if (group.sessions.length === 0) {
    const gIdx = groups.value.findIndex((g) => g.connectionId === group.connectionId)
    if (gIdx !== -1) groups.value.splice(gIdx, 1)
    if (activeGroupId.value === group.connectionId) {
      activeGroupId.value = groups.value.length > 0 ? groups.value[0].connectionId : HOME_ID
    }
  }

  if (groups.value.length === 0) {
    sidebarVisible.value = false
  }
}

function onSessionClosed(sessionId: string) {
  const group = groups.value.find((g) =>
    g.sessions.some((s) => s.id === sessionId)
  )
  if (!group) return

  const idx = group.sessions.findIndex((s) => s.id === sessionId)
  if (idx !== -1) group.sessions.splice(idx, 1)

  if (group.activeSessionId === sessionId) {
    group.activeSessionId = group.sessions.length > 0 ? group.sessions[group.sessions.length - 1].id : null
  }

  if (group.sessions.length === 0) {
    const gIdx = groups.value.findIndex((g) => g.connectionId === group.connectionId)
    if (gIdx !== -1) groups.value.splice(gIdx, 1)
    if (activeGroupId.value === group.connectionId) {
      activeGroupId.value = groups.value.length > 0 ? groups.value[0].connectionId : HOME_ID
    }
  }

  if (groups.value.length === 0) {
    sidebarVisible.value = false
  }
}

function toggleSidebar() {
  sidebarVisible.value = !sidebarVisible.value
}

watch(activeGroupId, (newId) => {
  if (newId === HOME_ID) {
    connectionsViewRef.value?.loadData()
  }
})

function onCdCommand(sessionId: string, command: string) {
  if (!fileSidebarRef.value) return
  if (activeSessionId.value === sessionId || sidebarSessionId.value === sessionId) {
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
        @select="onSelectGroup"
        @close="onCloseGroup"
        @select-home="onSelectHome"
      />

      <ConnectionsView
        ref="connectionsViewRef"
        v-show="isHomeActive"
        @connect="onConnect"
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
            <template v-for="group in groups" :key="group.connectionId">
              <div
                v-for="session in group.sessions"
                :key="session.id"
                class="terminal-wrapper"
                :class="{
                  active:
                    group.connectionId === activeGroupId &&
                    session.id === group.activeSessionId
                }"
              >
                <TerminalTab
                  :session-id="session.id"
                  :connection-name="session.connectionName"
                  :is-active="group.connectionId === activeGroupId && session.id === group.activeSessionId"
                  @closed="onSessionClosed"
                  @cd-command="onCdCommand"
                />
              </div>
            </template>
          </div>
        </div>
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

.terminal-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  visibility: hidden;
  pointer-events: none;
}

.terminal-wrapper.active {
  visibility: visible;
  pointer-events: auto;
}
</style>
