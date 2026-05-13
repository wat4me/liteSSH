import { ref } from 'vue'
import type { FileEntry } from '../env.d.ts'

export function useContextMenu() {
  const contextMenuVisible = ref(false)
  const contextMenuX = ref(0)
  const contextMenuY = ref(0)
  const contextMenuEntry = ref<FileEntry | null>(null)

  function showContextMenu(e: MouseEvent, entry: FileEntry) {
    e.preventDefault()
    e.stopPropagation()
    contextMenuEntry.value = entry
    contextMenuX.value = e.clientX
    contextMenuY.value = e.clientY
    contextMenuVisible.value = true
  }

  function hideContextMenu() {
    contextMenuVisible.value = false
    contextMenuEntry.value = null
  }

  function onContextMenu(e: MouseEvent, entry: FileEntry) {
    if (!entry.isDirectory) {
      showContextMenu(e, entry)
    }
  }

  return {
    contextMenuVisible,
    contextMenuX,
    contextMenuY,
    contextMenuEntry,
    showContextMenu,
    hideContextMenu,
    onContextMenu,
  }
}
