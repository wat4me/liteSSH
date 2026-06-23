import { ref, computed, onBeforeUnmount } from 'vue'

export type SplitMode = 'none' | 'horizontal' | 'vertical'

export function useSplitTerminal() {
  const splitMode = ref<SplitMode>('none')
  const splitRatio = ref(50)

  const isSplit = computed(() => splitMode.value !== 'none')

  let resizing = false
  let containerEl: HTMLElement | null = null

  function toggleHorizontal() {
    if (splitMode.value === 'horizontal') {
      splitMode.value = 'none'
    } else {
      splitMode.value = 'horizontal'
      splitRatio.value = 50
    }
  }

  function toggleVertical() {
    if (splitMode.value === 'vertical') {
      splitMode.value = 'none'
    } else {
      splitMode.value = 'vertical'
      splitRatio.value = 50
    }
  }

  function closeSplit() {
    splitMode.value = 'none'
  }

  function onMove(e: MouseEvent) {
    if (!resizing || !containerEl) return
    const rect = containerEl.getBoundingClientRect()
    if (splitMode.value === 'vertical') {
      const ratio = ((e.clientX - rect.left) / rect.width) * 100
      splitRatio.value = Math.max(20, Math.min(80, ratio))
    } else if (splitMode.value === 'horizontal') {
      const ratio = ((e.clientY - rect.top) / rect.height) * 100
      splitRatio.value = Math.max(20, Math.min(80, ratio))
    }
  }

  function onUp() {
    resizing = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  function startSplitResize(e: MouseEvent, el: HTMLElement) {
    containerEl = el
    resizing = true
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = splitMode.value === 'horizontal' ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  })

  return {
    splitMode,
    splitRatio,
    isSplit,
    toggleHorizontal,
    toggleVertical,
    closeSplit,
    startSplitResize,
  }
}
