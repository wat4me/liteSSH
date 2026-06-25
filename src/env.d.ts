export {}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare global {
  interface Window {
    liteSSH: {
      getAppBootstrap: () => Promise<AppBootstrapData>
      getConnections: () => Promise<Connection[]>
      saveConnection: (conn: Partial<Connection> & { name: string; host: string; username: string; password: string }) => Promise<Connection>
      deleteConnection: (id: string) => Promise<boolean>
      updateConnectionGroup: (id: string, groupId: string | undefined) => Promise<boolean>
      isEncryptionAvailable: () => Promise<boolean>
      getConnectionPassword: (id: string) => Promise<string>
      getSavedCredentials: () => Promise<SavedCredential[]>
      getSavedCredentialPassword: (id: string) => Promise<string>
      saveSavedCredential: (credential: Partial<SavedCredential> & { name: string; username: string; password: string }) => Promise<SavedCredential>
      deleteSavedCredential: (id: string) => Promise<boolean>

      getGroups: () => Promise<Group[]>
      saveGroup: (group: Partial<Group> & { name: string }) => Promise<Group>
      deleteGroup: (id: string) => Promise<boolean>
      reorderGroups: (ids: string[]) => Promise<void>
      setDefaultGroup: (id: string | null) => Promise<void>

      getDownloadPath: () => Promise<string>
      setDownloadPath: (dirPath: string) => Promise<void>
      getRecentConnections: () => Promise<Connection[]>
      recordRecentConnection: (connectionId: string) => Promise<void>
      selectDirectory: () => Promise<string | null>

      getTerminalFontSize: () => Promise<number>
      setTerminalFontSize: (size: number) => Promise<void>
      getRecentDownloadPaths: () => Promise<string[]>
      addRecentDownloadPath: (dirPath: string) => Promise<void>
      getAiSettings: () => Promise<AiSettings>
      setAiSettings: (settings: AiSettings) => Promise<void>
      aiChat: (messages: AiChatMessage[]) => Promise<AiChatResult>
      aiChatStream: (requestId: string, messages: AiChatMessage[]) => Promise<AiChatResult>
      getAiSessionHistory: (sessionId: string) => Promise<AiHistoryRecord[]>
      listAiSessionHistories: () => Promise<AiHistorySummary[]>
      appendAiSessionHistory: (sessionId: string, record: AiHistoryRecord) => Promise<void>
      clearAiSessionHistory: (sessionId: string) => Promise<void>
      onAiChatStream: (requestId: string, callback: (payload: AiChatStreamPayload) => void) => () => void

      getLatencyEnabled: () => Promise<boolean>
      setLatencyEnabled: (enabled: boolean) => Promise<void>
      getLatencyIntervalMs: () => Promise<number>
      setLatencyIntervalMs: (intervalMs: number) => Promise<void>

      exportConnections: () => Promise<boolean>
      importConnections: () => Promise<{ imported: number; total: number } | null>

      sshConnect: (connectionId: string) => Promise<string>
      sshDisconnect: (sessionId: string) => Promise<void>
      sshWrite: (sessionId: string, data: string) => void
      sshResize: (sessionId: string, cols: number, rows: number) => void
      sshTestConnection: (connectionId: string) => Promise<{ ok: boolean; latency?: number; error?: string }>
      sshTestConnectionParams: (params: { host: string; port: number; username: string; password: string; privateKey?: string }) => Promise<{ ok: boolean; latency?: number; error?: string }>
      sshDiagnoseConnectionParams: (params: {
        host: string
        port: number
        username: string
        password: string
        privateKey?: string
      }) => Promise<{
        ok: boolean
        tcpLatency?: number
        sshReadyLatency?: number
        shellOpenLatency?: number
        shellFirstByteLatency?: number
        totalLatency?: number
        error?: string
      }>

      sshRemoveHostKey: (host: string, port: number) => Promise<void>
      sshGetHostKeyFingerprint: (host: string, port: number) => Promise<string | null>

      sshStartLatencyMonitor: (sessionId: string) => Promise<void>
      sshStopLatencyMonitor: (sessionId: string) => Promise<void>
      sshMeasureLatency: (sessionId: string) => Promise<number>
      sshExec: (sessionId: string, command: string, timeoutMs?: number) => Promise<string>
      getMonitorEnabled: () => Promise<boolean>
      setMonitorEnabled: (enabled: boolean) => Promise<void>
      getMonitorIntervalMs: () => Promise<number>
      setMonitorIntervalMs: (intervalMs: number) => Promise<void>
      monitorStart: (sessionId: string) => Promise<void>
      monitorStop: (sessionId: string) => Promise<void>

      sftpInit: (sessionId: string) => Promise<void>
      sftpReaddir: (sessionId: string, remotePath: string) => Promise<FileEntry[]>
      sftpRealpath: (sessionId: string, remotePath: string) => Promise<string>
      sftpExecHome: (sessionId: string) => Promise<string>
      sftpDownload: (sessionId: string, remotePath: string, fileName: string, transferId: string) => void
      sftpUpload: (sessionId: string, localPath: string, remotePath: string, fileName: string, transferId: string) => void
      sftpCancelTransfer: (transferId: string) => void

      getPathForFile: (file: File) => string

      readPrivateKeyFile: () => Promise<string | null>

      shellOpenPath: (filePath: string) => Promise<string>
      shellShowItemInFolder: (filePath: string) => void

      clipboardReadText: () => Promise<string>
      clipboardWriteText: (text: string) => Promise<void>

      onSshData: (sessionId: string, callback: (data: string) => void) => () => void
      onSshClosed: (sessionId: string, callback: () => void) => () => void
      onSshError: (sessionId: string, callback: (error: string) => void) => () => void
      onSshLatency: (sessionId: string, callback: (latencyMs: number) => void) => () => void

      onMonitorData: (sessionId: string, callback: (data: MonitorData) => void) => () => void

      onTransferStart: (callback: (sessionId: string, transferId: string, fileName: string, localPath: string, direction: 'download' | 'upload') => void) => () => void
      onTransferProgress: (callback: (sessionId: string, transferId: string, transferred: number, total: number) => void) => () => void
      onTransferComplete: (callback: (sessionId: string, transferId: string, localPath: string) => void) => () => void
      onTransferError: (callback: (sessionId: string, transferId: string, error: string) => void) => () => void

      updateTitleBar: (theme: string, colors?: { color: string; symbolColor: string }) => void

      // Auto-updater
      checkForUpdates: () => Promise<{ ok: boolean; info?: any; error?: string }>
      downloadUpdate: () => Promise<{ ok: boolean; error?: string }>
      quitAndInstall: () => Promise<void>
      skipUpdateVersion: (version: string) => Promise<void>
      getAutoUpdateEnabled: () => Promise<boolean>
      setAutoUpdateEnabled: (enabled: boolean) => Promise<void>
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
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
  privateKey?: string
  group?: string
  keepaliveInterval?: number
  x11Forwarding?: boolean
  x11Host?: string
  x11Display?: number
  createdAt: number
  updatedAt: number
}

export interface AppBootstrapData {
  encryptionAvailable: boolean
  connections: Connection[]
  groups: Group[]
  recentConnections: Connection[]
  latencyEnabled: boolean
  latencyIntervalMs: number
  monitorEnabled: boolean
  monitorIntervalMs: number
}

export interface Group {
  id: string
  name: string
  order: number
  isDefault: boolean
}

export interface SavedCredential {
  id: string
  name: string
  username: string
  password: string
  createdAt: number
  updatedAt: number
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymlink: boolean
  size: number
  modifyTime: number
  permissions: string
}

export interface TransferItem {
  id: string
  sessionId: string
  fileName: string
  localPath: string
  remotePath?: string
  transferred: number
  total: number
  status: 'downloading' | 'uploading' | 'completed' | 'error'
  direction: 'download' | 'upload'
  error?: string
}

export interface AiSettings {
  baseUrl: string
  model: string
  apiKey: string
  systemPrompt: string
  temperature: number
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AiUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  reasoningTokens?: number
}

export interface AiChatResult {
  content: string
  reasoningContent?: string
  usage?: AiUsage
}

export interface AiHistoryRecord {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoningContent?: string
  usage?: AiUsage
  error?: boolean
  createdAt: number
}

export interface AiHistorySummary {
  sessionId: string
  title: string
  messageCount: number
  updatedAt: number
}

export type AiChatStreamPayload =
  | { type: 'content'; value: string }
  | { type: 'reasoning'; value: string }
  | { type: 'usage'; value: AiUsage }
  | { type: 'done' }

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  progress?: number
  message?: string
}

export interface MonitorData {
  hostname: string
  kernel: string
  arch: string
  uptime: string
  cpu: {
    usage: number
    cores: number[]
    loadAvg: [number, number, number]
  }
  memory: {
    total: number
    used: number
    free: number
    buffCache: number
    available: number
    swapTotal: number
    swapUsed: number
  }
  disk: {
    filesystem: string
    total: number
    used: number
    available: number
    mountPoint: string
  }[]
  processes: {
    pid: number
    user: string
    cpu: number
    mem: number
    command: string
  }[]
  timestamp: number
}
