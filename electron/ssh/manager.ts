import { Client, ClientChannel, ConnectConfig, SFTPWrapper } from 'ssh2'
import * as fs from 'fs'
import * as net from 'net'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

interface Connection {
  id: string
  host: string
  port: number
  username: string
  password: string
  name: string
  keepaliveInterval?: number
  x11Forwarding?: boolean
  x11Host?: string
  x11Display?: number
}

interface Session {
  id: string
  client: Client
  stream: ClientChannel
  connectionId: string
  connectionName: string
  sftp?: SFTPWrapper
  x11Sockets?: Set<net.Socket>
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

interface ActiveTransfer {
  readStream: import('stream').Readable
  writeStream?: import('stream').Writable
  cancelled: boolean
}

export class SSHManager {
  private sessions: Map<string, Session> = new Map()
  private activeTransfers: Map<string, ActiveTransfer> = new Map()
  private decoders: Map<string, TextDecoder> = new Map()

  async connect(connection: Connection, callbacks: SSHCallbacks): Promise<string> {
    let useX11 = connection.x11Forwarding === true
    if (useX11) {
      const host = this.getX11Host(connection)
      const port = 6000 + this.getX11Display(connection)
      const listening = await this.probeX11Port(host, port)
      if (!listening) {
        useX11 = false
        callbacks.onData('', `\r\n\x1b[33m[liteSSH] X11 转发已跳过：本机 X Server (${host}:${port}) 未监听\x1b[0m\r\n`)
      }
    }

    return new Promise((resolve, reject) => {
      const client = new Client()
      const sessionId = uuidv4()
      let settled = false

      const safeResolve = (value: string) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      const safeReject = (err: Error) => {
        if (settled) return
        settled = true
        reject(err)
      }

      const config: ConnectConfig = {
        host: connection.host,
        port: connection.port,
        username: connection.username,
        ...(connection.privateKey
          ? {
              privateKey: Buffer.from(connection.privateKey),
              ...(connection.password ? { passphrase: connection.password } : {}),
            }
          : { password: connection.password }),
        readyTimeout: 15000,
        keepaliveInterval: connection.keepaliveInterval ?? 30000,
      }
      const x11Sockets = new Set<net.Socket>()

      if (useX11) {
        this.attachX11Forwarding(client, sessionId, connection, callbacks, x11Sockets)
      }

      client.on('ready', () => {
        const ptyOptions = {
          term: 'xterm-256color',
          cols: 80,
          rows: 24,
        }
        const handleShell = (err: Error | undefined | null, stream: ClientChannel) => {
          if (err) {
            this.destroyX11Sockets(x11Sockets)
            client.end()
            safeReject(new Error(`Shell error: ${err.message}`))
            return
          }

          this.sessions.set(sessionId, {
            id: sessionId,
            client,
            stream,
            connectionId: connection.id,
            connectionName: connection.name,
            x11Sockets,
          })

          const decoder = new TextDecoder('utf-8', { fatal: false })
          this.decoders.set(sessionId, decoder)
          stream.on('data', (data: Buffer) => {
            const decoded = decoder.decode(data, { stream: true })
            callbacks.onData(sessionId, decoded)
          })

          stream.on('close', () => {
            this.cleanupSession(sessionId)
            client.end()
            callbacks.onClose(sessionId)
          })

          stream.stderr.on('data', (data: Buffer) => {
            const decoded = decoder.decode(data, { stream: true })
            callbacks.onData(sessionId, decoded)
          })

          // Emit the X11 skip warning now that we have a valid sessionId
          if (connection.x11Forwarding === true && !useX11) {
            callbacks.onData(sessionId, `\r\n\x1b[33m[liteSSH] X11 转发已跳过：本机 X Server 未监听。请启动 VcXsrv/Xming 后重新连接以使用 X11 转发。\x1b[0m\r\n`)
          }

          safeResolve(sessionId)
        }

        if (useX11) {
          client.shell(ptyOptions, { x11: true }, handleShell)
        } else {
          client.shell(ptyOptions, handleShell)
        }
      })

      client.on('error', (err) => {
        this.destroyX11Sockets(x11Sockets)
        this.sessions.delete(sessionId)
        callbacks.onError(sessionId, err.message)
        safeReject(new Error(`Connection error: ${err.message}`))
      })

      client.on('close', () => {
        if (this.sessions.has(sessionId)) {
          this.cleanupSession(sessionId)
          callbacks.onClose(sessionId)
        } else {
          this.destroyX11Sockets(x11Sockets)
        }
      })

      client.connect(config)
    })
  }

  disconnect(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.cleanupSession(sessionId)
      try { session.client.end() } catch {}
    }
  }

  forceDisconnectAll() {
    for (const [, transfer] of this.activeTransfers) {
      transfer.cancelled = true
      try { transfer.readStream.destroy() } catch {}
      try { transfer.writeStream?.destroy() } catch {}
    }
    this.activeTransfers.clear()

    for (const [sessionId, session] of this.sessions) {
      try { session.sftp?.end() } catch {}
      this.destroyX11Sockets(session.x11Sockets)
      try { session.stream.close() } catch {}
      try { session.client.destroy() } catch {}
      this.sessions.delete(sessionId)
    }
  }

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId)
    if (session?.stream.writable) {
      session.stream.write(data)
      return true
    }
    return false
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId)
    if (session?.stream.writable) {
      session.stream.setWindow(rows, cols, 0, 0)
      return true
    }
    return false
  }

  private getX11Host(connection: Connection): string {
    return connection.x11Host?.trim() || '127.0.0.1'
  }

  private getX11Display(connection: Connection): number {
    return Number.isInteger(connection.x11Display) && connection.x11Display! >= 0 ? connection.x11Display! : 0
  }

  private probeX11Port(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(2000)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        resolve(false)
      })
      socket.once('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.connect(port, host)
    })
  }

  private destroyX11Sockets(sockets?: Set<net.Socket>) {
    if (!sockets) return
    for (const socket of sockets) {
      try { socket.destroy() } catch {}
    }
    sockets.clear()
  }

  private attachX11Forwarding(
    client: Client,
    sessionId: string,
    connection: Connection,
    callbacks: SSHCallbacks,
    x11Sockets: Set<net.Socket>
  ) {
    client.on('x11', (_details, accept, rejectX11) => {
      if (connection.x11Forwarding !== true) {
        try { rejectX11() } catch {}
        return
      }

      let x11Channel: ClientChannel
      try {
        x11Channel = accept()
      } catch (err: any) {
        try { rejectX11() } catch {}
        callbacks.onError(sessionId, `X11 forwarding failed: ${err?.message || 'failed to accept channel'}`)
        return
      }

      const host = this.getX11Host(connection)
      const port = 6000 + this.getX11Display(connection)
      const localSocket = net.connect(port, host)
      let closed = false
      let connected = false

      x11Sockets.add(localSocket)
      x11Channel.pipe(localSocket)
      localSocket.pipe(x11Channel)

      const closeBoth = () => {
        if (closed) return
        closed = true
        x11Sockets.delete(localSocket)
        try { localSocket.destroy() } catch {}
        try { x11Channel.close() } catch {}
      }

      localSocket.once('connect', () => {
        connected = true
      })
      localSocket.once('error', (err) => {
        if (!connected) {
          callbacks.onError(sessionId, `X11 forwarding failed: cannot connect to local X server ${host}:${port} (${err.message})`)
        }
        closeBoth()
      })
      localSocket.once('close', closeBoth)
      x11Channel.once('error', closeBoth)
      x11Channel.once('close', closeBoth)
    })
  }

  private cleanupSession(sessionId: string) {
    const decoder = this.decoders.get(sessionId)
    if (decoder) {
      decoder.decode(new Uint8Array(), { stream: false })
      this.decoders.delete(sessionId)
    }
    const session = this.sessions.get(sessionId)
    if (session?.sftp) {
      try {
        session.sftp.end()
      } catch {}
    }
    this.destroyX11Sockets(session?.x11Sockets)
    this.sessions.delete(sessionId)
    this.sftpInitPromises.delete(sessionId)
  }

  // SFTP Methods

  private sftpInitPromises = new Map<string, Promise<void>>()

  async initSftp(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')
    if (session.sftp) return

    const existing = this.sftpInitPromises.get(sessionId)
    if (existing) return existing

    const promise = new Promise<void>((resolve, reject) => {
      session.client.sftp((err, sftp) => {
        this.sftpInitPromises.delete(sessionId)
        if (err) {
          reject(new Error(`SFTP init error: ${err.message}`))
        } else {
          session.sftp = sftp
          resolve()
        }
      })
    })
    this.sftpInitPromises.set(sessionId, promise)
    return promise
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
        writeStream,
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

hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  measureLatency(sessionId: string): Promise<number> {
    const session = this.sessions.get(sessionId)
    if (!session) return Promise.reject(new Error('Session not found'))

    const start = Date.now()
    return new Promise((resolve, reject) => {
      let resolved = false
      let execStream: ClientChannel | null = null
      const finish = (err?: Error) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        if (err) {
          reject(err)
        } else {
          resolve(Date.now() - start)
        }
      }
      const timeout = setTimeout(() => {
        try { execStream?.close() } catch {}
        finish(new Error('Latency measurement timeout'))
      }, 5000)

      session.client.exec('true', (err, stream) => {
        if (err) {
          finish(err)
          return
        }
        execStream = stream
        stream.on('data', () => finish())
        stream.stderr.on('data', () => finish())
        stream.on('close', () => finish())
        stream.on('error', (streamErr) => finish(streamErr))
      })
    })
  }

  async sftpExec(sessionId: string, command: string, timeoutMs = 10000): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')

    return new Promise((resolve, reject) => {
      let settled = false
      let execStream: ClientChannel | null = null
      const finish = (err?: Error, output = '') => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) {
          reject(err)
        } else {
          resolve(output.trim())
        }
      }
      const timer = setTimeout(() => {
        try { execStream?.close() } catch {}
        finish(new Error(`Exec timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      session.client.exec(command, (err, stream) => {
        if (err) {
          finish(new Error(`Exec error: ${err.message}`))
          return
        }

        execStream = stream
        let output = ''
        stream.on('data', (data: Buffer) => {
          if (settled) return
          output += data.toString('utf-8')
        })
        stream.stderr.on('data', (data: Buffer) => {
          if (settled) return
          output += data.toString('utf-8')
        })
        stream.on('close', () => {
          finish(undefined, output)
        })
        stream.on('error', (streamErr) => {
          finish(streamErr)
        })
      })
    })
  }
}
