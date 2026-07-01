import { ipcMain, BrowserWindow } from 'electron'
import { Client } from 'ssh2'
import { existsSync } from 'fs'
import { join } from 'path'
import { isValidUUID, isValidPath, isStrictPath, AuthConnectionParams, validateConnectionParams, buildSshConnectConfig, safeSend } from '../utils/validation'
import { diagnoseSshConnection } from '../ssh/diagnosis'
import { KnownHostsStore } from '../ssh/knownHosts'
import { SSHManager } from '../ssh/manager'
import { MonitorCollector } from '../ssh/monitor'
import { SettingsStore } from '../store/settingsStore'
import { CredentialStore } from '../store/credentialStore'

const dataBatches: Map<string, string> = new Map()
let dataBatchScheduled = false

type MainWindowGetter = () => BrowserWindow | null

function scheduleDataBatch(getMainWindow: MainWindowGetter) {
  if (dataBatchScheduled) return
  dataBatchScheduled = true
  setImmediate(() => {
    dataBatchScheduled = false
    for (const [sessionId, batch] of dataBatches) {
      dataBatches.delete(sessionId)
      safeSend(getMainWindow(), `ssh:data:${sessionId}`, batch)
    }
  })
}

function emitSshData(getMainWindow: MainWindowGetter, sessionId: string, data: string) {
  const existing = dataBatches.get(sessionId)
  if (existing) {
    dataBatches.set(sessionId, existing + data)
  } else {
    dataBatches.set(sessionId, data)
  }
  scheduleDataBatch(getMainWindow)
}

const latencyTimers = new Map<string, ReturnType<typeof setInterval>>()

export function clearLatencyTimers(): void {
  for (const [, timer] of latencyTimers) clearInterval(timer)
  latencyTimers.clear()
}

const sshConnectCooldowns = new Map<string, number>()
const SSH_CONNECT_COOLDOWN_MS = 3000

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

export function registerSshHandlers(
  getMainWindow: MainWindowGetter,
  sshManager: SSHManager,
  settingsStore: SettingsStore,
  monitorCollector: MonitorCollector,
  credentialStore: CredentialStore,
  knownHosts: KnownHostsStore
): void {
  const ensureCredentialStoreReady = () => credentialStore.init()
  const ensureSettingsStoreReady = () => settingsStore.init()
  const ensureKnownHostsReady = () => knownHosts.init()

  // Host key management
  ipcMain.handle('ssh:removeHostKey', async (_event, host: string, port: number) => {
    if (typeof host !== 'string' || !host.trim()) {
      throw new Error('Invalid host')
    }
    if (typeof port !== 'number' || port <= 0 || port > 65535 || !Number.isInteger(port)) {
      throw new Error('Invalid port')
    }
    await ensureKnownHostsReady()
    await knownHosts.remove(host, port)
  })

  ipcMain.handle('ssh:getHostKeyFingerprint', async (_event, host: string, port: number) => {
    if (typeof host !== 'string' || !host.trim()) {
      throw new Error('Invalid host')
    }
    if (typeof port !== 'number' || port <= 0 || port > 65535 || !Number.isInteger(port)) {
      throw new Error('Invalid port')
    }
    await ensureKnownHostsReady()
    return knownHosts.getFingerprint(host, port) || null
  })

  // SSH test and connection
  ipcMain.handle('ssh:testConnection', async (_event, connectionId: string) => {
    await ensureCredentialStoreReady()
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
      client.connect(buildSshConnectConfig(connection, 10000))
    })
  })

  ipcMain.handle('ssh:testConnectionParams', async (_event, params: AuthConnectionParams) => {
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
      client.connect(buildSshConnectConfig(params, 10000))
    })
  })

  ipcMain.handle('ssh:diagnoseConnectionParams', async (_event, params: AuthConnectionParams) => {
    const validation = validateConnectionParams(params)
    if (!validation.valid) {
      throw new Error(validation.error)
    }
    return await diagnoseSshConnection(params)
  })

  ipcMain.handle('ssh:connect', async (_event, connectionId: string) => {
    await Promise.all([ensureCredentialStoreReady(), ensureKnownHostsReady()])
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
        emitSshData(getMainWindow, sid, data)
      },
      onClose: (sid) => {
        safeSend(getMainWindow(), `ssh:closed:${sid}`)
      },
      onError: (sid, err) => {
        safeSend(getMainWindow(), `ssh:error:${sid}`, err)
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

  // Latency monitors
  ipcMain.handle('ssh:startLatencyMonitor', async (_event, sessionId: string) => {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session id')
    }
    if (latencyTimers.has(sessionId)) return

    await ensureSettingsStoreReady()
    const interval = settingsStore.getLatencyIntervalMs()

    const measure = async () => {
      if (!sshManager.hasSession(sessionId)) {
        clearInterval(latencyTimers.get(sessionId))
        latencyTimers.delete(sessionId)
        return
      }
      try {
        const latency = await sshManager.measureLatency(sessionId)
        safeSend(getMainWindow(), `ssh:latency:${sessionId}`, latency)
      } catch {
        safeSend(getMainWindow(), `ssh:latency:${sessionId}`, -1)
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

  ipcMain.handle('ssh:measureLatency', async (_event, sessionId: string) => {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session id')
    }
    return await sshManager.measureLatency(sessionId)
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

  ipcMain.handle('sftp:execHome', async (_event, sessionId: string) => {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session id')
    }
    return await sshManager.sftpExec(sessionId, 'printf "%s" "$HOME"')
  })

  ipcMain.on('sftp:download', async (_event, sessionId: string, remotePath: string, fileName: string, transferId: string) => {
    if (!sessionId || typeof sessionId !== 'string') return
    if (!isStrictPath(remotePath)) return
    if (!fileName || typeof fileName !== 'string') return
    if (!transferId || typeof transferId !== 'string') return
    await ensureSettingsStoreReady()
    const downloadDir = settingsStore.getDownloadPath()
    const localPath = getUniqueLocalPath(downloadDir, fileName)

    safeSend(getMainWindow(), 'sftp:transferStart', sessionId, transferId, fileName, localPath, 'download')

    sshManager
      .sftpDownload(sessionId, remotePath, localPath, transferId, (transferred, total) => {
        safeSend(getMainWindow(), 'sftp:transferProgress', sessionId, transferId, transferred, total)
      })
      .then(() => {
        safeSend(getMainWindow(), 'sftp:transferComplete', sessionId, transferId, localPath)
      })
      .catch((err) => {
        safeSend(getMainWindow(), 'sftp:transferError', sessionId, transferId, err.message)
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
    safeSend(getMainWindow(), 'sftp:transferStart', sessionId, transferId, fileName, localPath, 'upload')

    sshManager
      .sftpUpload(sessionId, localPath, fullRemotePath, transferId, (transferred, total) => {
        safeSend(getMainWindow(), 'sftp:transferProgress', sessionId, transferId, transferred, total)
      })
      .then(() => {
        safeSend(getMainWindow(), 'sftp:transferComplete', sessionId, transferId, localPath)
      })
      .catch((err) => {
        safeSend(getMainWindow(), 'sftp:transferError', sessionId, transferId, err.message)
      })
  })

  // Monitor start/stop
  ipcMain.handle('monitor:start', async (_event, sessionId: string) => {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session id')
    }
    await ensureSettingsStoreReady()
    const interval = settingsStore.getMonitorIntervalMs()
    monitorCollector.start(sessionId, interval)
  })

  ipcMain.handle('monitor:stop', (_event, sessionId: string) => {
    if (!sessionId || typeof sessionId !== 'string') return
    monitorCollector.stop(sessionId)
  })

  ipcMain.handle('ssh:exec', async (_event, sessionId: string, command: string, timeoutMs?: number) => {
    if (!sessionId || typeof sessionId !== 'string') {
      throw new Error('Invalid session id')
    }
    if (typeof command !== 'string' || !command.trim()) {
      throw new Error('Invalid command')
    }
    const timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30000
    return await sshManager.sftpExec(sessionId, command, timeout)
  })

  ipcMain.handle('sftp:readFile', async (_event, sessionId: string, remotePath: string) => {
    if (!sessionId || typeof sessionId !== 'string') throw new Error('Invalid session id')
    if (!isStrictPath(remotePath)) throw new Error('Invalid path')
    return await sshManager.sftpReadFile(sessionId, remotePath)
  })

  ipcMain.handle('sftp:writeFile', async (_event, sessionId: string, remotePath: string, content: string) => {
    if (!sessionId || typeof sessionId !== 'string') throw new Error('Invalid session id')
    if (!isStrictPath(remotePath)) throw new Error('Invalid path')
    if (typeof content !== 'string') throw new Error('Invalid content')
    await sshManager.sftpWriteFile(sessionId, remotePath, content)
  })

  ipcMain.handle('sftp:chmod', async (_event, sessionId: string, remotePath: string, mode: string, recursive?: boolean) => {
    if (!sessionId || typeof sessionId !== 'string') throw new Error('Invalid session id')
    if (!isStrictPath(remotePath)) throw new Error('Invalid path')
    if (!/^[0-7]{3,4}$/.test(mode)) throw new Error('Invalid mode')
    await sshManager.sftpChmod(sessionId, remotePath, mode, !!recursive)
  })

  ipcMain.handle('sftp:chown', async (_event, sessionId: string, remotePath: string, owner: string, group?: string, recursive?: boolean) => {
    if (!sessionId || typeof sessionId !== 'string') throw new Error('Invalid session id')
    if (!isStrictPath(remotePath)) throw new Error('Invalid path')
    if (!owner || typeof owner !== 'string') throw new Error('Invalid owner')
    if (group !== undefined && (typeof group !== 'string' || !group)) throw new Error('Invalid group')
    await sshManager.sftpChown(sessionId, remotePath, owner, group, !!recursive)
  })

  ipcMain.handle('sftp:rename', async (_event, sessionId: string, oldPath: string, newPath: string) => {
    if (!sessionId || typeof sessionId !== 'string') throw new Error('Invalid session id')
    if (!isStrictPath(oldPath)) throw new Error('Invalid old path')
    if (!isStrictPath(newPath)) throw new Error('Invalid new path')
    await sshManager.sftpRename(sessionId, oldPath, newPath)
  })

  ipcMain.handle('sftp:stat', async (_event, sessionId: string, remotePath: string) => {
    if (!sessionId || typeof sessionId !== 'string') throw new Error('Invalid session id')
    if (!isStrictPath(remotePath)) throw new Error('Invalid path')
    const stat = await sshManager.sftpStat(sessionId, remotePath)
    let ownerName = String(stat.uid)
    let groupName = String(stat.gid)
    try {
      const idResult = await sshManager.sftpExec(sessionId, `stat -c '%U:%G' "${remotePath}"`)
      const parts = idResult.trim().split(':')
      if (parts.length === 2) {
        ownerName = parts[0]
        groupName = parts[1]
      }
    } catch {}
    return { ...stat, owner: ownerName, group: groupName }
  })
}
