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

  sshConnect: (connectionId: string) => ipcRenderer.invoke('ssh:connect', connectionId),
  sshDisconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', sessionId),
  sshWrite: (sessionId: string, data: string) => ipcRenderer.send('ssh:write', sessionId, data),
  sshResize: (sessionId: string, cols: number, rows: number) => ipcRenderer.send('ssh:resize', sessionId, cols, rows),
  sshTestConnection: (connectionId: string) => ipcRenderer.invoke('ssh:testConnection', connectionId),

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

  updateTitleBar: (theme: string, colors?: { color: string; symbolColor: string }) => ipcRenderer.send('titlebar:theme', theme, colors),
})
