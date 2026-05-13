import { ref } from 'vue'

export function useDragDrop(onFilesDropped: (files: { name: string; path: string }[]) => void) {
  const isDragOver = ref(false)

  function onDragOver(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer?.files?.length) {
      isDragOver.value = true
    }
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    isDragOver.value = false
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    isDragOver.value = false

    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length === 0) return

    const fileList = files.map(f => ({
      name: f.name,
      path: window.liteSSH.getPathForFile(f),
    }))

    onFilesDropped(fileList)
  }

  return {
    isDragOver,
    onDragOver,
    onDragLeave,
    onDrop,
  }
}
