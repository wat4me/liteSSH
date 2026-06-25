import { ipcMain, BrowserWindow, dialog, shell, clipboard, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { CredentialStore } from '../store/credentialStore'
import { SettingsStore } from '../store/settingsStore'
import { titleBarThemes } from '../window/createWindow'
import {
  isValidUUID,
  isValidHost,
  isValidUsername,
  isValidPort,
  isValidX11Display,
  isLoopbackHost,
  isStrictPath,
} from '../utils/validation'

function getUniqueLocalPath(dir: string, filename: string): string {
  let filePath = join(dir, filename)
  if (!existsSync(filePath)) return filePath

  const ext = filename.includes('.') ? '.' + filename.split('.').pop() : ''
  const baseName = ext ? filename.slice(0, -ext.length) : filename
  let counter = 1
  while (existsSync(join(dir, `${baseName} (${counter})${ext}`))) {
    counter++
  }
  return join(dir, `${baseName} (${counter})${ext}`)
}

type MainWindowGetter = () => BrowserWindow | null

export function registerStoreHandlers(
  getMainWindow: MainWindowGetter,
  credentialStore: CredentialStore,
  settingsStore: SettingsStore
): void {
  const ensureCredentialStoreReady = () => credentialStore.init()
  const ensureSettingsStoreReady = () => settingsStore.init()
  const ensureStoresReady = () =>
    Promise.all([ensureCredentialStoreReady(), ensureSettingsStoreReady()])

  async function getRecentConnectionsSnapshot() {
    await ensureStoresReady()
    const recentIds = settingsStore.getRecentConnectionIds()
    const connections = recentIds.reduce<ReturnType<typeof credentialStore.getConnections>>((list, id) => {
      const connection = credentialStore.getConnection(id)
      if (connection) {
        list.push(connection)
      }
      return list
    }, [])

    const validIds = connections.map((connection) => connection.id)
    if (validIds.length !== recentIds.length) {
      await settingsStore.pruneRecentConnectionIds(validIds)
    }

    return connections
  }

  // Title bar theme
  ipcMain.on('titlebar:theme', (_event, theme: string, colors?: { color: string; symbolColor: string }) => {
    let finalColors = titleBarThemes[theme as keyof typeof titleBarThemes] || titleBarThemes.dark
    if (theme === 'custom' && colors) {
      finalColors = colors
    }
    const mainWindow = getMainWindow()
    mainWindow?.setTitleBarOverlay({
      color: finalColors.color,
      symbolColor: finalColors.symbolColor,
    })
    mainWindow?.setBackgroundColor(finalColors.color)
  })

  ipcMain.handle('app:getBootstrap', async () => {
    await ensureStoresReady()
    const recentConnections = await getRecentConnectionsSnapshot()
    return {
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      connections: credentialStore.getConnections(),
      groups: credentialStore.getGroups(),
      recentConnections,
      latencyEnabled: settingsStore.getLatencyEnabled(),
      latencyIntervalMs: settingsStore.getLatencyIntervalMs(),
      monitorEnabled: settingsStore.getMonitorEnabled(),
      monitorIntervalMs: settingsStore.getMonitorIntervalMs(),
    }
  })

  // Credential store
  ipcMain.handle('store:getConnections', async () => {
    await ensureCredentialStoreReady()
    return credentialStore.getConnections()
  })

  ipcMain.handle('store:saveConnection', async (_event, connection: any) => {
    await ensureCredentialStoreReady()
    if (!connection || typeof connection !== 'object') {
      throw new Error('Invalid connection object')
    }
    if (!connection.name || typeof connection.name !== 'string') {
      throw new Error('Invalid connection name')
    }
    if (!isValidHost(connection.host)) {
      throw new Error('Invalid host')
    }
    if (!isValidUsername(connection.username)) {
      throw new Error('Invalid username')
    }
    if (typeof connection.password !== 'string') {
      throw new Error('Invalid password')
    }
    if (connection.port !== undefined && !isValidPort(connection.port)) {
      throw new Error('Invalid port')
    }
    if (connection.id !== undefined && !isValidUUID(connection.id)) {
      throw new Error('Invalid connection id')
    }
    if (connection.x11Forwarding !== undefined && typeof connection.x11Forwarding !== 'boolean') {
      throw new Error('Invalid X11 forwarding setting')
    }
    if (connection.x11Host !== undefined && (!isValidHost(connection.x11Host) || !isLoopbackHost(connection.x11Host))) {
      throw new Error('Invalid X11 host')
    }
    if (connection.x11Display !== undefined && !isValidX11Display(connection.x11Display)) {
      throw new Error('Invalid X11 display')
    }
    return await credentialStore.saveConnection(connection)
  })

  ipcMain.handle('store:deleteConnection', async (_event, id: string) => {
    await ensureCredentialStoreReady()
    if (!isValidUUID(id)) {
      throw new Error('Invalid connection id')
    }
    return await credentialStore.deleteConnection(id)
  })

  ipcMain.handle('store:updateConnectionGroup', async (_event, id: string, groupId: string | undefined) => {
    await ensureCredentialStoreReady()
    if (!isValidUUID(id)) {
      throw new Error('Invalid connection id')
    }
    return await credentialStore.updateConnectionGroup(id, groupId)
  })

  ipcMain.handle('store:getConnectionPassword', async (_event, id: string) => {
    await ensureCredentialStoreReady()
    if (!isValidUUID(id)) {
      throw new Error('Invalid connection id')
    }
    return credentialStore.getConnectionPassword(id) || ''
  })

  ipcMain.handle('store:getSavedCredentials', async () => {
    await ensureCredentialStoreReady()
    return credentialStore.getSavedCredentials()
  })

  ipcMain.handle('store:getSavedCredentialPassword', async (_event, id: string) => {
    await ensureCredentialStoreReady()
    if (!isValidUUID(id)) {
      throw new Error('Invalid credential id')
    }
    return credentialStore.getSavedCredentialPassword(id) || ''
  })

  ipcMain.handle('store:saveSavedCredential', async (_event, credential: any) => {
    await ensureCredentialStoreReady()
    if (!credential || typeof credential !== 'object') {
      throw new Error('Invalid credential object')
    }
    if (!credential.name || typeof credential.name !== 'string') {
      throw new Error('Invalid credential name')
    }
    if (!isValidUsername(credential.username)) {
      throw new Error('Invalid username')
    }
    if (typeof credential.password !== 'string') {
      throw new Error('Invalid password')
    }
    if (credential.id !== undefined && !isValidUUID(credential.id)) {
      throw new Error('Invalid credential id')
    }
    return await credentialStore.saveSavedCredential(credential)
  })

  ipcMain.handle('store:deleteSavedCredential', async (_event, id: string) => {
    await ensureCredentialStoreReady()
    if (!isValidUUID(id)) {
      throw new Error('Invalid credential id')
    }
    return await credentialStore.deleteSavedCredential(id)
  })

  ipcMain.handle('store:isEncryptionAvailable', () => {
    return safeStorage.isEncryptionAvailable()
  })

  ipcMain.handle('store:getGroups', async () => {
    await ensureCredentialStoreReady()
    return credentialStore.getGroups()
  })

  ipcMain.handle('store:saveGroup', async (_event, group: any) => {
    await ensureCredentialStoreReady()
    if (!group || typeof group !== 'object') {
      throw new Error('Invalid group object')
    }
    if (!group.name || typeof group.name !== 'string') {
      throw new Error('Invalid group name')
    }
    if (group.id !== undefined && !isValidUUID(group.id)) {
      throw new Error('Invalid group id')
    }
    return await credentialStore.saveGroup(group)
  })

  ipcMain.handle('store:deleteGroup', async (_event, id: string) => {
    await ensureCredentialStoreReady()
    if (!isValidUUID(id)) {
      throw new Error('Invalid group id')
    }
    return await credentialStore.deleteGroup(id)
  })

  ipcMain.handle('store:reorderGroups', async (_event, ids: string[]) => {
    await ensureCredentialStoreReady()
    if (!Array.isArray(ids) || !ids.every(isValidUUID)) {
      throw new Error('Invalid group ids')
    }
    await credentialStore.reorderGroups(ids)
  })

  ipcMain.handle('store:setDefaultGroup', async (_event, id: string | null) => {
    await ensureCredentialStoreReady()
    if (id !== null && !isValidUUID(id)) {
      throw new Error('Invalid group id')
    }
    await credentialStore.setDefaultGroup(id)
  })

  // Settings
  ipcMain.handle('settings:getDownloadPath', async () => {
    await ensureSettingsStoreReady()
    return settingsStore.getDownloadPath()
  })

  ipcMain.handle('settings:setDownloadPath', async (_event, dirPath: string) => {
    await ensureSettingsStoreReady()
    if (dirPath !== '' && !isStrictPath(dirPath)) {
      throw new Error('Invalid directory path')
    }
    await settingsStore.setDownloadPath(dirPath)
  })

  ipcMain.handle('settings:getRecentConnections', async () => {
    return await getRecentConnectionsSnapshot()
  })

  ipcMain.handle('settings:recordRecentConnection', async (_event, connectionId: string) => {
    await ensureStoresReady()
    if (!isValidUUID(connectionId)) {
      throw new Error('Invalid connection id')
    }
    if (credentialStore.getConnection(connectionId)) {
      await settingsStore.recordRecentConnection(connectionId)
    }
  })

  ipcMain.handle('settings:selectDirectory', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
    return null
  })

  ipcMain.handle('dialog:readPrivateKey', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: '选择私钥文件',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      const { readFile } = await import('fs/promises')
      const content = await readFile(result.filePaths[0], 'utf-8')
      return content
    } catch {
      return null
    }
  })

  ipcMain.handle('settings:getTerminalFontSize', async () => {
    await ensureSettingsStoreReady()
    return settingsStore.getTerminalFontSize()
  })

  ipcMain.handle('settings:setTerminalFontSize', async (_event, size: number) => {
    await ensureSettingsStoreReady()
    if (typeof size !== 'number' || size < 10 || size > 24) {
      throw new Error('Invalid font size')
    }
    await settingsStore.setTerminalFontSize(size)
  })

  ipcMain.handle('settings:getRecentDownloadPaths', async () => {
    await ensureSettingsStoreReady()
    return settingsStore.getRecentDownloadPaths()
  })

  ipcMain.handle('settings:addRecentDownloadPath', async (_event, dirPath: string) => {
    await ensureSettingsStoreReady()
    if (!isStrictPath(dirPath)) {
      throw new Error('Invalid directory path')
    }
    await settingsStore.addRecentDownloadPath(dirPath)
  })

  ipcMain.handle('settings:getCredentialAutoFillEnabled', async () => {
    await ensureSettingsStoreReady()
    return settingsStore.getCredentialAutoFillEnabled()
  })

  ipcMain.handle('settings:setCredentialAutoFillEnabled', async (_event, enabled: boolean) => {
    await ensureSettingsStoreReady()
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid value')
    }
    await settingsStore.setCredentialAutoFillEnabled(enabled)
  })

  // Import/Export
  ipcMain.handle('store:exportConnections', async () => {
    await ensureCredentialStoreReady()
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      connections: credentialStore.getConnectionsForExport(),
      groups: credentialStore.getGroups(),
    }
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, {
          title: '导出连接配置',
          defaultPath: 'liteSSH-connections.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
      : await dialog.showSaveDialog({
          title: '导出连接配置',
          defaultPath: 'liteSSH-connections.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
    if (result.canceled || !result.filePath) return false
    try {
      const { writeFile } = await import('fs/promises')
      await writeFile(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
      return true
    } catch {
      throw new Error('导出文件写入失败')
    }
  })

  ipcMain.handle('store:importConnections', async () => {
    await ensureCredentialStoreReady()
    const mainWindow = getMainWindow()
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入连接配置',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      const { readFile } = await import('fs/promises')
      const data = await readFile(result.filePaths[0], 'utf-8')
      const parsed = JSON.parse(data)
      if (!parsed.connections || !Array.isArray(parsed.connections)) {
        throw new Error('Invalid import format')
      }
      let imported = 0
      for (const conn of parsed.connections) {
        if (!conn.name || !conn.host || !conn.username) continue
        const existing = credentialStore.getConnections().find(
          (c: any) => c.host === conn.host && c.username === conn.username && c.port === (conn.port || 22)
        )
        if (existing) continue
        const x11Forwarding = conn.x11Forwarding === true
        const x11Host = typeof conn.x11Host === 'string' && isValidHost(conn.x11Host) && isLoopbackHost(conn.x11Host)
          ? conn.x11Host
          : undefined
        const x11Display = isValidX11Display(conn.x11Display) ? conn.x11Display : undefined
        await credentialStore.saveConnection({
          name: conn.name,
          host: conn.host,
          port: conn.port || 22,
          username: conn.username,
          password: conn.password || '',
          group: conn.group || undefined,
          keepaliveInterval: conn.keepaliveInterval,
          x11Forwarding,
          x11Host: x11Forwarding ? x11Host : undefined,
          x11Display: x11Forwarding ? x11Display : undefined,
          createdAt: conn.createdAt,
          updatedAt: conn.updatedAt,
        })
        imported++
      }
      return { imported, total: parsed.connections.length }
    } catch (err: any) {
      throw new Error(`导入失败: ${err.message}`)
    }
  })

  // Shell
  ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
    if (!isStrictPath(filePath)) {
      throw new Error('Invalid file path')
    }
    return await shell.openPath(filePath)
  })

  ipcMain.handle('shell:showItemInFolder', (_event, filePath: string) => {
    if (!isStrictPath(filePath)) {
      throw new Error('Invalid file path')
    }
    shell.showItemInFolder(filePath)
  })

  // Clipboard
  ipcMain.handle('clipboard:readText', () => {
    return clipboard.readText()
  })

  ipcMain.handle('clipboard:writeText', (_event, text: string) => {
    if (typeof text !== 'string') {
      throw new Error('Invalid text')
    }
    clipboard.writeText(text)
  })

  // Latency display settings
  ipcMain.handle('settings:getLatencyEnabled', async () => {
    await ensureSettingsStoreReady()
    return settingsStore.getLatencyEnabled()
  })

  ipcMain.handle('settings:setLatencyEnabled', async (_event, enabled: boolean) => {
    await ensureSettingsStoreReady()
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid value')
    }
    await settingsStore.setLatencyEnabled(enabled)
  })

  ipcMain.handle('settings:getLatencyIntervalMs', async () => {
    await ensureSettingsStoreReady()
    return settingsStore.getLatencyIntervalMs()
  })

  ipcMain.handle('settings:setLatencyIntervalMs', async (_event, intervalMs: number) => {
    await ensureSettingsStoreReady()
    if (typeof intervalMs !== 'number' || intervalMs < 1000 || intervalMs > 60000) {
      throw new Error('Invalid interval')
    }
    await settingsStore.setLatencyIntervalMs(intervalMs)
  })

  // Monitor settings
  ipcMain.handle('settings:getMonitorEnabled', async () => {
    await ensureSettingsStoreReady()
    return settingsStore.getMonitorEnabled()
  })

  ipcMain.handle('settings:setMonitorEnabled', async (_event, enabled: boolean) => {
    await ensureSettingsStoreReady()
    if (typeof enabled !== 'boolean') {
      throw new Error('Invalid value')
    }
    await settingsStore.setMonitorEnabled(enabled)
  })

  ipcMain.handle('settings:getMonitorIntervalMs', async () => {
    await ensureSettingsStoreReady()
    return settingsStore.getMonitorIntervalMs()
  })

  ipcMain.handle('settings:setMonitorIntervalMs', async (_event, intervalMs: number) => {
    await ensureSettingsStoreReady()
    if (typeof intervalMs !== 'number' || intervalMs < 2000 || intervalMs > 30000) {
      throw new Error('Invalid interval')
    }
    await settingsStore.setMonitorIntervalMs(intervalMs)
  })

  // Auto-update settings
  ipcMain.handle('settings:getAutoUpdateEnabled', async () => {
    await ensureSettingsStoreReady()
    return settingsStore.getAutoUpdateEnabled()
  })

  ipcMain.handle('settings:setAutoUpdateEnabled', async (_event, enabled: boolean) => {
    await ensureSettingsStoreReady()
    await settingsStore.setAutoUpdateEnabled(enabled)
  })

  ipcMain.handle('settings:getSkippedUpdateVersion', async () => {
    await ensureSettingsStoreReady()
    return settingsStore.getSkippedUpdateVersion()
  })

  ipcMain.handle('settings:setSkippedUpdateVersion', async (_event, version: string) => {
    await ensureSettingsStoreReady()
    if (!version || typeof version !== 'string') {
      throw new Error('Invalid version')
    }
    await settingsStore.setSkippedUpdateVersion(version)
  })
}
