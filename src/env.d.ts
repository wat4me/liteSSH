export {}

declare global {
  interface Window {
    liteSSH: {
      getConnections: () => Promise<Connection[]>
      saveConnection: (conn: Partial<Connection> & { name: string; host: string; username: string; password: string }) => Promise<Connection>
      deleteConnection: (id: string) => Promise<boolean>

      getGroups: () => Promise<Group[]>
      saveGroup: (group: Partial<Group> & { name: string }) => Promise<Group>
      deleteGroup: (id: string) => Promise<boolean>
      reorderGroups: (ids: string[]) => Promise<void>
      setDefaultGroup: (id: string) => Promise<void>

      sshConnect: (connectionId: string) => Promise<string>
      sshDisconnect: (sessionId: string) => Promise<void>
      sshWrite: (sessionId: string, data: string) => void
      sshResize: (sessionId: string, cols: number, rows: number) => void
      sshTestConnection: (connectionId: string) => Promise<{ ok: boolean; latency?: number; error?: string }>

      onSshData: (callback: (sessionId: string, data: string) => void) => () => void
      onSshClosed: (callback: (sessionId: string) => void) => () => void
      onSshError: (callback: (sessionId: string, error: string) => void) => () => void

      updateTitleBar: (theme: string, colors?: { color: string; symbolColor: string }) => void
    }
  }
}

export interface Connection {
  id: string
  name: string
  host: string
  port: number
  username: string
  password: string
  group?: string
  createdAt: number
  updatedAt: number
}

export interface Group {
  id: string
  name: string
  order: number
  isDefault: boolean
}
