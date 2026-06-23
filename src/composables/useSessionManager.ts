import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import type { Connection } from '../env.d'
import type { TerminalPwdTracker } from './useTerminalPwd'

export const HOME_ID = '__home__'

export interface Session {
  id: string
  connectionId: string
  connectionName: string
  tabNumber: number
}

export interface ConnectionGroup {
  connectionId: string
  connectionName: string
  sessions: Session[]
  activeSessionId: string | null
  nextTabNumber: number
}

export interface SidebarDeps {
  sidebarVisible: Ref<boolean>
  aiSidebarVisible: Ref<boolean>
  sidebarGroupId: Ref<string | null>
  sidebarSessionId: Ref<string | null>
  fileSidebarRef: Ref<any>
  setSidebarTarget: (groupId: string | null, sessionId: string | null) => void
  syncSidebarState: () => void
}

export function useSessionManager(deps: { pwdTracker: TerminalPwdTracker }) {
  const connections = ref<Connection[]>([])
  const recentConnections = ref<Connection[]>([])
  const groups = ref<ConnectionGroup[]>([])
  const activeGroupId = ref<string>(HOME_ID)

  let sidebar: SidebarDeps | null = null

  function connectSidebar(s: SidebarDeps) {
    sidebar = s
  }

  const isHomeActive = computed(() => activeGroupId.value === HOME_ID)

  const activeGroup = computed(() => {
    if (isHomeActive.value) return null
    return groups.value.find((g) => g.connectionId === activeGroupId.value) || null
  })

  const activeSessionId = computed(() => activeGroup.value?.activeSessionId || null)

  const activeSession = computed(() => {
    if (!activeGroup.value?.activeSessionId) return null
    return (
      activeGroup.value.sessions.find((s) => s.id === activeGroup.value!.activeSessionId) || null
    )
  })

  function getLastSessionId(group: ConnectionGroup | null): string | null {
    if (!group || group.sessions.length === 0) return null
    return group.sessions[group.sessions.length - 1].id
  }

  function getGroupByConnectionId(connectionId: string | null): ConnectionGroup | null {
    if (!connectionId) return null
    return groups.value.find((g) => g.connectionId === connectionId) || null
  }

  function getGroupBySessionId(sessionId: string): ConnectionGroup | null {
    return (
      groups.value.find((g) => g.sessions.some((s) => s.id === sessionId)) || null
    )
  }

  async function loadConnections() {
    connections.value = await window.liteSSH.getConnections()
  }

  async function loadRecentConnections() {
    recentConnections.value = await window.liteSSH.getRecentConnections()
  }

  function hydrateConnectionData(data: { connections: Connection[]; recentConnections: Connection[] }) {
    connections.value = [...data.connections]
    recentConnections.value = [...data.recentConnections]
  }

  async function initSessionPwd(sessionId: string) {
    try {
      const home = (await window.liteSSH.sftpExecHome(sessionId)).trim()
      if (home) {
        deps.pwdTracker.initSession(sessionId, home)
      }
    } catch (err) {
      console.warn('[PWD] Failed to initialize session home:', err)
    }
  }

  async function createSession(connectionId: string) {
    let conn = connections.value.find((c) => c.id === connectionId)
    if (!conn) {
      await loadConnections()
      conn = connections.value.find((c) => c.id === connectionId)
    }
    if (!conn) return

    try {
      const sessionId = await window.liteSSH.sshConnect(connectionId)
      void initSessionPwd(sessionId)
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
      sidebar!.setSidebarTarget(connectionId, sessionId)
      sidebar!.aiSidebarVisible.value = false
      sidebar!.sidebarVisible.value = true
      await window.liteSSH.recordRecentConnection(connectionId)
      await loadRecentConnections()
    } catch (err: any) {
      console.error('SSH connection failed:', err)
      ElMessage.error(err.message || '连接失败')
    }
  }

  function onConnect(connectionId: string) {
    return createSession(connectionId)
  }

  function syncConnectionName(connection: Connection) {
    connections.value = connections.value.map((item) =>
      item.id === connection.id ? { ...item, ...connection } : item,
    )
    recentConnections.value = recentConnections.value.map((item) =>
      item.id === connection.id ? { ...item, ...connection } : item,
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

  function onQuickConnect(connectionId: string) {
    return createSession(connectionId)
  }

  async function onCloseGroup(connectionId: string) {
    const group = getGroupByConnectionId(connectionId)
    if (!group) return

    const sessionIds = group.sessions.map((s) => s.id)
    for (const sessionId of sessionIds) {
      try {
        await window.liteSSH.sshDisconnect(sessionId)
      } catch {}
    }

    const idx = groups.value.findIndex((g) => g.connectionId === connectionId)
    if (idx !== -1) groups.value.splice(idx, 1)

    if (sidebar!.sidebarGroupId.value === connectionId) {
      sidebar!.setSidebarTarget(null, null)
    }

    if (activeGroupId.value === connectionId) {
      activeGroupId.value = groups.value.length > 0 ? groups.value[0].connectionId : HOME_ID
    }

    sidebar!.syncSidebarState()
  }

  function removeSessionFromState(sessionId: string) {
    const group = getGroupBySessionId(sessionId)
    if (!group) return

    const idx = group.sessions.findIndex((s) => s.id === sessionId)
    if (idx === -1) return

    group.sessions.splice(idx, 1)
    deps.pwdTracker.removeSession(sessionId)
    sidebar!.fileSidebarRef.value?.clearSessionState(sessionId)

    if (group.activeSessionId === sessionId) {
      group.activeSessionId = getLastSessionId(group)
    }

    if (
      sidebar!.sidebarGroupId.value === group.connectionId &&
      sidebar!.sidebarSessionId.value === sessionId
    ) {
      sidebar!.sidebarSessionId.value =
        group.activeSessionId || getLastSessionId(group)
    }

    if (group.sessions.length === 0) {
      const groupIdx = groups.value.findIndex(
        (item) => item.connectionId === group.connectionId,
      )
      if (groupIdx !== -1) groups.value.splice(groupIdx, 1)

      if (sidebar!.sidebarGroupId.value === group.connectionId) {
        sidebar!.setSidebarTarget(null, null)
      }

      if (activeGroupId.value === group.connectionId) {
        activeGroupId.value =
          groups.value.length > 0 ? groups.value[0].connectionId : HOME_ID
      }
    }

    sidebar!.syncSidebarState()
  }

  async function onCloseSession(sessionId: string) {
    await window.liteSSH.sshDisconnect(sessionId)
    removeSessionFromState(sessionId)
  }

  function onSessionClosed(sessionId: string) {
    removeSessionFromState(sessionId)
  }

  function onSelectSession(sessionId: string) {
    if (!activeGroup.value) return
    activeGroup.value.activeSessionId = sessionId
    sidebar!.setSidebarTarget(activeGroup.value.connectionId, sessionId)
  }

  return {
    HOME_ID,
    groups,
    connections,
    recentConnections,
    activeGroupId,
    isHomeActive,
    activeGroup,
    activeSessionId,
    activeSession,
    createSession,
    onConnect,
    onCloseGroup,
    onCloseSession,
    removeSessionFromState,
    syncConnectionName,
    onSelectGroup,
    onSelectHome,
    onQuickConnect,
    onSelectSession,
    onSessionClosed,
    loadConnections,
    loadRecentConnections,
    hydrateConnectionData,
    getGroupByConnectionId,
    getGroupBySessionId,
    getLastSessionId,
    connectSidebar,
  }
}
