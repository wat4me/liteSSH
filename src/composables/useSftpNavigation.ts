import { ref } from 'vue'
import type { FileEntry } from '../env.d.ts'
import type { TerminalPwdTracker } from './useTerminalPwd'

function cleanRemotePath(path: string): string {
  return path.replace(/\/+$/, '') || '/'
}

type TerminalPwdRequestDetail = {
  sessionId: string
  handled?: boolean
  resolve: (pwd: string) => void
  reject: (error: Error) => void
}

function requestTerminalPwd(sessionId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const detail: TerminalPwdRequestDetail = {
      sessionId,
      resolve,
      reject,
    }
    globalThis.dispatchEvent(new CustomEvent<TerminalPwdRequestDetail>('request-terminal-pwd', { detail }))
    if (!detail.handled) {
      reject(new Error('No active terminal for pwd request'))
    }
  })
}

export function useSftpNavigation(sessionId: () => string, pwdTracker?: TerminalPwdTracker) {
  const currentPath = ref('')
  const files = ref<FileEntry[]>([])
  const loading = ref(false)
  const error = ref('')
  const sftpReady = ref(false)
  const pathInput = ref('')
  const showPathInput = ref(false)
  const homePath = ref('')
  const shellHomePath = ref('')
  const terminalPath = ref('')
  const lastPathDebug = ref('')
  const followTerminalPath = ref(true)
  const previousTerminalPath = ref('')
  let pendingLoadId = 0

  async function resolvePath(path: string): Promise<string | null> {
    const clean = cleanRemotePath(path)
    try {
      return await window.liteSSH.sftpRealpath(sessionId(), clean)
    } catch {
      try {
        const entries = await window.liteSSH.sftpReaddir(sessionId(), clean)
        if (entries) return clean
      } catch {}
      return null
    }
  }

  async function initSftp(): Promise<boolean> {
    if (sftpReady.value) return true
    loading.value = true
    error.value = ''
    try {
      await window.liteSSH.sftpInit(sessionId())
      sftpReady.value = true
      const [shellHomeRaw, sftpHome] = await Promise.all([
        window.liteSSH.sftpExecHome(sessionId()).catch(() => ''),
        window.liteSSH.sftpRealpath(sessionId(), '.').catch(() => ''),
      ])
      const home = shellHomeRaw.trim() || sftpHome
      if (!home) throw new Error('无法获取远程主目录')
      homePath.value = home
      shellHomePath.value = shellHomeRaw.trim()
      terminalPath.value = home
      currentPath.value = home
      pathInput.value = home
      await loadDirectory(home)
      return true
    } catch (err: any) {
      error.value = err.message || 'SFTP 初始化失败'
      return false
    } finally {
      loading.value = false
    }
  }

  async function loadDirectory(path: string, isFallback = false): Promise<boolean> {
    const cleanPath = cleanRemotePath(path)
    const loadId = ++pendingLoadId
    loading.value = true
    error.value = ''
    try {
      const entries = await window.liteSSH.sftpReaddir(sessionId(), cleanPath)
      if (loadId !== pendingLoadId) return false

      const filtered = entries.filter(entry => entry.name !== '.' && entry.name !== '..')
      currentPath.value = cleanPath
      pathInput.value = cleanPath
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          if (loadId === pendingLoadId) {
            files.value = filtered
          }
          resolve()
        })
      })
      return true
    } catch (err: any) {
      if (loadId !== pendingLoadId) return false
      console.warn(`[SFTP] readdir failed for "${cleanPath}":`, err.message || err)
      if (!isFallback && pwdTracker) {
        const prevPwd = pwdTracker.revertCd(sessionId())
        if (prevPwd && cleanRemotePath(prevPwd) !== cleanPath) {
          terminalPath.value = prevPwd
          return await loadDirectory(prevPwd, true)
        }
      }
      if (!isFallback) {
        error.value = err.message || '无法加载目录'
      }
      return false
    } finally {
      if (loadId === pendingLoadId) {
        loading.value = false
      }
    }
  }

  async function navigateTo(entry: FileEntry): Promise<boolean> {
    if (!entry.isDirectory && !entry.isSymlink) return false
    if (entry.isSymlink && !entry.isDirectory) {
      const resolved = await resolvePath(entry.path)
      if (!resolved) return false
      return await loadDirectory(resolved)
    }
    return await loadDirectory(entry.path)
  }

  async function goUp(): Promise<boolean> {
    if (currentPath.value === '/') return false
    const parts = currentPath.value.split('/').filter(Boolean)
    parts.pop()
    const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/')
    return await loadDirectory(parentPath)
  }

  async function goToHome(): Promise<boolean> {
    try {
      const home = await window.liteSSH.sftpRealpath(sessionId(), '.')
      return await loadDirectory(home)
    } catch {
      return false
    }
  }

  async function syncCwd(): Promise<boolean> {
    return syncTrackedPath(false)
  }

  async function syncCwdForce(): Promise<boolean> {
    return syncTrackedPath(true)
  }

  async function syncTrackedPath(useSftpFallback: boolean): Promise<boolean> {
    const tracked = terminalPath.value
    let livePwd = ''

    if (useSftpFallback) {
      try {
        livePwd = cleanRemotePath((await requestTerminalPwd(sessionId())).trim())
      } catch {}
    }

    if (!tracked && !livePwd) {
      error.value = '无法获取终端当前目录'
      return false
    }

    const candidates = [
      livePwd,
      tracked ? cleanRemotePath(tracked) : '',
    ].filter(Boolean)

    if (useSftpFallback) candidates.push('.')

    for (const candidate of [...new Set(candidates)]) {
      try {
        const resolved = await window.liteSSH.sftpRealpath(sessionId(), candidate)
        if (!resolved) continue

        previousTerminalPath.value = terminalPath.value
        terminalPath.value = resolved
        if (pwdTracker) pwdTracker.setPwd(sessionId(), resolved)

        if (resolved === currentPath.value) return true
        return await loadDirectory(resolved)
      } catch {}
    }

    if (useSftpFallback) {
      error.value = '无法获取终端当前目录'
    }
    return false
  }

  async function toggleFollowTerminalPath(): Promise<void> {
    followTerminalPath.value = !followTerminalPath.value
    if (followTerminalPath.value) {
      await syncCwd()
    }
  }

  async function submitPathInput(): Promise<void> {
    const path = pathInput.value.trim()
    if (path && path !== currentPath.value) {
      await loadDirectory(path)
    }
    showPathInput.value = false
  }

  function togglePathInput(): void {
    showPathInput.value = !showPathInput.value
  }

  function refresh(): void {
    if (currentPath.value) {
      loadDirectory(currentPath.value)
    }
  }

  return {
    currentPath,
    files,
    loading,
    error,
    sftpReady,
    pathInput,
    showPathInput,
    homePath,
    shellHomePath,
    terminalPath,
    lastPathDebug,
    followTerminalPath,
    previousTerminalPath,
    initSftp,
    loadDirectory,
    navigateTo,
    goUp,
    goToHome,
    syncCwd,
    syncCwdForce,
    toggleFollowTerminalPath,
    submitPathInput,
    togglePathInput,
    refresh,
    resolvePath,
    cleanRemotePath,
  }
}
