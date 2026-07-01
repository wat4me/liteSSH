import { reactive, computed } from 'vue'
import type { TransferItem } from '../env.d.ts'
import { formatSize } from '../utils/format'

export function useTransfers(getCurrentSessionId: () => string) {
  const transfers = reactive<Map<string, TransferItem>>(new Map())
  const speedMap = reactive<Map<string, number>>(new Map())
  let lastProgress = new Map<string, { transferred: number; time: number }>()

  const activeTransfers = computed(() => {
    const currentSessionId = getCurrentSessionId()
    let count = 0
    for (const [, item] of transfers) {
      if (item.sessionId === currentSessionId && (item.status === 'downloading' || item.status === 'uploading')) {
        count++
      }
    }
    return count
  })

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

  function getSpeed(transferId: string): number {
    return speedMap.get(transferId) || 0
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
    lastProgress.set(transferId, { transferred: 0, time: Date.now() })
    speedMap.set(transferId, 0)
  }

  function updateProgress(sessionId: string, transferId: string, transferred: number, total: number) {
    const item = getTransfer(sessionId, transferId)
    if (item) {
      item.transferred = transferred
      item.total = total
    }
    const last = lastProgress.get(transferId)
    const now = Date.now()
    if (last && now - last.time >= 500) {
      const bytesPerMs = (transferred - last.transferred) / (now - last.time)
      speedMap.set(transferId, bytesPerMs * 1000)
      lastProgress.set(transferId, { transferred, time: now })
    }
  }

  function markCompleted(sessionId: string, transferId: string) {
    const item = getTransfer(sessionId, transferId)
    if (item) {
      item.status = 'completed'
      item.transferred = item.total
    }
    speedMap.set(transferId, 0)
    lastProgress.delete(transferId)
  }

  function markError(sessionId: string, transferId: string, errorMsg: string) {
    const item = getTransfer(sessionId, transferId)
    if (item) {
      item.status = 'error'
      item.error = errorMsg
    }
    speedMap.set(transferId, 0)
    lastProgress.delete(transferId)
  }

  function cancelTransfer(transferId: string) {
    window.liteSSH.sftpCancelTransfer(transferId)
    const item = transfers.get(transferId)
    if (item) {
      item.status = 'error'
      item.error = '已取消'
    }
    speedMap.set(transferId, 0)
    lastProgress.delete(transferId)
  }

  function removeTransfer(transferId: string) {
    transfers.delete(transferId)
    speedMap.delete(transferId)
    lastProgress.delete(transferId)
  }

  function clearFinishedTransfers(direction?: 'download' | 'upload') {
    const currentSessionId = getCurrentSessionId()
    for (const [id, item] of transfers) {
      if (item.sessionId !== currentSessionId) continue
      if (direction && item.direction !== direction) continue
      if (item.status !== 'downloading' && item.status !== 'uploading') {
        transfers.delete(id)
        speedMap.delete(id)
        lastProgress.delete(id)
      }
    }
  }

  return {
    transfers,
    activeTransfers,
    downloadTransfers,
    uploadTransfers,
    addTransfer,
    updateProgress,
    markCompleted,
    markError,
    cancelTransfer,
    removeTransfer,
    clearFinishedTransfers,
    getSpeed,
    formatSize,
  }
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return ''
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
}
