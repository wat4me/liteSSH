import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'

const DEFAULT_AI_SYSTEM_PROMPT = [
  '你是 liteSSH 内置的 AI 助手，主要帮助用户理解和处理 SSH 终端、Linux 命令、报错排查、服务运维和文件操作问题。',
  '请默认使用简体中文回答；只有当用户明确要求其他语言，或需要保留原始命令、日志、错误信息、配置字段时，才使用对应语言。',
  '回答要简洁、可执行，优先给出下一步操作和判断依据。涉及命令时，用 Markdown 代码块展示，并说明命令作用。',
  '对 rm、chmod、chown、mkfs、dd、防火墙、重启服务、修改 SSH 配置等可能造成破坏或断连的操作，必须先提醒风险，并给出更安全的验证步骤。',
  '如果用户提供的是终端选中文本、日志或报错，请先概括关键信息，再给出排查步骤。',
].join('\n')
const LEGACY_AI_SYSTEM_PROMPT = 'You are a concise SSH assistant. Help explain commands, errors, Linux operations, and troubleshooting steps.'

export class SettingsStore {
  private settingsPath: string
  private settings: Record<string, any> = {}
  private readonly recentConnectionsLimit = 5
  private initialized = false
  private initPromise: Promise<void> | null = null

  constructor() {
    const userData = app.getPath('userData')
    this.settingsPath = join(userData, 'settings.json')
  }

  async init(): Promise<void> {
    if (this.initialized) return
    if (!this.initPromise) {
      this.initPromise = this.load().then(() => {
        this.initialized = true
      })
    }
    await this.initPromise
  }

  private async load(): Promise<void> {
    try {
      const data = await readFile(this.settingsPath, 'utf-8')
      this.settings = JSON.parse(data)
    } catch {
      this.settings = {}
    }

    if (this.needsApiKeyMigration()) {
      await this.migrateApiKey()
    }
  }

  private needsApiKeyMigration(): boolean {
    const ai = this.settings.ai
    if (!ai || typeof ai !== 'object') return false
    return typeof ai.apiKey === 'string' && ai.apiKey && !ai.apiKeyEncrypted
  }

  private async migrateApiKey(): Promise<void> {
    const ai = this.settings.ai
    if (!ai || typeof ai !== 'object') return
    if (typeof ai.apiKey === 'string' && ai.apiKey && !ai.apiKeyEncrypted) {
      ai.apiKey = this.encrypt(ai.apiKey)
      ai.apiKeyEncrypted = true
      await this.save()
    }
  }

  private async save(): Promise<void> {
    try {
      await mkdir(dirname(this.settingsPath), { recursive: true })
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

  getCredentialAutoFillEnabled(): boolean {
    return this.settings.credentialAutoFillEnabled === true
  }

  async setCredentialAutoFillEnabled(enabled: boolean): Promise<void> {
    this.settings.credentialAutoFillEnabled = enabled
    await this.save()
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

  getAutoUpdateEnabled(): boolean {
    return this.settings.autoUpdateEnabled !== false
  }

  async setAutoUpdateEnabled(enabled: boolean): Promise<void> {
    this.settings.autoUpdateEnabled = enabled
    await this.save()
  }

  getSkippedUpdateVersion(): string {
    return this.settings.skippedUpdateVersion || ''
  }

  async setSkippedUpdateVersion(version: string): Promise<void> {
    this.settings.skippedUpdateVersion = version
    await this.save()
  }

  private encrypt(value: string): string {
    if (!value) return value
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(value).toString('base64')
    }
    return value
  }

  private decrypt(value: string): string {
    if (!value) return value
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(value, 'base64'))
      } catch {
        console.warn('Failed to decrypt value, returning empty string')
        return ''
      }
    }
    return value
  }

  getAiSettings(): {
    baseUrl: string
    model: string
    apiKey: string
    systemPrompt: string
    temperature: number
  } {
    const ai = this.settings.ai || {}
    const rawApiKey = typeof ai.apiKey === 'string' ? ai.apiKey : ''
    const apiKey = ai.apiKeyEncrypted ? this.decrypt(rawApiKey) : rawApiKey
    return {
      baseUrl: typeof ai.baseUrl === 'string' && ai.baseUrl.trim() ? ai.baseUrl : 'https://api.openai.com/v1',
      model: typeof ai.model === 'string' && ai.model.trim() ? ai.model : 'gpt-4o-mini',
      apiKey,
      systemPrompt: typeof ai.systemPrompt === 'string' && ai.systemPrompt !== LEGACY_AI_SYSTEM_PROMPT
        ? ai.systemPrompt
        : DEFAULT_AI_SYSTEM_PROMPT,
      temperature: typeof ai.temperature === 'number' ? Math.max(0, Math.min(2, ai.temperature)) : 0.2,
    }
  }

  async setAiSettings(settings: {
    baseUrl: string
    model: string
    apiKey: string
    systemPrompt: string
    temperature: number
  }): Promise<void> {
    this.settings.ai = {
      baseUrl: settings.baseUrl.trim(),
      model: settings.model.trim(),
      apiKey: this.encrypt(settings.apiKey),
      apiKeyEncrypted: safeStorage.isEncryptionAvailable() && !!settings.apiKey,
      systemPrompt: settings.systemPrompt,
      temperature: Math.max(0, Math.min(2, settings.temperature)),
    }
    await this.save()
  }
}
