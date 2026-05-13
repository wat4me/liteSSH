import { reactive } from 'vue'

export interface PwdState {
  pwd: string
  homePath: string
  previousPwd: string
}

export type TerminalPwdTracker = ReturnType<typeof useTerminalPwd>

export function useTerminalPwd() {
  const state = reactive<Record<string, PwdState>>({})

  function initSession(sessionId: string, homePath: string, initialPwd?: string) {
    const existing = state[sessionId]
    const pwd = initialPwd || existing?.pwd || homePath
    state[sessionId] = { pwd, homePath, previousPwd: pwd }
  }

  function handleCd(sessionId: string, rawCommand: string): string | null {
    const match = rawCommand.match(/(?:^|[;&|]\s*)cd(?:\s+(\S+))?/)
    const arg = match ? (match[1] || '').trim() : ''

    const st = state[sessionId]
    if (!st) {
      // Session not yet initialized — only track absolute paths
      if (arg && arg.startsWith('/')) {
        const newPwd = normalizePosixPath(arg)
        state[sessionId] = { pwd: newPwd, homePath: '/', previousPwd: newPwd }
        return newPwd
      }
      return null
    }

    if (!arg || arg === '~') {
      st.previousPwd = st.pwd
      st.pwd = st.homePath
      return st.pwd
    }

    if (arg === '-') {
      const prev = st.previousPwd
      st.previousPwd = st.pwd
      st.pwd = prev
      return st.pwd
    }

    let newPwd: string
    if (arg.startsWith('/')) {
      newPwd = normalizePosixPath(arg)
    } else if (arg.startsWith('~')) {
      newPwd = normalizePosixPath(st.homePath + '/' + arg.slice(1))
    } else {
      newPwd = normalizePosixPath(st.pwd + '/' + arg)
    }

    st.previousPwd = st.pwd
    st.pwd = newPwd
    return newPwd
  }

  function revertCd(sessionId: string): string | null {
    const st = state[sessionId]
    if (st) {
      // Revert pwd to previousPwd
      st.pwd = st.previousPwd
      return st.pwd
    }
    return null
  }

  function getPwd(sessionId: string): string | null {
    return state[sessionId]?.pwd || null
  }

  function getHomePath(sessionId: string): string | null {
    return state[sessionId]?.homePath || null
  }

  function hasSession(sessionId: string): boolean {
    return sessionId in state
  }

  function removeSession(sessionId: string) {
    delete state[sessionId]
  }

  return { state, initSession, handleCd, revertCd, getPwd, getHomePath, hasSession, removeSession }
}

function normalizePosixPath(p: string): string {
  const parts = p.split('/')
  const result: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') { result.pop(); continue }
    result.push(part)
  }
  return '/' + result.join('/')
}
