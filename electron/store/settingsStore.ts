import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'

export class SettingsStore {
  private settingsPath: string
  private settings: Record<string, any> = {}
  private readonly recentConnectionsLimit = 5
  private initialized = false

  constructor() {
    const userData = app.getPath('userData')
    this.settingsPath = join(userData, 'settings.json')
  }

  async init(): Promise<void> {
    if (this.initialized) return
    await this.load()
    this.initialized = true
  }

  private async load(): Promise<void> {
    try {
      if (existsSync(this.settingsPath)) {
        const data = await readFile(this.settingsPath, 'utf-8')
        this.settings = JSON.parse(data)
      }
    } catch {
      this.settings = {}
    }
  }

  private async save(): Promise<void> {
    try {
      const dir = dirname(this.settingsPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      await writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }

  getDownloadPath(): string {
    return this.settings.downloadPath || app.getPath('downloads')
  }

  async setDownloadPath(dirPath: string): Promise<void> {
    this.settings.downloadPath = dirPath
    await this.save()
  }

  getRecentConnectionIds(): string[] {
    const ids = this.settings.recentConnectionIds
    if (!Array.isArray(ids)) return []
    return ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  }

  async recordRecentConnection(connectionId: string): Promise<void> {
    const trimmedId = connectionId.trim()
    if (!trimmedId) return

    const ids = this.getRecentConnectionIds().filter((id) => id !== trimmedId)
    ids.unshift(trimmedId)
    this.settings.recentConnectionIds = ids.slice(0, this.recentConnectionsLimit)
    await this.save()
  }

  async pruneRecentConnectionIds(validIds: string[]): Promise<void> {
    const validSet = new Set(validIds)
    const filtered = this.getRecentConnectionIds().filter((id) => validSet.has(id))
    this.settings.recentConnectionIds = filtered
    await this.save()
  }

  getTerminalFontSize(): number {
    return this.settings.terminalFontSize || 14
  }

  async setTerminalFontSize(size: number): Promise<void> {
    this.settings.terminalFontSize = Math.max(10, Math.min(24, size))
    await this.save()
  }

  getRecentDownloadPaths(): string[] {
    const paths = this.settings.recentDownloadPaths
    if (!Array.isArray(paths)) return []
    return paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
  }

  async addRecentDownloadPath(dirPath: string): Promise<void> {
    const paths = this.getRecentDownloadPaths().filter((p) => p !== dirPath)
    paths.unshift(dirPath)
    this.settings.recentDownloadPaths = paths.slice(0, 5)
    await this.save()
  }

  getLatencyEnabled(): boolean {
    return this.settings.latencyEnabled !== false
  }

  async setLatencyEnabled(enabled: boolean): Promise<void> {
    this.settings.latencyEnabled = enabled
    await this.save()
  }

  getLatencyIntervalMs(): number {
    const val = this.settings.latencyIntervalMs
    if (typeof val !== 'number' || val < 1000) return 10000
    if (val > 60000) return 60000
    return val
  }

  async setLatencyIntervalMs(intervalMs: number): Promise<void> {
    this.settings.latencyIntervalMs = Math.max(1000, Math.min(60000, Math.round(intervalMs)))
    await this.save()
  }

  getMonitorEnabled(): boolean {
    return this.settings.monitorEnabled !== false
  }

  async setMonitorEnabled(enabled: boolean): Promise<void> {
    this.settings.monitorEnabled = enabled
    await this.save()
  }

  getMonitorIntervalMs(): number {
    const val = this.settings.monitorIntervalMs
    if (typeof val !== 'number' || val < 2000) return 5000
    if (val > 30000) return 30000
    return val
  }

  async setMonitorIntervalMs(intervalMs: number): Promise<void> {
    this.settings.monitorIntervalMs = Math.max(2000, Math.min(30000, Math.round(intervalMs)))
    await this.save()
  }
}
