import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('liteSSH', {
  getAppBootstrap: () => ipcRenderer.invoke('app:getBootstrap'),
  getConnections: () => ipcRenderer.invoke('store:getConnections'),
  saveConnection: (conn: any) => ipcRenderer.invoke('store:saveConnection', conn),
  deleteConnection: (id: string) => ipcRenderer.invoke('store:deleteConnection', id),
  updateConnectionGroup: (id: string, groupId: string | undefined) => ipcRenderer.invoke('store:updateConnectionGroup', id, groupId),
  isEncryptionAvailable: () => ipcRenderer.invoke('store:isEncryptionAvailable'),
  getConnectionPassword: (id: string) => ipcRenderer.invoke('store:getConnectionPassword', id),
  getSavedCredentials: () => ipcRenderer.invoke('store:getSavedCredentials'),
  getSavedCredentialPassword: (id: string) => ipcRenderer.invoke('store:getSavedCredentialPassword', id),
  saveSavedCredential: (credential: any) => ipcRenderer.invoke('store:saveSavedCredential', credential),
  deleteSavedCredential: (id: string) => ipcRenderer.invoke('store:deleteSavedCredential', id),

  getGroups: () => ipcRenderer.invoke('store:getGroups'),
  saveGroup: (group: any) => ipcRenderer.invoke('store:saveGroup', group),
  deleteGroup: (id: string) => ipcRenderer.invoke('store:deleteGroup', id),
  reorderGroups: (ids: string[]) => ipcRenderer.invoke('store:reorderGroups', ids),
  setDefaultGroup: (id: string | null) => ipcRenderer.invoke('store:setDefaultGroup', id),

  getDownloadPath: () => ipcRenderer.invoke('settings:getDownloadPath'),
  setDownloadPath: (dirPath: string) => ipcRenderer.invoke('settings:setDownloadPath', dirPath),
  getRecentConnections: () => ipcRenderer.invoke('settings:getRecentConnections'),
  recordRecentConnection: (connectionId: string) => ipcRenderer.invoke('settings:recordRecentConnection', connectionId),
  selectDirectory: () => ipcRenderer.invoke('settings:selectDirectory'),

  getTerminalFontSize: () => ipcRenderer.invoke('settings:getTerminalFontSize'),
  setTerminalFontSize: (size: number) => ipcRenderer.invoke('settings:setTerminalFontSize', size),
  getRecentDownloadPaths: () => ipcRenderer.invoke('settings:getRecentDownloadPaths'),
  addRecentDownloadPath: (dirPath: string) => ipcRenderer.invoke('settings:addRecentDownloadPath', dirPath),
  getCredentialAutoFillEnabled: () => ipcRenderer.invoke('settings:getCredentialAutoFillEnabled'),
  setCredentialAutoFillEnabled: (enabled: boolean) => ipcRenderer.invoke('settings:setCredentialAutoFillEnabled', enabled),
  getAiSettings: () => ipcRenderer.invoke('settings:getAiSettings'),
  setAiSettings: (settings: any) => ipcRenderer.invoke('settings:setAiSettings', settings),
  aiChat: (messages: any[]) => ipcRenderer.invoke('ai:chat', messages),
  aiChatStream: (requestId: string, messages: any[]) => ipcRenderer.invoke('ai:chatStream', requestId, messages),
  getAiSessionHistory: (sessionId: string) => ipcRenderer.invoke('ai:getSessionHistory', sessionId),
  listAiSessionHistories: () => ipcRenderer.invoke('ai:listSessionHistories'),
  appendAiSessionHistory: (sessionId: string, record: any) => ipcRenderer.invoke('ai:appendSessionHistory', sessionId, record),
  clearAiSessionHistory: (sessionId: string) => ipcRenderer.invoke('ai:clearSessionHistory', sessionId),
  onAiChatStream: (requestId: string, callback: (payload: any) => void) => {
    const channel = `ai:chatStream:${requestId}`
    const listener = (_event: any, payload: any) => callback(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  getLatencyEnabled: () => ipcRenderer.invoke('settings:getLatencyEnabled'),
  setLatencyEnabled: (enabled: boolean) => ipcRenderer.invoke('settings:setLatencyEnabled', enabled),
  getLatencyIntervalMs: () => ipcRenderer.invoke('settings:getLatencyIntervalMs'),
  setLatencyIntervalMs: (intervalMs: number) => ipcRenderer.invoke('settings:setLatencyIntervalMs', intervalMs),

  exportConnections: () => ipcRenderer.invoke('store:exportConnections'),
  importConnections: () => ipcRenderer.invoke('store:importConnections'),

  sshConnect: (connectionId: string) => ipcRenderer.invoke('ssh:connect', connectionId),
  sshDisconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', sessionId),
  sshWrite: (sessionId: string, data: string) => ipcRenderer.send('ssh:write', sessionId, data),
  sshResize: (sessionId: string, cols: number, rows: number) => ipcRenderer.send('ssh:resize', sessionId, cols, rows),
  sshTestConnection: (connectionId: string) => ipcRenderer.invoke('ssh:testConnection', connectionId),
  sshTestConnectionParams: (params: { host: string; port: number; username: string; password: string; privateKey?: string }) => ipcRenderer.invoke('ssh:testConnectionParams', params),
sshDiagnoseConnectionParams: (params: { host: string; port: number; username: string; password: string; privateKey?: string }) =>
    ipcRenderer.invoke('ssh:diagnoseConnectionParams', params),

  sshRemoveHostKey: (host: string, port: number) => ipcRenderer.invoke('ssh:removeHostKey', host, port),
  sshGetHostKeyFingerprint: (host: string, port: number) => ipcRenderer.invoke('ssh:getHostKeyFingerprint', host, port),

  sshStartLatencyMonitor: (sessionId: string) => ipcRenderer.invoke('ssh:startLatencyMonitor', sessionId),
  sshStopLatencyMonitor: (sessionId: string) => ipcRenderer.invoke('ssh:stopLatencyMonitor', sessionId),
  sshMeasureLatency: (sessionId: string) => ipcRenderer.invoke('ssh:measureLatency', sessionId),
  sshExec: (sessionId: string, command: string, timeoutMs?: number) => ipcRenderer.invoke('ssh:exec', sessionId, command, timeoutMs),

  getMonitorEnabled: () => ipcRenderer.invoke('settings:getMonitorEnabled'),
  setMonitorEnabled: (enabled: boolean) => ipcRenderer.invoke('settings:setMonitorEnabled', enabled),
  getMonitorIntervalMs: () => ipcRenderer.invoke('settings:getMonitorIntervalMs'),
  setMonitorIntervalMs: (intervalMs: number) => ipcRenderer.invoke('settings:setMonitorIntervalMs', intervalMs),
  monitorStart: (sessionId: string) => ipcRenderer.invoke('monitor:start', sessionId),
  monitorStop: (sessionId: string) => ipcRenderer.invoke('monitor:stop', sessionId),

  sftpInit: (sessionId: string) => ipcRenderer.invoke('sftp:init', sessionId),
  sftpReaddir: (sessionId: string, remotePath: string) => ipcRenderer.invoke('sftp:readdir', sessionId, remotePath),
  sftpRealpath: (sessionId: string, remotePath: string) => ipcRenderer.invoke('sftp:realpath', sessionId, remotePath),
  sftpExecHome: (sessionId: string) => ipcRenderer.invoke('sftp:execHome', sessionId),
  sftpDownload: (sessionId: string, remotePath: string, fileName: string, transferId: string) =>
    ipcRenderer.send('sftp:download', sessionId, remotePath, fileName, transferId),
  sftpUpload: (sessionId: string, localPath: string, remotePath: string, fileName: string, transferId: string) =>
    ipcRenderer.send('sftp:upload', sessionId, localPath, remotePath, fileName, transferId),
  sftpCancelTransfer: (transferId: string) => ipcRenderer.send('sftp:cancelTransfer', transferId),

  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  readPrivateKeyFile: () => ipcRenderer.invoke('dialog:readPrivateKey'),

  shellOpenPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),
  shellShowItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),

  clipboardReadText: () => ipcRenderer.invoke('clipboard:readText'),
  clipboardWriteText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),

  onSshData: (sessionId: string, callback: (data: string) => void) => {
    const channel = `ssh:data:${sessionId}`
    const listener = (_event: any, data: string) => callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  onSshClosed: (sessionId: string, callback: () => void) => {
    const channel = `ssh:closed:${sessionId}`
    const listener = () => callback()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  onSshError: (sessionId: string, callback: (error: string) => void) => {
    const channel = `ssh:error:${sessionId}`
    const listener = (_event: any, error: string) => callback(error)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  onSshLatency: (sessionId: string, callback: (latencyMs: number) => void) => {
    const channel = `ssh:latency:${sessionId}`
    const listener = (_event: any, latencyMs: number) => callback(latencyMs)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  onMonitorData: (sessionId: string, callback: (data: any) => void) => {
    const channel = `monitor:data:${sessionId}`
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  onTransferStart: (callback: (sessionId: string, transferId: string, fileName: string, localPath: string, direction: 'download' | 'upload') => void) => {
    const listener = (_event: any, sessionId: string, transferId: string, fileName: string, localPath: string, direction: string) => callback(sessionId, transferId, fileName, localPath, direction as 'download' | 'upload')
    ipcRenderer.on('sftp:transferStart', listener)
    return () => ipcRenderer.removeListener('sftp:transferStart', listener)
  },
  onTransferProgress: (callback: (sessionId: string, transferId: string, transferred: number, total: number) => void) => {
    const listener = (_event: any, sessionId: string, transferId: string, transferred: number, total: number) => callback(sessionId, transferId, transferred, total)
    ipcRenderer.on('sftp:transferProgress', listener)
    return () => ipcRenderer.removeListener('sftp:transferProgress', listener)
  },
  onTransferComplete: (callback: (sessionId: string, transferId: string, localPath: string) => void) => {
    const listener = (_event: any, sessionId: string, transferId: string, localPath: string) => callback(sessionId, transferId, localPath)
    ipcRenderer.on('sftp:transferComplete', listener)
    return () => ipcRenderer.removeListener('sftp:transferComplete', listener)
  },
  onTransferError: (callback: (sessionId: string, transferId: string, error: string) => void) => {
    const listener = (_event: any, sessionId: string, transferId: string, error: string) => callback(sessionId, transferId, error)
    ipcRenderer.on('sftp:transferError', listener)
    return () => ipcRenderer.removeListener('sftp:transferError', listener)
  },

  updateTitleBar: (theme: string, colors?: { color: string; symbolColor: string }) => ipcRenderer.send('titlebar:theme', theme, colors),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  quitAndInstall: () => ipcRenderer.invoke('updater:install'),
  skipUpdateVersion: (version: string) => ipcRenderer.invoke('updater:skipVersion', version),
  getAutoUpdateEnabled: () => ipcRenderer.invoke('settings:getAutoUpdateEnabled'),
  setAutoUpdateEnabled: (enabled: boolean) => ipcRenderer.invoke('settings:setAutoUpdateEnabled', enabled),
  onUpdateStatus: (callback: (status: any) => void) => {
    const listener = (_event: any, status: any) => callback(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  },
})
