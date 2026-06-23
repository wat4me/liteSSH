import type { BrowserWindow, WebContents } from 'electron'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function safeSend(win: BrowserWindow | null, channel: string, ...args: any[]): void {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  win.webContents.send(channel, ...args)
}

export function safeWebContentsSend(wc: WebContents, channel: string, ...args: any[]): void {
  if (wc.isDestroyed()) return
  wc.send(channel, ...args)
}

export function isValidUUID(id: string): boolean {
  return typeof id === 'string' && UUID_RE.test(id)
}

export function isValidPort(port: number): boolean {
  return typeof port === 'number' && port > 0 && port <= 65535 && Number.isInteger(port)
}

export function isValidHost(host: string): boolean {
  if (typeof host !== 'string' || host.length === 0 || host.length > 255) return false
  return /^[a-zA-Z0-9.\-:]+$/.test(host)
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

export function isValidX11Display(display: number): boolean {
  return typeof display === 'number' && Number.isInteger(display) && display >= 0 && display <= 99 && isValidPort(6000 + display)
}

export function isValidUsername(username: string): boolean {
  return typeof username === 'string' && username.length > 0 && username.length <= 64
}

export function isValidPath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0) return false
  if (p.includes('\0')) return false
  return true
}

export function isStrictPath(p: string): boolean {
  if (!isValidPath(p)) return false
  if (/\.\.[\\/]/.test(p) || /[\\/]\.\./.test(p)) return false
  return true
}

export function validateConnectionParams(params: any): { valid: boolean; error?: string } {
  if (!params || typeof params !== 'object') return { valid: false, error: 'Invalid params object' }
  if (!isValidHost(params.host)) return { valid: false, error: 'Invalid host' }
  if (!isValidPort(params.port)) return { valid: false, error: 'Invalid port' }
  if (!isValidUsername(params.username)) return { valid: false, error: 'Invalid username' }
  if (typeof params.password !== 'string') return { valid: false, error: 'Invalid password' }
  if (params.privateKey !== undefined && typeof params.privateKey !== 'string') return { valid: false, error: 'Invalid private key' }
  return { valid: true }
}

export type AuthConnectionParams = {
  host: string
  port: number
  username: string
  password: string
  privateKey?: string
}

export function buildSshConnectConfig(params: AuthConnectionParams, readyTimeout: number): import('ssh2').ConnectConfig {
  return {
    host: params.host,
    port: params.port,
    username: params.username,
    ...(params.privateKey
      ? {
          privateKey: Buffer.from(params.privateKey),
          ...(params.password ? { passphrase: params.password } : {}),
        }
      : { password: params.password }),
    readyTimeout,
  }
}