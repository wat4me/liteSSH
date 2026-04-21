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

      getDownloadPath: () => Promise<string>
      setDownloadPath: (dirPath: string) => Promise<void>
      selectDirectory: () => Promise<string | null>

      sshConnect: (connectionId: string) => Promise<string>
      sshDisconnect: (sessionId: string) => Promise<void>
      sshWrite: (sessionId: string, data: string) => void
      sshResize: (sessionId: string, cols: number, rows: number) => void
      sshTestConnection: (connectionId: string) => Promise<{ ok: boolean; latency?: number; error?: string }>
      sshTestConnectionParams: (params: { host: string; port: number; username: string; password: string }) => Promise<{ ok: boolean; latency?: number; error?: string }>
      sshDiagnoseConnectionParams: (params: {
        host: string
        port: number
        username: string
        password: string
      }) => Promise<{
        ok: boolean
        tcpLatency?: number
        sshReadyLatency?: number
        shellOpenLatency?: number
        shellFirstByteLatency?: number
        totalLatency?: number
        error?: string
      }>

      sftpInit: (sessionId: string) => Promise<void>
      sftpReaddir: (sessionId: string, remotePath: string) => Promise<FileEntry[]>
      sftpStat: (sessionId: string, remotePath: string) => Promise<StatsInfo>
      sftpRealpath: (sessionId: string, remotePath: string) => Promise<string>
      sftpExecPwd: (sessionId: string) => Promise<string>
      sftpExecHome: (sessionId: string) => Promise<string>
      sftpDownload: (sessionId: string, remotePath: string, fileName: string, transferId: string) => void
      sftpUpload: (sessionId: string, localPath: string, remotePath: string, fileName: string, transferId: string) => void
      sftpCancelTransfer: (transferId: string) => void

      shellOpenPath: (filePath: string) => Promise<string>
      shellShowItemInFolder: (filePath: string) => void

      clipboardReadText: () => Promise<string>
      clipboardWriteText: (text: string) => Promise<void>

      onSshData: (callback: (sessionId: string, data: string) => void) => () => void
      onSshClosed: (callback: (sessionId: string) => void) => () => void
      onSshError: (callback: (sessionId: string, error: string) => void) => () => void

      onTransferStart: (callback: (transferId: string, fileName: string, localPath: string) => void) => () => void
      onTransferProgress: (callback: (transferId: string, transferred: number, total: number) => void) => () => void
      onTransferComplete: (callback: (transferId: string, localPath: string) => void) => () => void
      onTransferError: (callback: (transferId: string, error: string) => void) => () => void

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

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymlink: boolean
  size: number
  modifyTime: number
  permissions: string
}

export interface StatsInfo {
  size: number
  modifyTime: number
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
  permissions: string
}

export interface TransferItem {
  id: string
  fileName: string
  localPath: string
  remotePath?: string
  transferred: number
  total: number
  status: 'downloading' | 'uploading' | 'completed' | 'error'
  direction: 'download' | 'upload'
  error?: string
}
