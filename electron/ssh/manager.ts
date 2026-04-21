import { Client, ClientChannel, ConnectConfig, SFTPWrapper } from 'ssh2'
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

interface Connection {
  id: string
  host: string
  port: number
  username: string
  password: string
  name: string
}

interface Session {
  id: string
  client: Client
  stream: ClientChannel
  connectionId: string
  connectionName: string
  sftp?: SFTPWrapper
}

interface SSHCallbacks {
  onData: (sessionId: string, data: string) => void
  onClose: (sessionId: string) => void
  onError: (sessionId: string, error: string) => void
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymlink: boolean
  size: number
  modifyTime: number
  permissions: string
}

export interface StatsInfo {
  size: number
  modifyTime: number
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
  permissions: string
}

interface ActiveTransfer {
  readStream: import('stream').Readable
  writeStream?: import('stream').Writable
  cancelled: boolean
}

export class SSHManager {
  private sessions: Map<string, Session> = new Map()
  private activeTransfers: Map<string, ActiveTransfer> = new Map()

  connect(connection: Connection, callbacks: SSHCallbacks): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = new Client()
      const sessionId = uuidv4()

      const config: ConnectConfig = {
        host: connection.host,
        port: connection.port,
        username: connection.username,
        password: connection.password,
        readyTimeout: 15000,
        keepaliveInterval: 30000,
      }

      client.on('ready', () => {
        client.shell(
          {
            term: 'xterm-256color',
            cols: 80,
            rows: 24,
          },
          (err, stream) => {
            if (err) {
              client.end()
              reject(new Error(`Shell error: ${err.message}`))
              return
            }

            this.sessions.set(sessionId, {
              id: sessionId,
              client,
              stream,
              connectionId: connection.id,
              connectionName: connection.name,
            })

            stream.on('data', (data: Buffer) => {
              callbacks.onData(sessionId, data.toString('utf-8'))
            })

            stream.on('close', () => {
              this.cleanupSession(sessionId)
              client.end()
              callbacks.onClose(sessionId)
            })

            stream.stderr.on('data', (data: Buffer) => {
              callbacks.onData(sessionId, data.toString('utf-8'))
            })

            resolve(sessionId)
          }
        )
      })

      client.on('error', (err) => {
        this.sessions.delete(sessionId)
        callbacks.onError(sessionId, err.message)
        reject(new Error(`Connection error: ${err.message}`))
      })

      client.on('close', () => {
        if (this.sessions.has(sessionId)) {
          this.cleanupSession(sessionId)
          callbacks.onClose(sessionId)
        }
      })

      client.connect(config)
    })
  }

  disconnect(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.cleanupSession(sessionId)
      session.client.end()
    }
  }

  disconnectAll() {
    for (const [sessionId] of this.sessions) {
      this.disconnect(sessionId)
    }
  }

  write(sessionId: string, data: string) {
    const session = this.sessions.get(sessionId)
    if (session && session.stream.writable) {
      session.stream.write(data)
    }
  }

  resize(sessionId: string, cols: number, rows: number) {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.stream.setWindow(rows, cols, 0, 0)
    }
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  getActiveSessions(): { id: string; connectionName: string; connectionId: string }[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      connectionName: s.connectionName,
      connectionId: s.connectionId,
    }))
  }

  private cleanupSession(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (session?.sftp) {
      try {
        session.sftp.end()
      } catch {}
    }
    this.sessions.delete(sessionId)
  }

  // SFTP Methods

  async initSftp(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')
    if (session.sftp) return

    return new Promise((resolve, reject) => {
      session.client.sftp((err, sftp) => {
        if (err) {
          reject(new Error(`SFTP init error: ${err.message}`))
        } else {
          session.sftp = sftp
          resolve()
        }
      })
    })
  }

  async sftpReaddir(sessionId: string, remotePath: string): Promise<FileEntry[]> {
    const session = this.sessions.get(sessionId)
    if (!session?.sftp) throw new Error('SFTP not initialized')

    return new Promise((resolve, reject) => {
      session.sftp!.readdir(remotePath, (err, list) => {
        if (err) {
          reject(new Error(`Readdir error: ${err.message}`))
          return
        }

        const entries: FileEntry[] = list.map((entry) => {
          const longname = entry.longname || ''
          const firstChar = longname[0] || '-'
          const isDirectory = firstChar === 'd'
          const isSymlink = firstChar === 'l'
          const permissions = longname.substring(0, 10) || '----------'
          const entryPath = remotePath === '/' ? `/${entry.filename}` : `${remotePath}/${entry.filename}`

          return {
            name: entry.filename,
            path: entryPath,
            isDirectory,
            isSymlink,
            size: entry.attrs.size || 0,
            modifyTime: (entry.attrs.mtime || 0) * 1000,
            permissions,
          }
        })

        entries.sort((a, b) => {
          if (a.name === '..' || a.name === '.') return -1
          if (b.name === '..' || b.name === '.') return 1
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })

        resolve(entries)
      })
    })
  }

  async sftpStat(sessionId: string, remotePath: string): Promise<StatsInfo> {
    const session = this.sessions.get(sessionId)
    if (!session?.sftp) throw new Error('SFTP not initialized')

    return new Promise((resolve, reject) => {
      session.sftp!.stat(remotePath, (err, stats) => {
        if (err) {
          reject(new Error(`Stat error: ${err.message}`))
          return
        }

        const mode = stats.mode || 0
        const isDir = stats.isDirectory()
        const isFile = stats.isFile()
        const isLink = stats.isSymbolicLink()
        const perms = modeToFileMode(mode, isDir)

        resolve({
          size: stats.size || 0,
          modifyTime: (stats.mtime || 0) * 1000,
          isDirectory: isDir,
          isFile: isFile,
          isSymlink: isLink,
          permissions: perms,
        })
      })
    })
  }

  async sftpRealpath(sessionId: string, remotePath: string): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session?.sftp) throw new Error('SFTP not initialized')

    return new Promise((resolve, reject) => {
      session.sftp!.realpath(remotePath, (err, absPath) => {
        if (err) {
          reject(new Error(`Realpath error: ${err.message}`))
        } else {
          resolve(absPath)
        }
      })
    })
  }

  sftpDownload(
    sessionId: string,
    remotePath: string,
    localPath: string,
    transferId: string,
    onProgress: (transferred: number, total: number) => void
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session?.sftp) return Promise.reject(new Error('SFTP not initialized'))

    return new Promise((resolve, reject) => {
      session.sftp!.stat(remotePath, (statErr, stats) => {
        if (statErr) {
          reject(new Error(`Stat error: ${statErr.message}`))
          return
        }

        const totalSize = stats.size || 0

        const localDir = path.dirname(localPath)
        try {
          fs.mkdirSync(localDir, { recursive: true })
        } catch (mkdirErr: any) {
          reject(new Error(`Cannot create directory: ${mkdirErr.message}`))
          return
        }

        const readStream = session.sftp!.createReadStream(remotePath)
        const writeStream = fs.createWriteStream(localPath)

        const transfer: ActiveTransfer = {
          readStream,
          writeStream,
          cancelled: false,
        }
        this.activeTransfers.set(transferId, transfer)

        let transferred = 0

        readStream.on('data', (chunk: Buffer) => {
          transferred += chunk.length
          onProgress(transferred, totalSize)
        })

        readStream.on('error', (err) => {
          this.activeTransfers.delete(transferId)
          writeStream.close()
          if (!transfer.cancelled) {
            try {
              fs.unlinkSync(localPath)
            } catch {}
            reject(new Error(`Download error: ${err.message}`))
          }
        })

        writeStream.on('error', (err) => {
          this.activeTransfers.delete(transferId)
          readStream.destroy()
          if (!transfer.cancelled) {
            reject(new Error(`Write error: ${err.message}`))
          }
        })

        writeStream.on('finish', () => {
          this.activeTransfers.delete(transferId)
          if (transfer.cancelled) {
            try {
              fs.unlinkSync(localPath)
            } catch {}
            reject(new Error('Transfer cancelled'))
          } else {
            resolve()
          }
        })

        readStream.pipe(writeStream)
      })
    })
  }

  sftpUpload(
    sessionId: string,
    localPath: string,
    remotePath: string,
    transferId: string,
    onProgress: (transferred: number, total: number) => void
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session?.sftp) return Promise.reject(new Error('SFTP not initialized'))

    return new Promise((resolve, reject) => {
      let totalSize: number
      try {
        totalSize = fs.statSync(localPath).size
      } catch (err: any) {
        reject(new Error(`Cannot read local file: ${err.message}`))
        return
      }

      const readStream = fs.createReadStream(localPath)
      const writeStream = session.sftp!.createWriteStream(remotePath)

      const transfer: ActiveTransfer = {
        readStream,
        cancelled: false,
      }
      this.activeTransfers.set(transferId, transfer)

      let transferred = 0

      readStream.on('data', (chunk: string | Buffer) => {
        transferred += chunk.length
        onProgress(transferred, totalSize)
      })

      readStream.on('error', (err: any) => {
        this.activeTransfers.delete(transferId)
        writeStream.destroy()
        if (!transfer.cancelled) {
          reject(new Error(`Upload read error: ${err.message}`))
        }
      })

      writeStream.on('error', (err: any) => {
        this.activeTransfers.delete(transferId)
        readStream.destroy()
        if (!transfer.cancelled) {
          reject(new Error(`Upload write error: ${err.message}`))
        }
      })

      writeStream.on('close', () => {
        this.activeTransfers.delete(transferId)
        if (transfer.cancelled) {
          reject(new Error('Transfer cancelled'))
        } else {
          resolve()
        }
      })

      readStream.pipe(writeStream)
    })
  }

  cancelTransfer(transferId: string) {
    const transfer = this.activeTransfers.get(transferId)
    if (transfer) {
      transfer.cancelled = true
      transfer.readStream.destroy()
      transfer.writeStream?.destroy()
      this.activeTransfers.delete(transferId)
    }
  }

  async sftpExec(sessionId: string, command: string): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')

    return new Promise((resolve, reject) => {
      session.client.exec(command, (err, stream) => {
        if (err) {
          reject(new Error(`Exec error: ${err.message}`))
          return
        }

        let output = ''
        stream.on('data', (data: Buffer) => {
          output += data.toString('utf-8')
        })
        stream.stderr.on('data', (data: Buffer) => {
          output += data.toString('utf-8')
        })
        stream.on('close', () => {
          resolve(output.trim())
        })
      })
    })
  }
}

function modeToFileMode(mode: number, isDir: boolean): string {
  const type = isDir ? 'd' : '-'
  const owner = modeToFileBits((mode >> 6) & 7)
  const group = modeToFileBits((mode >> 3) & 7)
  const other = modeToFileBits(mode & 7)
  return type + owner + group + other
}

function modeToFileBits(bits: number): string {
  const r = (bits & 4) ? 'r' : '-'
  const w = (bits & 2) ? 'w' : '-'
  const x = (bits & 1) ? 'x' : '-'
  return r + w + x
}