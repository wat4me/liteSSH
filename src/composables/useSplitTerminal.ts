import { ref, computed, onBeforeUnmount } from 'vue'

export type SplitMode = 'none' | 'horizontal' | 'vertical'

const RESIZE_MIN = 20
const RESIZE_MAX = 80
const DIVIDER_SIZE = 6

export function useSplitTerminal() {
  const splitMode = ref<SplitMode>('none')
  const splitRatio = ref(50)
  const isResizing = ref(false)

  const isSplit = computed(() => splitMode.value !== 'none')

  let resizing = false
  let containerEl: HTMLElement | null = null
  let maskEl: HTMLElement | null = null

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
      splitRatio.value = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, ratio))
    } else if (splitMode.value === 'horizontal') {
      const ratio = ((e.clientY - rect.top) / rect.height) * 100
      splitRatio.value = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, ratio))
    }
  }

  function onUp() {
    resizing = false
    isResizing.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (maskEl) {
      maskEl.remove()
      maskEl = null
    }
  }

  function startSplitResize(e: MouseEvent, el: HTMLElement) {
    containerEl = el
    resizing = true
    isResizing.value = true

    maskEl = document.createElement('div')
    maskEl.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:' + (splitMode.value === 'horizontal' ? 'row-resize' : 'col-resize') + ';'
    document.body.appendChild(maskEl)

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = splitMode.value === 'horizontal' ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  function resetSplitRatio() {
    splitRatio.value = 50
  }

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    if (maskEl) {
      maskEl.remove()
      maskEl = null
    }
  })

  return {
    splitMode,
    splitRatio,
    isSplit,
    isResizing,
    toggleHorizontal,
    toggleVertical,
    closeSplit,
    startSplitResize,
    resetSplitRatio,
    DIVIDER_SIZE,
  }
}
