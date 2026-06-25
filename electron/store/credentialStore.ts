import { app, safeStorage } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { v4 as uuidv4 } from 'uuid'

export interface Connection {
  id: string
  name: string
  host: string
  port: number
  username: string
  password: string
  encrypted?: boolean
  privateKey?: string
  privateKeyEncrypted?: boolean
  group?: string
  keepaliveInterval?: number
  x11Forwarding?: boolean
  x11Host?: string
  x11Display?: number
  createdAt: number
  updatedAt: number
}

export interface Group {
  id: string
  name: string
  order: number
  isDefault: boolean
}

export interface SavedCredential {
  id: string
  name: string
  username: string
  password: string
  encrypted?: boolean
  createdAt: number
  updatedAt: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class CredentialStore {
  private connectionsPath: string
  private groupsPath: string
  private savedCredentialsPath: string
  private connections: Connection[] = []
  private groups: Group[] = []
  private savedCredentials: SavedCredential[] = []
  private initialized = false
  private initPromise: Promise<void> | null = null
  private decryptedCache: Map<string, { value: string; ts: number }> = new Map()
  private readonly CACHE_TTL_MS = 5 * 60 * 1000

  constructor() {
    const userData = app.getPath('userData')
    this.connectionsPath = join(userData, 'connections.json')
    this.groupsPath = join(userData, 'groups.json')
    this.savedCredentialsPath = join(userData, 'saved-credentials.json')
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

  private encrypt(value: string): string {
    if (!value) return value
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value)
      return encrypted.toString('base64')
    }
    return value
  }

  private decrypt(value: string, encrypted?: boolean): string {
    if (!value) return value
    if (encrypted && safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(value, 'base64')
        return safeStorage.decryptString(buffer)
      } catch {
        console.warn('Failed to decrypt value, returning empty string')
        return ''
      }
    }
    return value
  }

  private async load(): Promise<void> {
    try {
      const data = await readFile(this.connectionsPath, 'utf-8')
      this.connections = JSON.parse(data)
    } catch {
      this.connections = []
    }

    try {
      const data = await readFile(this.groupsPath, 'utf-8')
      this.groups = JSON.parse(data)
    } catch {
      this.groups = []
    }

    try {
      const data = await readFile(this.savedCredentialsPath, 'utf-8')
      this.savedCredentials = JSON.parse(data)
    } catch {
      this.savedCredentials = []
    }

    await this.migrateGroupField()
    if (this.needsPasswordMigration()) {
      await this.migratePasswords()
    }
    if (this.needsPrivateKeyMigration()) {
      await this.migratePrivateKeys()
    }
    if (this.needsSavedCredentialMigration()) {
      await this.migrateSavedCredentials()
    }
  }

  private needsSavedCredentialMigration(): boolean {
    return this.savedCredentials.some(c => c.password && !c.encrypted)
  }

  private async migrateSavedCredentials(): Promise<void> {
    let migrated = false
    for (const credential of this.savedCredentials) {
      if (!credential.encrypted && credential.password) {
        credential.password = this.encrypt(credential.password)
        credential.encrypted = true
        migrated = true
      }
    }
    if (migrated) {
      await this.saveSavedCredentials()
    }
  }

  private needsPasswordMigration(): boolean {
    return this.connections.some(c => c.password && !c.encrypted)
  }

  private async migratePasswords(): Promise<void> {
    let migrated = false
    for (const conn of this.connections) {
      if (!conn.encrypted && conn.password) {
        conn.password = this.encrypt(conn.password)
        conn.encrypted = true
        migrated = true
      }
    }
    if (migrated) {
      await this.saveConnections()
    }
  }

  private needsPrivateKeyMigration(): boolean {
    return this.connections.some(c => c.privateKey && !c.privateKeyEncrypted)
  }

  private async migratePrivateKeys(): Promise<void> {
    let migrated = false
    for (const conn of this.connections) {
      if (!conn.privateKeyEncrypted && conn.privateKey) {
        conn.privateKey = this.encrypt(conn.privateKey)
        conn.privateKeyEncrypted = true
        migrated = true
      }
    }
    if (migrated) {
      await this.saveConnections()
    }
  }

  private async migrateGroupField() {
    let migrated = false
    const nameToId: Record<string, string> = {}

    for (const g of this.groups) {
      nameToId[g.name] = g.id
    }

    for (const conn of this.connections) {
      if (conn.group && !UUID_RE.test(conn.group)) {
        let groupId = nameToId[conn.group]
        if (!groupId) {
          const newGroup: Group = {
            id: uuidv4(),
            name: conn.group,
            order: this.groups.length,
            isDefault: false,
          }
          this.groups.push(newGroup)
          nameToId[conn.group] = newGroup.id
          groupId = newGroup.id
        }
        conn.group = groupId
        migrated = true
      }
    }

    if (migrated) {
      await Promise.all([this.saveConnections(), this.saveGroups()])
    }
  }

  private async saveConnections(): Promise<void> {
    try {
      await mkdir(dirname(this.connectionsPath), { recursive: true })
      await writeFile(this.connectionsPath, JSON.stringify(this.connections, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save connections:', err)
    }
  }

  private async saveGroups(): Promise<void> {
    try {
      await mkdir(dirname(this.groupsPath), { recursive: true })
      await writeFile(this.groupsPath, JSON.stringify(this.groups, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save groups:', err)
    }
  }

  private async saveSavedCredentials(): Promise<void> {
    try {
      await mkdir(dirname(this.savedCredentialsPath), { recursive: true })
      await writeFile(this.savedCredentialsPath, JSON.stringify(this.savedCredentials, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save saved credentials:', err)
    }
  }

  private stripPassword(conn: Connection): Connection {
    return { ...conn, password: '' }
  }

  private stripSavedCredentialPassword(credential: SavedCredential): SavedCredential {
    return { ...credential, password: '' }
  }

  getConnections(): Connection[] {
    return this.connections.map(conn => this.stripPassword(conn))
  }

  getConnectionsForExport(): Connection[] {
    return this.connections.map(conn => ({
      ...conn,
      password: this.decryptCached(conn.id),
      privateKey: conn.privateKey ? this.decrypt(conn.privateKey, conn.privateKeyEncrypted) : undefined,
      encrypted: false,
      privateKeyEncrypted: false
    }))
  }

  getConnection(id: string): Connection | undefined {
    const conn = this.connections.find((c) => c.id === id)
    if (!conn) return undefined
    return this.stripPassword(conn)
  }

  getConnectionForAuth(id: string): Connection | undefined {
    const conn = this.connections.find((c) => c.id === id)
    if (!conn) return undefined
    return {
      ...conn,
      password: this.decryptCached(conn.id),
      privateKey: conn.privateKey ? this.decrypt(conn.privateKey, conn.privateKeyEncrypted) : undefined
    }
  }

  getConnectionPassword(id: string): string | undefined {
    const conn = this.connections.find((c) => c.id === id)
    if (!conn) return undefined
    return this.decryptCached(conn.id)
  }

  clearDecryptedCache(): void {
    this.decryptedCache.clear()
  }

  private decryptCached(connectionId: string): string {
    const conn = this.connections.find((c) => c.id === connectionId)
    if (!conn) return ''
    const entry = this.decryptedCache.get(connectionId)
    if (entry && Date.now() - entry.ts < this.CACHE_TTL_MS) {
      return entry.value
    }
    if (entry) {
      this.decryptedCache.delete(connectionId)
    }
    const decrypted = this.decrypt(conn.password, conn.encrypted)
    this.decryptedCache.set(connectionId, { value: decrypted, ts: Date.now() })
    return decrypted
  }

  async saveConnection(conn: Partial<Connection> & { name: string; host: string; username: string; password: string }): Promise<Connection> {
    const now = Date.now()
    let saved: Connection

    const encryptedConn = {
      ...conn,
      password: this.encrypt(conn.password),
      encrypted: true,
      ...(conn.privateKey !== undefined
        ? { privateKey: this.encrypt(conn.privateKey), privateKeyEncrypted: true }
        : {}),
    }

    if (conn.id) {
      const idx = this.connections.findIndex((c) => c.id === conn.id)
      if (idx === -1) {
        throw new Error('Connection not found')
      }
      this.connections[idx] = {
        ...this.connections[idx],
        ...encryptedConn,
        updatedAt: now,
      } as Connection
      saved = this.connections[idx]
    } else {
      saved = {
        ...encryptedConn,
        id: uuidv4(),
        port: conn.port || 22,
        createdAt: now,
        updatedAt: now,
      } as Connection
      this.connections.push(saved)
    }

    await this.saveConnections()
    this.decryptedCache.set(saved.id, { value: conn.password, ts: Date.now() })
    return {
      ...saved,
      password: conn.password
    }
  }

  async updateConnectionGroup(id: string, groupId: string | undefined): Promise<Connection> {
    const idx = this.connections.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Connection not found')
    this.connections[idx] = { ...this.connections[idx], group: groupId, updatedAt: Date.now() }
    await this.saveConnections()
    return this.connections[idx]
  }

  getSavedCredentials(): SavedCredential[] {
    return this.savedCredentials
      .map(credential => this.stripSavedCredentialPassword(credential))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  getSavedCredentialPassword(id: string): string | undefined {
    const credential = this.savedCredentials.find((c) => c.id === id)
    if (!credential) return undefined
    return this.decrypt(credential.password, credential.encrypted)
  }

  async saveSavedCredential(credential: Partial<SavedCredential> & { name: string; username: string; password: string }): Promise<SavedCredential> {
    const now = Date.now()
    const encryptedCredential = {
      ...credential,
      password: this.encrypt(credential.password),
      encrypted: true,
    }
    let saved: SavedCredential

    if (credential.id) {
      const idx = this.savedCredentials.findIndex((c) => c.id === credential.id)
      if (idx === -1) {
        throw new Error('Saved credential not found')
      }
      this.savedCredentials[idx] = {
        ...this.savedCredentials[idx],
        ...encryptedCredential,
        updatedAt: now,
      } as SavedCredential
      saved = this.savedCredentials[idx]
    } else {
      saved = {
        ...encryptedCredential,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      } as SavedCredential
      this.savedCredentials.push(saved)
    }

    await this.saveSavedCredentials()
    return {
      ...saved,
      password: ''
    }
  }

  async deleteSavedCredential(id: string): Promise<boolean> {
    const idx = this.savedCredentials.findIndex((c) => c.id === id)
    if (idx === -1) return false
    this.savedCredentials.splice(idx, 1)
    await this.saveSavedCredentials()
    return true
  }

  async deleteConnection(id: string): Promise<boolean> {
    const idx = this.connections.findIndex((c) => c.id === id)
    if (idx === -1) return false
    this.connections.splice(idx, 1)
    this.decryptedCache.delete(id)
    await this.saveConnections()
    return true
  }

  getGroups(): Group[] {
    return [...this.groups].sort((a, b) => a.order - b.order)
  }

  async saveGroup(group: Partial<Group> & { name: string }): Promise<Group> {
    let saved: Group

    if (group.id) {
      const idx = this.groups.findIndex((g) => g.id === group.id)
      if (idx === -1) {
        throw new Error('Group not found')
      }
      this.groups[idx] = {
        ...this.groups[idx],
        ...group,
      } as Group
      saved = this.groups[idx]
    } else {
      const maxOrder = this.groups.reduce((max, g) => Math.max(max, g.order), -1)
      saved = {
        id: uuidv4(),
        name: group.name,
        order: group.order ?? maxOrder + 1,
        isDefault: group.isDefault ?? false,
      }
      this.groups.push(saved)
    }

    await this.saveGroups()
    return saved
  }

  async deleteGroup(id: string): Promise<boolean> {
    const idx = this.groups.findIndex((g) => g.id === id)
    if (idx === -1) return false
    this.groups.splice(idx, 1)

    for (const conn of this.connections) {
      if (conn.group === id) {
        conn.group = undefined
      }
    }

    await this.saveGroups()
    await this.saveConnections()
    return true
  }

  async reorderGroups(orderedIds: string[]): Promise<void> {
    const idSet = new Set(this.groups.map((g) => g.id))
    let order = 0
    for (const id of orderedIds) {
      if (idSet.has(id)) {
        const g = this.groups.find((g) => g.id === id)
        if (g) g.order = order++
      }
    }
    for (const g of this.groups) {
      if (!orderedIds.includes(g.id)) {
        g.order = order++
      }
    }
    await this.saveGroups()
  }

  async setDefaultGroup(id: string | null): Promise<void> {
    for (const g of this.groups) {
      g.isDefault = id !== null && g.id === id
    }
    await this.saveGroups()
  }
}
