import type { ComputedRef } from 'vue'
import type { ConnectionGroup } from './useSessionManager'

export function useAppKeyboard(deps: {
  isHomeActive: ComputedRef<boolean>
  activeGroup: ComputedRef<ConnectionGroup | null>
  toggleSidebar: () => void
  onCloseGroup: (connectionId: string) => void
}) {
  function handleKeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return

    if (e.key === 'b') {
      e.preventDefault()
      deps.toggleSidebar()
    } else if (e.key === 'w' && !deps.isHomeActive.value) {
      if (document.activeElement?.closest('.xterm-container')) return
      e.preventDefault()
      const group = deps.activeGroup.value
      if (group) deps.onCloseGroup(group.connectionId)
    }
  }

  return { handleKeydown }
}