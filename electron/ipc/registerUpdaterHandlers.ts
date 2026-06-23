import { ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { SettingsStore } from '../store/settingsStore'
import { safeSend } from '../utils/validation'

type MainWindowGetter = () => BrowserWindow | null

export function registerUpdaterHandlers(getMainWindow: MainWindowGetter, settingsStore: SettingsStore): void {
  autoUpdater.logger = console
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    safeSend(getMainWindow(), 'updater:status', { status: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    const skippedVersion = settingsStore.getSkippedUpdateVersion()
    if (info.version === skippedVersion) return
    safeSend(getMainWindow(), 'updater:status', { status: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', (info) => {
    safeSend(getMainWindow(), 'updater:status', { status: 'not-available', version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => {
    safeSend(getMainWindow(), 'updater:status', { status: 'downloading', progress: progress.percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    safeSend(getMainWindow(), 'updater:status', { status: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    safeSend(getMainWindow(), 'updater:status', { status: 'error', message: err.message })
  })

  void settingsStore.init().then(() => {
    if (!settingsStore.getAutoUpdateEnabled()) return
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {})
    }, 5000)
  }).catch((err) => {
    console.error('[Updater Init]', err)
  })

  ipcMain.handle('updater:check', async () => {
    try {
      await settingsStore.init()
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, info: result?.updateInfo }
    } catch (err: any) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      await settingsStore.init()
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
    await settingsStore.init()
    await settingsStore.setSkippedUpdateVersion(version)
  })
}
