import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('liteSSH', {
  getConnections: () => ipcRenderer.invoke('store:getConnections'),
  saveConnection: (conn: any) => ipcRenderer.invoke('store:saveConnection', conn),
  deleteConnection: (id: string) => ipcRenderer.invoke('store:deleteConnection', id),

  getGroups: () => ipcRenderer.invoke('store:getGroups'),
  saveGroup: (group: any) => ipcRenderer.invoke('store:saveGroup', group),
  deleteGroup: (id: string) => ipcRenderer.invoke('store:deleteGroup', id),
  reorderGroups: (ids: string[]) => ipcRenderer.invoke('store:reorderGroups', ids),
  setDefaultGroup: (id: string) => ipcRenderer.invoke('store:setDefaultGroup', id),

  getDownloadPath: () => ipcRenderer.invoke('settings:getDownloadPath'),
  setDownloadPath: (dirPath: string) => ipcRenderer.invoke('settings:setDownloadPath', dirPath),
  selectDirectory: () => ipcRenderer.invoke('settings:selectDirectory'),

  sshConnect: (connectionId: string) => ipcRenderer.invoke('ssh:connect', connectionId),
  sshDisconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', sessionId),
  sshWrite: (sessionId: string, data: string) => ipcRenderer.send('ssh:write', sessionId, data),
  sshResize: (sessionId: string, cols: number, rows: number) => ipcRenderer.send('ssh:resize', sessionId, cols, rows),
  sshTestConnection: (connectionId: string) => ipcRenderer.invoke('ssh:testConnection', connectionId),
  sshTestConnectionParams: (params: { host: string; port: number; username: string; password: string }) => ipcRenderer.invoke('ssh:testConnectionParams', params),
  sshDiagnoseConnectionParams: (params: { host: string; port: number; username: string; password: string }) =>
    ipcRenderer.invoke('ssh:diagnoseConnectionParams', params),

  sftpInit: (sessionId: string) => ipcRenderer.invoke('sftp:init', sessionId),
  sftpReaddir: (sessionId: string, remotePath: string) => ipcRenderer.invoke('sftp:readdir', sessionId, remotePath),
  sftpStat: (sessionId: string, remotePath: string) => ipcRenderer.invoke('sftp:stat', sessionId, remotePath),
  sftpRealpath: (sessionId: string, remotePath: string) => ipcRenderer.invoke('sftp:realpath', sessionId, remotePath),
  sftpExecPwd: (sessionId: string) => ipcRenderer.invoke('sftp:execPwd', sessionId),
  sftpExecHome: (sessionId: string) => ipcRenderer.invoke('sftp:execHome', sessionId),
  sftpDownload: (sessionId: string, remotePath: string, fileName: string, transferId: string) =>
    ipcRenderer.send('sftp:download', sessionId, remotePath, fileName, transferId),
  sftpUpload: (sessionId: string, localPath: string, remotePath: string, fileName: string, transferId: string) =>
    ipcRenderer.send('sftp:upload', sessionId, localPath, remotePath, fileName, transferId),
  sftpCancelTransfer: (transferId: string) => ipcRenderer.send('sftp:cancelTransfer', transferId),

  shellOpenPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  shellShowItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),

  clipboardReadText: () => ipcRenderer.invoke('clipboard:readText'),
  clipboardWriteText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),

  onSshData: (callback: (sessionId: string, data: string) => void) => {
    const listener = (_event: any, sessionId: string, data: string) => callback(sessionId, data)
    ipcRenderer.on('ssh:data', listener)
    return () => ipcRenderer.removeListener('ssh:data', listener)
  },
  onSshClosed: (callback: (sessionId: string) => void) => {
    const listener = (_event: any, sessionId: string) => callback(sessionId)
    ipcRenderer.on('ssh:closed', listener)
    return () => ipcRenderer.removeListener('ssh:closed', listener)
  },
  onSshError: (callback: (sessionId: string, error: string) => void) => {
    const listener = (_event: any, sessionId: string, error: string) => callback(sessionId, error)
    ipcRenderer.on('ssh:error', listener)
    return () => ipcRenderer.removeListener('ssh:error', listener)
  },

  onTransferStart: (callback: (transferId: string, fileName: string, localPath: string) => void) => {
    const listener = (_event: any, transferId: string, fileName: string, localPath: string) => callback(transferId, fileName, localPath)
    ipcRenderer.on('sftp:transferStart', listener)
    return () => ipcRenderer.removeListener('sftp:transferStart', listener)
  },
  onTransferProgress: (callback: (transferId: string, transferred: number, total: number) => void) => {
    const listener = (_event: any, transferId: string, transferred: number, total: number) => callback(transferId, transferred, total)
    ipcRenderer.on('sftp:transferProgress', listener)
    return () => ipcRenderer.removeListener('sftp:transferProgress', listener)
  },
  onTransferComplete: (callback: (transferId: string, localPath: string) => void) => {
    const listener = (_event: any, transferId: string, localPath: string) => callback(transferId, localPath)
    ipcRenderer.on('sftp:transferComplete', listener)
    return () => ipcRenderer.removeListener('sftp:transferComplete', listener)
  },
  onTransferError: (callback: (transferId: string, error: string) => void) => {
    const listener = (_event: any, transferId: string, error: string) => callback(transferId, error)
    ipcRenderer.on('sftp:transferError', listener)
    return () => ipcRenderer.removeListener('sftp:transferError', listener)
  },

  updateTitleBar: (theme: string, colors?: { color: string; symbolColor: string }) => ipcRenderer.send('titlebar:theme', theme, colors),
})
