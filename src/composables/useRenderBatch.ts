import type { Terminal } from '@xterm/xterm'

export function useRenderBatch(getTerminal: () => Terminal | null) {
  let renderBatch = ''
  let renderBatchRafId: number | null = null

  function flushRenderBatch(callback?: () => void) {
    const terminal = getTerminal()
    if (!terminal || renderBatch.length === 0) {
      renderBatch = ''
      if (renderBatchRafId) {
        cancelAnimationFrame(renderBatchRafId)
        renderBatchRafId = null
      }
      callback?.()
      return
    }
    const data = renderBatch
    renderBatch = ''
    if (renderBatchRafId) {
      cancelAnimationFrame(renderBatchRafId)
      renderBatchRafId = null
    }
    terminal.write(data, callback)
  }

  function scheduleRenderFlush() {
    if (renderBatchRafId) return
    renderBatchRafId = requestAnimationFrame(() => {
      renderBatchRafId = null
      flushRenderBatch()
    })
  }

  function appendRenderBatch(data: string) {
    renderBatch += data
  }

  function resetRenderBatch() {
    renderBatch = ''
    if (renderBatchRafId) {
      cancelAnimationFrame(renderBatchRafId)
      renderBatchRafId = null
    }
  }

  return {
    renderBatch,
    flushRenderBatch,
    scheduleRenderFlush,
    appendRenderBatch,
    resetRenderBatch,
  }
}