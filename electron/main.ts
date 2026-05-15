import { app, BrowserWindow, ipcMain, Menu, dialog, shell, clipboard, safeStorage } from 'electron'
import { join } from 'path'
import { Client } from 'ssh2'
import { existsSync } from 'fs'
import { Socket } from 'net'
import { autoUpdater } from 'electron-updater'
import { CredentialStore } from './store/credentialStore'
import { SettingsStore } from './store/settingsStore'
import { SSHManager } from './ssh/manager'
import { MonitorCollector } from './ssh/monitor'

let mainWindow: BrowserWindow | null = null
const credentialStore = new CredentialStore()
const settingsStore = new SettingsStore()
const sshManager = new SSHManager()
const monitorCollector = new MonitorCollector(sshManager, (sessionId, data) => {
  mainWindow?.webContents.send(`monitor:data:${sessionId}`, data)
})
const SSH_DIAG_TIMEOUT_MS = 10000

// Validation helpers
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUUID(id: string): boolean {
  return typeof id === 'string' && UUID_RE.test(id)
}

function isValidPort(port: number): boolean {
  return typeof port === 'number' && port > 0 && port <= 65535 && Number.isInteger(port)
}

function isValidHost(host: string): boolean {
  if (typeof host !== 'string' || host.length === 0 || host.length > 255) return false
  return /^[a-zA-Z0-9.\-:]+$/.test(host)
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

function isValidX11Display(display: number): boolean {
  return typeof display === 'number' && Number.isInteger(display) && display >= 0 && display <= 99 && isValidPort(6000 + display)
}

function isValidUsername(username: string): boolean {
  return typeof username === 'string' && username.length > 0 && username.length <= 64
}

function isValidPath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0) return false
  if (p.includes('\0')) return false
  return true
}

function isStrictPath(p: string): boolean {
  if (!isValidPath(p)) return false
  if (/\.\.[\\/]/.test(p) || /[\\/]\.\./.test(p)) return false
  return true
}

function validateConnectionParams(params: any): { valid: boolean; error?: string } {
  if (!params || typeof params !== 'object') return { valid: false, error: 'Invalid params object' }
  if (!isValidHost(params.host)) return { valid: false, error: 'Invalid host' }
  if (!isValidPort(params.port)) return { valid: false, error: 'Invalid port' }
  if (!isValidUsername(params.username)) return { valid: false, error: 'Invalid username' }
  if (typeof params.password !== 'string') return { valid: false, error: 'Invalid password' }
  return { valid: true }
}

const dataBatches: Map<string, string> = new Map()
let dataBatchScheduled = false

function scheduleDataBatch() {
  if (dataBatchScheduled) return
  dataBatchScheduled = true
  setImmediate(() => {
    dataBatchScheduled = false
    for (const [sessionId, batch] of dataBatches) {
      dataBatches.delete(sessionId)
      mainWindow?.webContents.send(`ssh:data:${sessionId}`, batch)
    }
  })
}

function emitSshData(sessionId: string, data: string) {
  const existing = dataBatches.get(sessionId)
  if (existing) {
    dataBatches.set(sessionId, existing + data)
  } else {
    dataBatches.set(sessionId, data)
  }
  scheduleDataBatch()
}

type SshDiagnosisResult = {
  ok: boolean
  tcpLatency?: number
  sshReadyLatency?: number
  shellOpenLatency?: number
  shellFirstByteLatency?: number
  totalLatency?: number
  error?: string
}

function testTcpLatency(host: string, port: number, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    let settled = false
    const socket = new Socket()

    const finish = (handler: () => void) => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      handler()
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      finish(() => resolve(Date.now() - start))
    })
    socket.once('timeout', () => {
      finish(() => reject(new Error(`TCP connection timeout (${timeoutMs}ms)`)))
    })
    socket.once('error', (err) => {
      finish(() => reject(err))
    })

    socket.connect(port, host)
  })
}

async function diagnoseSshConnection(params: {
  host: string
  port: number
  username: string
  password: string
}): Promise<SshDiagnosisResult> {
  const totalStart = Date.now()
  let tcpLatency: number | undefined
  let sshReadyLatency: number | undefined
  let shellOpenLatency: number | undefined

  try {
    tcpLatency = await testTcpLatency(params.host, params.port, SSH_DIAG_TIMEOUT_MS)
  } catch (err: any) {
    return {
      ok: false,
      tcpLatency,
      error: err?.message || 'TCP connection failed',
    }
  }

  return new Promise((resolve) => {
    const sshStart = Date.now()
    const client = new Client()
    let done = false
    let shellTimeout: ReturnType<typeof setTimeout> | null = null

    const finish = (result: SshDiagnosisResult) => {
      if (done) return
      done = true
      if (shellTimeout) {
        clearTimeout(shellTimeout)
        shellTimeout = null
      }
      client.removeAllListeners()
      client.end()
      resolve({
        tcpLatency,
        sshReadyLatency,
        shellOpenLatency,
        ...result,
      })
    }

    shellTimeout = setTimeout(() => {
      finish({
        ok: false,
        totalLatency: Date.now() - totalStart,
        error: `SSH diagnosis timeout (${SSH_DIAG_TIMEOUT_MS}ms)`,
      })
    }, SSH_DIAG_TIMEOUT_MS)

    client.on('ready', () => {
      sshReadyLatency = Date.now() - sshStart
      const shellStart = Date.now()
      client.shell(
        {
          term: 'xterm-256color',
          cols: 80,
          rows: 24,
        },
        (err, stream) => {
          if (err) {
            finish({
              ok: false,
              totalLatency: Date.now() - totalStart,
              error: `Shell open error: ${err.message}`,
            })
            return
          }

          shellOpenLatency = Date.now() - shellStart
          const firstByteStart = Date.now()
          let gotFirstByte = false

          const handleFirstByte = () => {
            if (gotFirstByte) return
            gotFirstByte = true
            finish({
              ok: true,
              shellFirstByteLatency: Date.now() - firstByteStart,
              totalLatency: Date.now() - totalStart,
            })
          }

          stream.on('data', (data: Buffer) => {
            if (data.length > 0) {
              handleFirstByte()
            }
          })
          stream.stderr.on('data', (data: Buffer) => {
            if (data.length > 0) {
              handleFirstByte()
            }
          })
          stream.on('close', () => {
            if (!gotFirstByte) {
              finish({
                ok: false,
                totalLatency: Date.now() - totalStart,
                error: 'Shell closed before first byte',
              })
            }
          })

          // Trigger prompt/output to measure interactive echo path.
          stream.write('\r')
        }
      )
    })

    client.on('error', (err) => {
      finish({
        ok: false,
        totalLatency: Date.now() - totalStart,
        error: err.message,
      })
    })

    client.connect({
      host: params.host,
      port: params.port,
      username: params.username,
      password: params.password,
      readyTimeout: SSH_DIAG_TIMEOUT_MS,
    })
  })
}

const titleBarThemes: Record<string, { color: string; symbolColor: string }> = {
  dark: { color: '#0d1117', symbolColor: '#8b949e' },
  light: { color: '#ffffff', symbolColor: '#656d76' },
  eyecare: { color: '#f5f0e8', symbolColor: '#8a7f70' },
}

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

function createWindow() {
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'liteSSH',
    backgroundColor: '#0d1117',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d1117',
      symbolColor: '#8b949e',
      height: 36,
    },
    icon: join(__dirname, process.env.VITE_DEV_SERVER_URL ? '../build/liteSSH.png' : '../dist/liteSSH.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  await credentialStore.init()
  await settingsStore.init()
  createWindow()

  // Auto-updater setup
  autoUpdater.logger = console
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('updater:status', { status: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    const skippedVersion = settingsStore.getSkippedUpdateVersion()
    if (info.version === skippedVersion) return
    mainWindow?.webContents.send('updater:status', { status: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('updater:status', { status: 'not-available', version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:status', { status: 'downloading', progress: progress.percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:status', { status: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:status', { status: 'error', message: err.message })
  })

  // Auto-check after 5 seconds (if auto-update is enabled)
  if (settingsStore.getAutoUpdateEnabled()) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 5000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  for (const [, timer] of latencyTimers) clearInterval(timer)
  latencyTimers.clear()
  monitorCollector.stopAll()
  sshManager.forceDisconnectAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clear decrypted password cache when window loses focus
app.on('browser-window-blur', () => {
  credentialStore.clearDecryptedCache()
})

app.on('before-quit', () => {
  for (const [, timer] of latencyTimers) clearInterval(timer)
  latencyTimers.clear()
  monitorCollector.stopAll()
  sshManager.forceDisconnectAll()
})

process.on('unhandledRejection', (reason) => {
  console.error('[Main Unhandled Promise]', reason)
})

// SSH connection rate limiting (3s cooldown per connection)
const sshConnectCooldowns = new Map<string, number>()
const SSH_CONNECT_COOLDOWN_MS = 3000

// Title bar theme
ipcMain.on('titlebar:theme', (_event, theme: string, colors?: { color: string; symbolColor: string }) => {
  let finalColors = titleBarThemes[theme as keyof typeof titleBarThemes] || titleBarThemes.dark
  if (theme === 'custom' && colors) {
    finalColors = colors
  }
  mainWindow?.setTitleBarOverlay({
    color: finalColors.color,
    symbolColor: finalColors.symbolColor,
  })
  mainWindow?.setBackgroundColor(finalColors.color)
})

// Credential store
ipcMain.handle('store:getConnections', () => {
  return credentialStore.getConnections()
})

ipcMain.handle('store:saveConnection', async (_event, connection: any) => {
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
  if (!isValidUUID(id)) {
    throw new Error('Invalid connection id')
  }
  return await credentialStore.deleteConnection(id)
})

ipcMain.handle('store:updateConnectionGroup', async (_event, id: string, groupId: string | undefined) => {
  if (!isValidUUID(id)) {
    throw new Error('Invalid connection id')
  }
  return await credentialStore.updateConnectionGroup(id, groupId)
})

ipcMain.handle('store:getConnectionPassword', (_event, id: string) => {
  if (!isValidUUID(id)) {
    throw new Error('Invalid connection id')
  }
  return credentialStore.getConnectionPassword(id) || ''
})

ipcMain.handle('store:isEncryptionAvailable', () => {
  return safeStorage.isEncryptionAvailable()
})

ipcMain.handle('store:getGroups', () => {
  return credentialStore.getGroups()
})

ipcMain.handle('store:saveGroup', async (_event, group: any) => {
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
  if (!isValidUUID(id)) {
    throw new Error('Invalid group id')
  }
  return await credentialStore.deleteGroup(id)
})

ipcMain.handle('store:reorderGroups', async (_event, ids: string[]) => {
  if (!Array.isArray(ids) || !ids.every(isValidUUID)) {
    throw new Error('Invalid group ids')
  }
  await credentialStore.reorderGroups(ids)
})

ipcMain.handle('store:setDefaultGroup', async (_event, id: string) => {
  if (!isValidUUID(id)) {
    throw new Error('Invalid group id')
  }
  await credentialStore.setDefaultGroup(id)
})

// Settings
ipcMain.handle('settings:getDownloadPath', () => {
  return settingsStore.getDownloadPath()
})

ipcMain.handle('settings:setDownloadPath', async (_event, dirPath: string) => {
  if (!isStrictPath(dirPath)) {
    throw new Error('Invalid directory path')
  }
  await settingsStore.setDownloadPath(dirPath)
})

ipcMain.handle('settings:getRecentConnections', async () => {
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
})

ipcMain.handle('settings:recordRecentConnection', async (_event, connectionId: string) => {
  if (!isValidUUID(connectionId)) {
    throw new Error('Invalid connection id')
  }
  if (credentialStore.getConnection(connectionId)) {
    await settingsStore.recordRecentConnection(connectionId)
  }
})

ipcMain.handle('settings:selectDirectory', async () => {
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
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: '选择私钥文件',
    filters: [
      { name: '私钥文件', extensions: ['pem', 'key', 'id_rsa', 'id_ed25519', 'id_ecdsa'] },
      { name: '所有文件', extensions: ['*'] },
    ],
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

ipcMain.handle('settings:getTerminalFontSize', () => {
  return settingsStore.getTerminalFontSize()
})

ipcMain.handle('settings:setTerminalFontSize', async (_event, size: number) => {
  if (typeof size !== 'number' || size < 10 || size > 24) {
    throw new Error('Invalid font size')
  }
  await settingsStore.setTerminalFontSize(size)
})

ipcMain.handle('settings:getRecentDownloadPaths', () => {
  return settingsStore.getRecentDownloadPaths()
})

ipcMain.handle('settings:addRecentDownloadPath', async (_event, dirPath: string) => {
  if (!isStrictPath(dirPath)) {
    throw new Error('Invalid directory path')
  }
  await settingsStore.addRecentDownloadPath(dirPath)
})

// Import/Export
ipcMain.handle('store:exportConnections', async () => {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    connections: credentialStore.getConnections(),
    groups: credentialStore.getGroups(),
  }
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
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

// SSH
ipcMain.handle('ssh:testConnection', async (_event, connectionId: string) => {
  if (!isValidUUID(connectionId)) {
    throw new Error('Invalid connection id')
  }
  const connection = credentialStore.getConnectionForAuth(connectionId)
  if (!connection) throw new Error('Connection not found')

  const start = Date.now()
  return new Promise((resolve) => {
    const client = new Client()
    client.on('ready', () => {
      const latency = Date.now() - start
      client.end()
      resolve({ ok: true, latency })
    })
    client.on('error', (err) => {
      resolve({ ok: false, error: err.message })
    })
    client.connect({
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      readyTimeout: 10000,
    })
  })
})

ipcMain.handle('ssh:testConnectionParams', async (_event, params: { host: string; port: number; username: string; password: string }) => {
  const validation = validateConnectionParams(params)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const start = Date.now()
  return new Promise((resolve) => {
    const client = new Client()
    client.on('ready', () => {
      const latency = Date.now() - start
      client.end()
      resolve({ ok: true, latency })
    })
    client.on('error', (err) => {
      resolve({ ok: false, error: err.message })
    })
    client.connect({
      host: params.host,
      port: params.port,
      username: params.username,
      password: params.password,
      readyTimeout: 10000,
    })
  })
})

ipcMain.handle('ssh:diagnoseConnectionParams', async (_event, params: { host: string; port: number; username: string; password: string }) => {
  const validation = validateConnectionParams(params)
  if (!validation.valid) {
    throw new Error(validation.error)
  }
  return await diagnoseSshConnection(params)
})

ipcMain.handle('ssh:connect', async (_event, connectionId: string) => {
  if (!isValidUUID(connectionId)) {
    throw new Error('Invalid connection id')
  }
  const connection = credentialStore.getConnectionForAuth(connectionId)
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`)
  }

  const now = Date.now()
  const lastAttempt = sshConnectCooldowns.get(connectionId)
  if (lastAttempt && now - lastAttempt < SSH_CONNECT_COOLDOWN_MS) {
    throw new Error(`Please wait ${Math.ceil((SSH_CONNECT_COOLDOWN_MS - (now - lastAttempt)) / 1000)}s before reconnecting`)
  }
  sshConnectCooldowns.set(connectionId, now)
  for (const [id, ts] of sshConnectCooldowns) {
    if (now - ts > SSH_CONNECT_COOLDOWN_MS) sshConnectCooldowns.delete(id)
  }

  const sessionId = await sshManager.connect(connection, {
    onData: (sid, data) => {
      emitSshData(sid, data)
    },
    onClose: (sid) => {
      mainWindow?.webContents.send(`ssh:closed:${sid}`)
    },
    onError: (sid, err) => {
      mainWindow?.webContents.send(`ssh:error:${sid}`, err)
    },
  })

  return sessionId
})

ipcMain.handle('ssh:disconnect', (_event, sessionId: string) => {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid session id')
  }
  const timer = latencyTimers.get(sessionId)
  if (timer) {
    clearInterval(timer)
    latencyTimers.delete(sessionId)
  }
  sshManager.disconnect(sessionId)
})

ipcMain.on('ssh:write', (_event, sessionId: string, data: string) => {
  if (!sessionId || typeof sessionId !== 'string') return
  if (typeof data !== 'string') return
  const ok = sshManager.write(sessionId, data)
  if (!ok) {
    console.warn('[ssh:write] Session not writable, possible disconnect:', sessionId)
  }
})

ipcMain.on('ssh:resize', (_event, sessionId: string, cols: number, rows: number) => {
  if (!sessionId || typeof sessionId !== 'string') return
  if (typeof cols !== 'number' || cols <= 0 || !Number.isInteger(cols)) return
  if (typeof rows !== 'number' || rows <= 0 || !Number.isInteger(rows)) return
  sshManager.resize(sessionId, cols, rows)
})

// SFTP operations
ipcMain.handle('sftp:init', async (_event, sessionId: string) => {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid session id')
  }
  await sshManager.initSftp(sessionId)
})

ipcMain.handle('sftp:readdir', async (_event, sessionId: string, remotePath: string) => {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid session id')
  }
  if (!isValidPath(remotePath)) {
    throw new Error('Invalid remote path')
  }
  const cleanPath = remotePath.replace(/\/+$/, '') || '/'
  return await sshManager.sftpReaddir(sessionId, cleanPath)
})

ipcMain.handle('sftp:realpath', async (_event, sessionId: string, remotePath: string) => {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid session id')
  }
  if (!isValidPath(remotePath)) {
    throw new Error('Invalid remote path')
  }
  const cleanPath = remotePath.replace(/\/+$/, '') || '/'
  return await sshManager.sftpRealpath(sessionId, cleanPath)
})

ipcMain.handle('sftp:execPwd', async (_event, sessionId: string) => {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid session id')
  }
  return await sshManager.sftpExec(sessionId, 'pwd')
})

ipcMain.handle('sftp:syncPwd', async (_event, sessionId: string) => {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid session id')
  }
  return await sshManager.queryPwd(sessionId)
})

ipcMain.handle('sftp:execHome', async (_event, sessionId: string) => {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid session id')
  }
  return await sshManager.sftpExec(sessionId, 'printf "%s" "$HOME"')
})

ipcMain.on('sftp:download', (_event, sessionId: string, remotePath: string, fileName: string, transferId: string) => {
  if (!sessionId || typeof sessionId !== 'string') return
  if (!isStrictPath(remotePath)) return
  if (!fileName || typeof fileName !== 'string') return
  if (!transferId || typeof transferId !== 'string') return
  const downloadDir = settingsStore.getDownloadPath()
  const localPath = getUniqueLocalPath(downloadDir, fileName)

  mainWindow?.webContents.send('sftp:transferStart', sessionId, transferId, fileName, localPath, 'download')

  sshManager
    .sftpDownload(sessionId, remotePath, localPath, transferId, (transferred, total) => {
      mainWindow?.webContents.send('sftp:transferProgress', sessionId, transferId, transferred, total)
    })
    .then(() => {
      mainWindow?.webContents.send('sftp:transferComplete', sessionId, transferId, localPath)
    })
    .catch((err) => {
      mainWindow?.webContents.send('sftp:transferError', sessionId, transferId, err.message)
    })
})

ipcMain.on('sftp:cancelTransfer', (_event, transferId: string) => {
  if (!transferId || typeof transferId !== 'string') return
  sshManager.cancelTransfer(transferId)
})

ipcMain.on('sftp:upload', (_event, sessionId: string, localPath: string, remotePath: string, fileName: string, transferId: string) => {
  if (!sessionId || typeof sessionId !== 'string') return
  if (!isStrictPath(localPath)) return
  if (!isStrictPath(remotePath)) return
  if (!fileName || typeof fileName !== 'string') return
  if (!transferId || typeof transferId !== 'string') return
  const fullRemotePath = remotePath.endsWith('/') ? remotePath + fileName : remotePath + '/' + fileName
  mainWindow?.webContents.send('sftp:transferStart', sessionId, transferId, fileName, localPath, 'upload')

  sshManager
    .sftpUpload(sessionId, localPath, fullRemotePath, transferId, (transferred, total) => {
      mainWindow?.webContents.send('sftp:transferProgress', sessionId, transferId, transferred, total)
    })
    .then(() => {
      mainWindow?.webContents.send('sftp:transferComplete', sessionId, transferId, localPath)
    })
    .catch((err) => {
      mainWindow?.webContents.send('sftp:transferError', sessionId, transferId, err.message)
    })
})

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
ipcMain.handle('settings:getLatencyEnabled', () => {
  return settingsStore.getLatencyEnabled()
})

ipcMain.handle('settings:setLatencyEnabled', async (_event, enabled: boolean) => {
  if (typeof enabled !== 'boolean') {
    throw new Error('Invalid value')
  }
  await settingsStore.setLatencyEnabled(enabled)
})

ipcMain.handle('settings:getLatencyIntervalMs', () => {
  return settingsStore.getLatencyIntervalMs()
})

ipcMain.handle('settings:setLatencyIntervalMs', async (_event, intervalMs: number) => {
  if (typeof intervalMs !== 'number' || intervalMs < 1000 || intervalMs > 60000) {
    throw new Error('Invalid interval')
  }
  await settingsStore.setLatencyIntervalMs(intervalMs)
})

// Latency monitors
const latencyTimers = new Map<string, ReturnType<typeof setInterval>>()

ipcMain.handle('ssh:startLatencyMonitor', (_event, sessionId: string) => {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid session id')
  }
  if (latencyTimers.has(sessionId)) return

  const interval = settingsStore.getLatencyIntervalMs()

  const measure = async () => {
    if (!sshManager.hasSession(sessionId)) {
      clearInterval(latencyTimers.get(sessionId))
      latencyTimers.delete(sessionId)
      return
    }
    try {
      const latency = await sshManager.measureLatency(sessionId)
      mainWindow?.webContents.send(`ssh:latency:${sessionId}`, latency)
    } catch {
      mainWindow?.webContents.send(`ssh:latency:${sessionId}`, -1)
    }
  }

  const timer = setInterval(measure, interval)
  latencyTimers.set(sessionId, timer)

  measure()
})

ipcMain.handle('ssh:stopLatencyMonitor', (_event, sessionId: string) => {
  if (!sessionId || typeof sessionId !== 'string') return
  const timer = latencyTimers.get(sessionId)
  if (timer) {
    clearInterval(timer)
    latencyTimers.delete(sessionId)
  }
})

// Monitor settings
ipcMain.handle('settings:getMonitorEnabled', () => {
  return settingsStore.getMonitorEnabled()
})

ipcMain.handle('settings:setMonitorEnabled', async (_event, enabled: boolean) => {
  if (typeof enabled !== 'boolean') {
    throw new Error('Invalid value')
  }
  await settingsStore.setMonitorEnabled(enabled)
})

ipcMain.handle('settings:getMonitorIntervalMs', () => {
  return settingsStore.getMonitorIntervalMs()
})

ipcMain.handle('settings:setMonitorIntervalMs', async (_event, intervalMs: number) => {
  if (typeof intervalMs !== 'number' || intervalMs < 2000 || intervalMs > 30000) {
    throw new Error('Invalid interval')
  }
  await settingsStore.setMonitorIntervalMs(intervalMs)
})

// Monitor start/stop
ipcMain.handle('monitor:start', (_event, sessionId: string) => {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid session id')
  }
  const interval = settingsStore.getMonitorIntervalMs()
  monitorCollector.start(sessionId, interval)
})

ipcMain.handle('monitor:stop', (_event, sessionId: string) => {
  if (!sessionId || typeof sessionId !== 'string') return
  monitorCollector.stop(sessionId)
})

// Auto-updater IPC
ipcMain.handle('updater:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates()
    return { ok: true, info: result?.updateInfo }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('updater:download', async () => {
  try {
    await autoUpdater.downloadUpdate()
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall()
})

ipcMain.handle('updater:skipVersion', async (_event, version: string) => {
  if (!version || typeof version !== 'string') throw new Error('Invalid version')
  await settingsStore.setSkippedUpdateVersion(version)
})

ipcMain.handle('settings:getAutoUpdateEnabled', async () => {
  return settingsStore.getAutoUpdateEnabled()
})

ipcMain.handle('settings:setAutoUpdateEnabled', async (_event, enabled: boolean) => {
  await settingsStore.setAutoUpdateEnabled(enabled)
})
