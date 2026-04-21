import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

export class SettingsStore {
  private settingsPath: string
  private settings: Record<string, any> = {}

  constructor() {
    const userData = app.getPath('userData')
    this.settingsPath = join(userData, 'settings.json')
    this.load()
  }

  private load() {
    try {
      if (existsSync(this.settingsPath)) {
        const data = readFileSync(this.settingsPath, 'utf-8')
        this.settings = JSON.parse(data)
      }
    } catch {
      this.settings = {}
    }
  }

  private save() {
    try {
      const dir = dirname(this.settingsPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }

  get(key: string, defaultValue?: any): any {
    return this.settings[key] ?? defaultValue
  }

  set(key: string, value: any) {
    this.settings[key] = value
    this.save()
  }

  getDownloadPath(): string {
    return this.settings.downloadPath || app.getPath('downloads')
  }

  setDownloadPath(dirPath: string) {
    this.settings.downloadPath = dirPath
    this.save()
  }
}