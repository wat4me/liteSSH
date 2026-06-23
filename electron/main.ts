import { app, BrowserWindow } from 'electron'
import { CredentialStore } from './store/credentialStore'
import { SettingsStore } from './store/settingsStore'
import { SSHManager } from './ssh/manager'
import { MonitorCollector } from './ssh/monitor'
import { KnownHostsStore } from './ssh/knownHosts'
import { createWindow } from './window/createWindow'
import { registerStoreHandlers } from './ipc/registerStoreHandlers'
import { registerSshHandlers, clearLatencyTimers } from './ipc/registerSshHandlers'
import { registerAiHandlers } from './ipc/registerAiHandlers'
import { registerUpdaterHandlers } from './ipc/registerUpdaterHandlers'
import { safeSend } from './utils/validation'

let mainWindow: BrowserWindow | null = null
const getMainWindow = () => mainWindow
const knownHosts = new KnownHostsStore()
const credentialStore = new CredentialStore()
const settingsStore = new SettingsStore()
const sshManager = new SSHManager(knownHosts)
const monitorCollector = new MonitorCollector(sshManager, (sessionId: string, data: any) => {
  safeSend(mainWindow, `monitor:data:${sessionId}`, data)
})

app.whenReady().then(() => {
  registerStoreHandlers(getMainWindow, credentialStore, settingsStore)
  registerSshHandlers(getMainWindow, sshManager, settingsStore, monitorCollector, credentialStore, knownHosts)
  registerAiHandlers(settingsStore)
  registerUpdaterHandlers(getMainWindow, settingsStore)

  void Promise.all([
    knownHosts.init(),
    credentialStore.init(),
    settingsStore.init(),
  ]).catch((err) => {
    console.error('[Main Init]', err)
  })

  mainWindow = createWindow()
  mainWindow.on('closed', () => { mainWindow = null })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  clearLatencyTimers()
  monitorCollector.stopAll()
  sshManager.forceDisconnectAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('browser-window-blur', () => {
  credentialStore.clearDecryptedCache()
})

app.on('before-quit', () => {
  clearLatencyTimers()
  monitorCollector.stopAll()
  sshManager.forceDisconnectAll()
})

process.on('unhandledRejection', (reason) => {
  console.error('[Main Unhandled Promise]', reason)
})
