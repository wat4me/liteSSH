import { app, BrowserWindow, ipcMain, Menu, dialog, shell, clipboard } from 'electron'
import { join } from 'path'
import { Client } from 'ssh2'
import { existsSync } from 'fs'
import { Socket } from 'net'
import { CredentialStore } from './store/credentialStore'
import { SettingsStore } from './store/settingsStore'
import { SSHManager } from './ssh/manager'

let mainWindow: BrowserWindow | null = null
const credentialStore = new CredentialStore()
const settingsStore = new SettingsStore()
const sshManager = new SSHManager()
const SSH_DIAG_TIMEOUT_MS = 10000

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

// Settings
ipcMain.handle('settings:getDownloadPath', () => {
  return settingsStore.getDownloadPath()
})

ipcMain.handle('settings:setDownloadPath', (_event, dirPath: string) => {
  settingsStore.setDownloadPath(dirPath)
})

ipcMain.handle('settings:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

// SSH
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

ipcMain.handle('ssh:testConnectionParams', async (_event, params: { host: string; port: number; username: string; password: string }) => {
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
  return await diagnoseSshConnection(params)
})

ipcMain.handle('ssh:connect', async (_event, connectionId: string) => {
  const connection = credentialStore.getConnection(connectionId)
  if (!connection) {
    throw new Error(`Connection ${connectionId} not found`)
  }

  const sessionId = await sshManager.connect(connection, {
    onData: (sid, data) => {
      mainWindow?.webContents.send('ssh:data', sid, data)
    },
    onClose: (sid) => {
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

// SFTP operations
ipcMain.handle('sftp:init', async (_event, sessionId: string) => {
  await sshManager.initSftp(sessionId)
})

ipcMain.handle('sftp:readdir', async (_event, sessionId: string, remotePath: string) => {
  return await sshManager.sftpReaddir(sessionId, remotePath)
})

ipcMain.handle('sftp:stat', async (_event, sessionId: string, remotePath: string) => {
  return await sshManager.sftpStat(sessionId, remotePath)
})

ipcMain.handle('sftp:realpath', async (_event, sessionId: string, remotePath: string) => {
  return await sshManager.sftpRealpath(sessionId, remotePath)
})

ipcMain.handle('sftp:execPwd', async (_event, sessionId: string) => {
  return await sshManager.sftpExec(sessionId, 'pwd')
})

ipcMain.handle('sftp:execHome', async (_event, sessionId: string) => {
  return await sshManager.sftpExec(sessionId, 'printf "%s" "$HOME"')
})

ipcMain.on('sftp:download', (_event, sessionId: string, remotePath: string, fileName: string, transferId: string) => {
  const downloadDir = settingsStore.getDownloadPath()
  const localPath = getUniqueLocalPath(downloadDir, fileName)

  mainWindow?.webContents.send('sftp:transferStart', transferId, fileName, localPath)

  sshManager
    .sftpDownload(sessionId, remotePath, localPath, transferId, (transferred, total) => {
      mainWindow?.webContents.send('sftp:transferProgress', transferId, transferred, total)
    })
    .then(() => {
      mainWindow?.webContents.send('sftp:transferComplete', transferId, localPath)
    })
    .catch((err) => {
      mainWindow?.webContents.send('sftp:transferError', transferId, err.message)
    })
})

ipcMain.on('sftp:cancelTransfer', (_event, transferId: string) => {
  sshManager.cancelTransfer(transferId)
})

ipcMain.handle('shell:openPath', async (_event, filePath: string) => {
  return await shell.openPath(filePath)
})

ipcMain.handle('shell:showItemInFolder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('clipboard:readText', () => {
  return clipboard.readText()
})

ipcMain.handle('clipboard:writeText', (_event, text: string) => {
  clipboard.writeText(text)
})
