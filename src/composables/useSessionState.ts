import { ref } from 'vue'
import type { FileEntry } from '../env.d.ts'

interface CachedSidebarState {
  activeTab: 'files' | 'downloads' | 'uploads'
  currentPath: string
  files: FileEntry[]
  error: string
  sftpReady: boolean
  pathInput: string
  homePath: string
  shellHomePath: string
  terminalPath: string
  lastPathDebug: string
  followTerminalPath: boolean
  previousTerminalPath: string
}

export function useSessionState() {
  const sessionStateCache = new Map<string, CachedSidebarState>()

  function cloneEntries(entries: FileEntry[]): FileEntry[] {
    return entries.map(entry => ({ ...entry }))
  }

  function persistSessionState(
    sessionId: string,
    state: Omit<CachedSidebarState, 'activeTab'> & { activeTab: string }
  ) {
    if (!sessionId) return
    sessionStateCache.set(sessionId, {
      ...state,
      activeTab: state.activeTab as 'files' | 'downloads' | 'uploads',
      files: cloneEntries(state.files),
    })
  }

  function restoreSessionState(sessionId: string): CachedSidebarState | null {
    return sessionStateCache.get(sessionId) || null
  }

  function clearSessionState(sessionId: string) {
    sessionStateCache.delete(sessionId)
  }

  return {
    persistSessionState,
    restoreSessionState,
    clearSessionState,
  }
}
