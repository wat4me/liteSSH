import { ref } from 'vue'
import type { FileEntry } from '../env.d.ts'
import type { TerminalPwdTracker } from './useTerminalPwd'

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

  async function initSftp(): Promise<boolean> {
    if (sftpReady.value) return true
    loading.value = true
    error.value = ''
    try {
      await window.liteSSH.sftpInit(sessionId())
      sftpReady.value = true
      const [home, shellHomeRaw] = await Promise.all([
        window.liteSSH.sftpRealpath(sessionId(), '.'),
        window.liteSSH.sftpExecHome(sessionId()).catch(() => ''),
      ])
      if (!home) throw new Error('无法获取远程主目录')
      homePath.value = home
      shellHomePath.value = shellHomeRaw.trim() || home
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
    const loadId = ++pendingLoadId
    loading.value = true
    error.value = ''
    try {
      const entries = await window.liteSSH.sftpReaddir(sessionId(), path)
      if (loadId !== pendingLoadId) return false

      const filtered = entries.filter(e => e.name !== '.' && e.name !== '..')
      currentPath.value = path
      pathInput.value = path
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
      if (followTerminalPath.value && !isFallback && pwdTracker) {
        const prevPwd = pwdTracker.revertCd(sessionId())
        if (prevPwd && prevPwd !== path) {
          terminalPath.value = prevPwd
          return await loadDirectory(prevPwd, true)
        }
      }
      error.value = err.message || '无法加载目录'
      return false
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
      try {
        const resolved = await window.liteSSH.sftpRealpath(sessionId(), entry.path)
        if (!resolved) return false
        return await loadDirectory(resolved)
      } catch {
        return false
      }
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
    const tracked = terminalPath.value
    if (!tracked) {
      error.value = '无法获取终端当前目录'
      return false
    }
    try {
      const resolved = await window.liteSSH.sftpRealpath(sessionId(), tracked)
      if (resolved && resolved !== currentPath.value) {
        previousTerminalPath.value = terminalPath.value
        terminalPath.value = resolved
        return await loadDirectory(resolved)
      }
      if (resolved === currentPath.value) {
        return true
      }
      error.value = '无法获取终端当前目录'
    } catch (err: any) {
      error.value = err.message || '无法获取终端当前目录'
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
    toggleFollowTerminalPath,
    submitPathInput,
    togglePathInput,
    refresh,
  }
}
