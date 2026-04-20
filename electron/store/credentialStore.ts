import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { v4 as uuidv4 } from 'uuid'

export interface Connection {
  id: string
  name: string
  host: string
  port: number
  username: string
  password: string
  group?: string
  createdAt: number
  updatedAt: number
}

export interface Group {
  id: string
  name: string
  order: number
  isDefault: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class CredentialStore {
  private connectionsPath: string
  private groupsPath: string
  private connections: Connection[] = []
  private groups: Group[] = []

  constructor() {
    const userData = app.getPath('userData')
    this.connectionsPath = join(userData, 'connections.json')
    this.groupsPath = join(userData, 'groups.json')
    this.load()
  }

  private load() {
    try {
      if (existsSync(this.connectionsPath)) {
        const data = readFileSync(this.connectionsPath, 'utf-8')
        this.connections = JSON.parse(data)
      }
    } catch {
      this.connections = []
    }

    try {
      if (existsSync(this.groupsPath)) {
        const data = readFileSync(this.groupsPath, 'utf-8')
        this.groups = JSON.parse(data)
      }
    } catch {
      this.groups = []
    }

    this.migrateGroupField()
  }

  private migrateGroupField() {
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
      this.saveConnections()
      this.saveGroups()
    }
  }

  private saveConnections() {
    try {
      const dir = dirname(this.connectionsPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(this.connectionsPath, JSON.stringify(this.connections, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save connections:', err)
    }
  }

  private saveGroups() {
    try {
      const dir = dirname(this.groupsPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      writeFileSync(this.groupsPath, JSON.stringify(this.groups, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save groups:', err)
    }
  }

  getConnections(): Connection[] {
    return [...this.connections]
  }

  getConnection(id: string): Connection | undefined {
    return this.connections.find((c) => c.id === id)
  }

  saveConnection(conn: Partial<Connection> & { name: string; host: string; username: string; password: string }): Connection {
    const now = Date.now()
    let saved: Connection

    if (conn.id) {
      const idx = this.connections.findIndex((c) => c.id === conn.id)
      if (idx === -1) {
        throw new Error('Connection not found')
      }
      this.connections[idx] = {
        ...this.connections[idx],
        ...conn,
        updatedAt: now,
      } as Connection
      saved = this.connections[idx]
    } else {
      saved = {
        ...conn,
        id: uuidv4(),
        port: conn.port || 22,
        createdAt: now,
        updatedAt: now,
      } as Connection
      this.connections.push(saved)
    }

    this.saveConnections()
    return saved
  }

  deleteConnection(id: string): boolean {
    const idx = this.connections.findIndex((c) => c.id === id)
    if (idx === -1) return false
    this.connections.splice(idx, 1)
    this.saveConnections()
    return true
  }

  getGroups(): Group[] {
    return [...this.groups].sort((a, b) => a.order - b.order)
  }

  saveGroup(group: Partial<Group> & { name: string }): Group {
    const now = Date.now()
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

    this.saveGroups()
    return saved
  }

  deleteGroup(id: string): boolean {
    const idx = this.groups.findIndex((g) => g.id === id)
    if (idx === -1) return false
    this.groups.splice(idx, 1)

    for (const conn of this.connections) {
      if (conn.group === id) {
        conn.group = undefined
      }
    }

    this.saveGroups()
    this.saveConnections()
    return true
  }

  reorderGroups(orderedIds: string[]): void {
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
    this.saveGroups()
  }

  setDefaultGroup(id: string): void {
    for (const g of this.groups) {
      g.isDefault = g.id === id
    }
    this.saveGroups()
  }
}
