import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { Client } from 'ssh2'
import { CredentialStore } from './store/credentialStore'
import { SSHManager } from './ssh/manager'

let mainWindow: BrowserWindow | null = null
const credentialStore = new CredentialStore()
const sshManager = new SSHManager()

const sshDataBuffers: Map<string, string[]> = new Map()
let sshDataFlushScheduled = false

function scheduleSshDataFlush() {
  if (sshDataFlushScheduled) return
  sshDataFlushScheduled = true
  process.nextTick(() => {
    sshDataFlushScheduled = false
    for (const [sid, chunks] of sshDataBuffers) {
      if (chunks.length > 0) {
        mainWindow?.webContents.send('ssh:data', sid, chunks.length === 1 ? chunks[0] : chunks.join(''))
        chunks.length = 0
      }
    }
  })
}

function bufferSshData(sessionId: string, data: string) {
  let buf = sshDataBuffers.get(sessionId)
  if (!buf) {
    buf = []
    sshDataBuffers.set(sessionId, buf)
  }
  buf.push(data)
  scheduleSshDataFlush()
}

function removeSshDataBuffer(sessionId: string) {
  sshDataBuffers.delete(sessionId)
}

const titleBarThemes: Record<string, { color: string; symbolColor: string }> = {
  dark: { color: '#0d1117', symbolColor: '#8b949e' },
  light: { color: '#ffffff', symbolColor: '#656d76' },
  eyecare: { color: '#f5f0e8', symbolColor: '#8a7f70' },
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
    icon: join(__dirname, '../build/icon.png'),
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

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  sshManager.disconnectAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  sshManager.disconnectAll()
})

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

ipcMain.handle('store:getConnections', () => {
  return credentialStore.getConnections()
})

ipcMain.handle('store:saveConnection', (_event, connection: any) => {
  return credentialStore.saveConnection(connection)
})

ipcMain.handle('store:deleteConnection', (_event, id: string) => {
  return credentialStore.deleteConnection(id)
})

ipcMain.handle('store:getGroups', () => {
  return credentialStore.getGroups()
})

ipcMain.handle('store:saveGroup', (_event, group: any) => {
  return credentialStore.saveGroup(group)
})

ipcMain.handle('store:deleteGroup', (_event, id: string) => {
  return credentialStore.deleteGroup(id)
})

ipcMain.handle('store:reorderGroups', (_event, ids: string[]) => {
  credentialStore.reorderGroups(ids)
})

ipcMain.handle('store:setDefaultGroup', (_event, id: string) => {
  credentialStore.setDefaultGroup(id)
})

ipcMain.handle('ssh:testConnection', async (_event, connectionId: string) => {
  const connection = credentialStore.getConnection(connectionId)
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

ipcMain.handle('ssh:connect', async (_event, connectionId: string) => {
  const connection = credentialStore.getConnection(connectionId)
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`)
  }

  const sessionId = await sshManager.connect(connection, {
    onData: (sid, data) => {
      bufferSshData(sid, data)
    },
    onClose: (sid) => {
      removeSshDataBuffer(sid)
      mainWindow?.webContents.send('ssh:closed', sid)
    },
    onError: (sid, err) => {
      mainWindow?.webContents.send('ssh:error', sid, err)
    },
  })

  return sessionId
})

ipcMain.handle('ssh:disconnect', (_event, sessionId: string) => {
  sshManager.disconnect(sessionId)
})

ipcMain.on('ssh:write', (_event, sessionId: string, data: string) => {
  sshManager.write(sessionId, data)
})

ipcMain.on('ssh:resize', (_event, sessionId: string, cols: number, rows: number) => {
  sshManager.resize(sessionId, cols, rows)
})
