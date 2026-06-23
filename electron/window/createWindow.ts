import { BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'

const titleBarThemes: Record<string, { color: string; symbolColor: string }> = {
  dark: { color: '#0d1117', symbolColor: '#8b949e' },
  light: { color: '#ffffff', symbolColor: '#656d76' },
  eyecare: { color: '#f5f0e8', symbolColor: '#8a7f70' },
}

export { titleBarThemes }

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isAppNavigation(url: string): boolean {
  if (process.env.VITE_DEV_SERVER_URL) {
    try {
      return new URL(url).origin === new URL(process.env.VITE_DEV_SERVER_URL).origin
    } catch {
      return false
    }
  }
  return url.startsWith('file://')
}

export function createWindow(): BrowserWindow {
  Menu.setApplicationMenu(null)

  const mainWindow = new BrowserWindow({
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
    if (process.env.LITESSH_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppNavigation(url)) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => {
    // Handled in main.ts
  })

  return mainWindow
}
