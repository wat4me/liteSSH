export function useWriteQueue() {
  let writeQueue = ''
  let writeTimer: ReturnType<typeof setTimeout> | null = null

  function processWriteQueue(sessionId: string) {
    if (writeQueue.length === 0) {
      writeTimer = null
      return
    }
    const chunk = writeQueue.substring(0, 32)
    writeQueue = writeQueue.substring(32)
    window.liteSSH.sshWrite(sessionId, chunk)

    if (writeQueue.length > 0) {
      writeTimer = setTimeout(() => processWriteQueue(sessionId), 10)
    } else {
      writeTimer = null
    }
  }

  function enqueueWrite(data: string, sessionId: string) {
    writeQueue += data
    if (!writeTimer) {
      processWriteQueue(sessionId)
    }
  }

  function clearWriteQueue() {
    writeQueue = ''
    if (writeTimer) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
  }

  function getWriteQueueLength() {
    return writeQueue.length
  }

  return {
    processWriteQueue,
    enqueueWrite,
    clearWriteQueue,
    getWriteQueueLength,
  }
}