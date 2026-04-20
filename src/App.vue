<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue'
import ConnectionsView from './views/ConnectionsView.vue'
import TabBar from './components/TabBar.vue'
import SubTabBar from './components/SubTabBar.vue'
import TerminalTab from './components/TerminalTab.vue'
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

provide('theme', theme)
provide('customColors', customColors)

const isHomeActive = computed(() => activeGroupId.value === HOME_ID)

const activeGroup = computed(() => {
  if (isHomeActive.value) return null
  return groups.value.find((g) => g.connectionId === activeGroupId.value) || null
})

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
        v-if="isHomeActive"
        @connect="onConnect"
      />

      <template v-else>
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
                @closed="onSessionClosed"
              />
            </div>
          </template>
        </div>
      </template>
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
