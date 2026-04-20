import { Client, ClientChannel, ConnectConfig } from 'ssh2'
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
}

interface SSHCallbacks {
  onData: (sessionId: string, data: string) => void
  onClose: (sessionId: string) => void
  onError: (sessionId: string, error: string) => void
}

export class SSHManager {
  private sessions: Map<string, Session> = new Map()

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
              this.sessions.delete(sessionId)
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
          this.sessions.delete(sessionId)
          callbacks.onClose(sessionId)
        }
      })

      client.connect(config)
    })
  }

  disconnect(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.stream.close()
      session.client.end()
      this.sessions.delete(sessionId)
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
}
