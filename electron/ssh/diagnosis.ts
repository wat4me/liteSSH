import { Client, ConnectConfig } from 'ssh2'
import { Socket } from 'net'
import { AuthConnectionParams, buildSshConnectConfig } from '../utils/validation'

const SSH_DIAG_TIMEOUT_MS = 10000

export type SshDiagnosisResult = {
  ok: boolean
  tcpLatency?: number
  sshReadyLatency?: number
  shellOpenLatency?: number
  shellFirstByteLatency?: number
  totalLatency?: number
  error?: string
}

function testTcpLatency(host: string, port: number, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    let settled = false
    const socket = new Socket()

    const finish = (handler: () => void) => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      handler()
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      finish(() => resolve(Date.now() - start))
    })
    socket.once('timeout', () => {
      finish(() => reject(new Error(`TCP connection timeout (${timeoutMs}ms)`)))
    })
    socket.once('error', (err) => {
      finish(() => reject(err))
    })

    socket.connect(port, host)
  })
}

export async function diagnoseSshConnection(params: AuthConnectionParams): Promise<SshDiagnosisResult> {
  const totalStart = Date.now()
  let tcpLatency: number | undefined
  let sshReadyLatency: number | undefined
  let shellOpenLatency: number | undefined

  try {
    tcpLatency = await testTcpLatency(params.host, params.port, SSH_DIAG_TIMEOUT_MS)
  } catch (err: any) {
    return {
      ok: false,
      tcpLatency,
      error: err?.message || 'TCP connection failed',
    }
  }

  return new Promise((resolve) => {
    const sshStart = Date.now()
    const client = new Client()
    let done = false
    let shellTimeout: ReturnType<typeof setTimeout> | null = null

    const finish = (result: SshDiagnosisResult) => {
      if (done) return
      done = true
      if (shellTimeout) {
        clearTimeout(shellTimeout)
        shellTimeout = null
      }
      client.removeAllListeners()
      client.end()
      resolve({
        tcpLatency,
        sshReadyLatency,
        shellOpenLatency,
        ...result,
      })
    }

    shellTimeout = setTimeout(() => {
      finish({
        ok: false,
        totalLatency: Date.now() - totalStart,
        error: `SSH diagnosis timeout (${SSH_DIAG_TIMEOUT_MS}ms)`,
      })
    }, SSH_DIAG_TIMEOUT_MS)

    client.on('ready', () => {
      sshReadyLatency = Date.now() - sshStart
      const shellStart = Date.now()
      client.shell(
        {
          term: 'xterm-256color',
          cols: 80,
          rows: 24,
        },
        (err, stream) => {
          if (err) {
            finish({
              ok: false,
              totalLatency: Date.now() - totalStart,
              error: `Shell open error: ${err.message}`,
            })
            return
          }

          shellOpenLatency = Date.now() - shellStart
          const firstByteStart = Date.now()
          let gotFirstByte = false

          const handleFirstByte = () => {
            if (gotFirstByte) return
            gotFirstByte = true
            finish({
              ok: true,
              shellFirstByteLatency: Date.now() - firstByteStart,
              totalLatency: Date.now() - totalStart,
            })
          }

          stream.on('data', (data: Buffer) => {
            if (data.length > 0) {
              handleFirstByte()
            }
          })
          stream.stderr.on('data', (data: Buffer) => {
            if (data.length > 0) {
              handleFirstByte()
            }
          })
          stream.on('close', () => {
            if (!gotFirstByte) {
              finish({
                ok: false,
                totalLatency: Date.now() - totalStart,
                error: 'Shell closed before first byte',
              })
            }
          })

          stream.write('\r')
        }
      )
    })

    client.on('error', (err) => {
      finish({
        ok: false,
        totalLatency: Date.now() - totalStart,
        error: err.message,
      })
    })

    client.connect(buildSshConnectConfig(params, SSH_DIAG_TIMEOUT_MS))
  })
}