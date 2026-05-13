import { reactive, computed } from 'vue'
import type { TransferItem } from '../env.d.ts'
import { formatSize } from '../utils/format'

export function useTransfers(getCurrentSessionId: () => string) {
  const transfers = reactive<Map<string, TransferItem>>(new Map())

  const downloadTransfers = computed(() => {
    const currentSessionId = getCurrentSessionId()
    const items: [string, TransferItem][] = []
    for (const [id, item] of transfers) {
      if (item.sessionId === currentSessionId && item.direction === 'download') items.push([id, item])
    }
    return items
  })

  const uploadTransfers = computed(() => {
    const currentSessionId = getCurrentSessionId()
    const items: [string, TransferItem][] = []
    for (const [id, item] of transfers) {
      if (item.sessionId === currentSessionId && item.direction === 'upload') items.push([id, item])
    }
    return items
  })

  function getTransfer(sessionId: string, transferId: string): TransferItem | undefined {
    const item = transfers.get(transferId)
    return item?.sessionId === sessionId ? item : undefined
  }

  function addTransfer(sessionId: string, transferId: string, fileName: string, localPath: string, direction: 'download' | 'upload') {
    if (transfers.has(transferId)) return
    transfers.set(transferId, {
      id: transferId,
      sessionId,
      fileName,
      localPath,
      transferred: 0,
      total: 0,
      status: direction === 'download' ? 'downloading' : 'uploading',
      direction,
    })
  }

  function updateProgress(sessionId: string, transferId: string, transferred: number, total: number) {
    const item = getTransfer(sessionId, transferId)
    if (item) {
      item.transferred = transferred
      item.total = total
    }
  }

  function markCompleted(sessionId: string, transferId: string) {
    const item = getTransfer(sessionId, transferId)
    if (item) {
      item.status = 'completed'
      item.transferred = item.total
    }
  }

  function markError(sessionId: string, transferId: string, errorMsg: string) {
    const item = getTransfer(sessionId, transferId)
    if (item) {
      item.status = 'error'
      item.error = errorMsg
    }
  }

  function cancelTransfer(transferId: string) {
    window.liteSSH.sftpCancelTransfer(transferId)
    const item = transfers.get(transferId)
    if (item) {
      item.status = 'error'
      item.error = '已取消'
    }
  }

  function removeTransfer(transferId: string) {
    transfers.delete(transferId)
  }

  function clearFinishedTransfers(direction?: 'download' | 'upload') {
    const currentSessionId = getCurrentSessionId()
    for (const [id, item] of transfers) {
      if (item.sessionId !== currentSessionId) continue
      if (direction && item.direction !== direction) continue
      if (item.status !== 'downloading' && item.status !== 'uploading') {
        transfers.delete(id)
      }
    }
  }

  return {
    transfers,
    downloadTransfers,
    uploadTransfers,
    addTransfer,
    updateProgress,
    markCompleted,
    markError,
    cancelTransfer,
    removeTransfer,
    clearFinishedTransfers,
    formatSize,
  }
}
