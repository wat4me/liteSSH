import { ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { SettingsStore } from '../store/settingsStore'
import { safeSend } from '../utils/validation'

export function registerUpdaterHandlers(mainWindow: BrowserWindow | null, settingsStore: SettingsStore): void {
  autoUpdater.logger = console
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    safeSend(mainWindow, 'updater:status', { status: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    const skippedVersion = settingsStore.getSkippedUpdateVersion()
    if (info.version === skippedVersion) return
    safeSend(mainWindow, 'updater:status', { status: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', (info) => {
    safeSend(mainWindow, 'updater:status', { status: 'not-available', version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => {
    safeSend(mainWindow, 'updater:status', { status: 'downloading', progress: progress.percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    safeSend(mainWindow, 'updater:status', { status: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    safeSend(mainWindow, 'updater:status', { status: 'error', message: err.message })
  })

  if (settingsStore.getAutoUpdateEnabled()) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 5000)
  }

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
}