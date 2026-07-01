<script setup lang="ts">
import { ref, computed } from 'vue'
import { useBatchCommand, type BatchCommandTarget } from '../composables/useBatchCommand'

const props = defineProps<{
  sessions: BatchCommandTarget[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const {
  results,
  isRunning,
  command,
  hasResults,
  successCount,
  errorCount,
  pendingCount,
  executeBatch,
  clearResults,
} = useBatchCommand()

const commandInput = ref('')
const selectedSessions = ref<Set<string>>(new Set(props.sessions.map(s => s.id)))
const timeoutInput = ref(30)

const canExecute = computed(() =>
  commandInput.value.trim().length > 0 &&
  selectedSessions.value.size > 0 &&
  !isRunning.value
)

function toggleSession(sessionId: string) {
  if (selectedSessions.value.has(sessionId)) {
    selectedSessions.value.delete(sessionId)
  } else {
    selectedSessions.value.add(sessionId)
  }
}

function selectAll() {
  selectedSessions.value = new Set(props.sessions.map(s => s.id))
}

function selectNone() {
  selectedSessions.value = new Set()
}

async function handleExecute() {
  if (!canExecute.value) return
  const sessions = props.sessions.filter(s => selectedSessions.value.has(s.id))
  await executeBatch(sessions, commandInput.value, timeoutInput.value * 1000)
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    handleExecute()
  }
}
</script>

<template>
  <div class="batch-panel">
    <div class="batch-header">
      <div class="batch-title">
        <span>批量执行</span>
        <span class="batch-title-badge">{{ selectedSessions.size }}/{{ sessions.length }}</span>
      </div>
      <button class="batch-close" @click="emit('close')" title="关闭">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="batch-sessions">
      <div class="sessions-header">
        <span>目标会话 ({{ selectedSessions.size }}/{{ sessions.length }})</span>
        <div class="sessions-actions">
          <button class="session-action-btn" @click="selectAll">全选</button>
          <button class="session-action-btn" @click="selectNone">取消</button>
        </div>
      </div>
      <div class="sessions-list">
        <label
          v-for="session in sessions"
          :key="session.id"
          class="session-checkbox"
        >
          <input
            type="checkbox"
            :checked="selectedSessions.has(session.id)"
            @change="toggleSession(session.id)"
          />
          <span class="session-text">
            <span class="session-name">{{ session.displayName }}</span>
            <span class="session-meta">{{ session.sshAddress }}</span>
          </span>
        </label>
      </div>
    </div>

    <div class="batch-input">
      <textarea
        v-model="commandInput"
        class="command-textarea"
        placeholder="输入要执行的命令... (Ctrl+Enter 执行)"
        rows="3"
        @keydown="handleKeydown"
        :disabled="isRunning"
      />
      <div class="input-options">
        <label class="timeout-label">
          <span>超时(秒)</span>
          <input
            type="number"
            v-model.number="timeoutInput"
            class="timeout-input"
            min="5"
            max="300"
            :disabled="isRunning"
          />
        </label>
      </div>
    </div>

    <div class="batch-actions">
      <button
        class="execute-btn"
        :disabled="!canExecute"
        @click="handleExecute"
      >
        <svg v-if="isRunning" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>{{ isRunning ? '执行中...' : '执行' }}</span>
      </button>
      <button v-if="hasResults" class="clear-btn" @click="clearResults">清空结果</button>
    </div>

    <div v-if="hasResults" class="batch-results">
      <div class="results-summary">
        <span v-if="successCount > 0" class="result-count success">{{ successCount }} 成功</span>
        <span v-if="errorCount > 0" class="result-count error">{{ errorCount }} 失败</span>
        <span v-if="pendingCount > 0" class="result-count pending">{{ pendingCount }} 等待中</span>
      </div>

      <div class="results-list">
        <div
          v-for="result in results"
          :key="result.sessionId"
          class="result-item"
          :class="result.status"
        >
          <div class="result-header">
            <div class="result-title-group">
              <span class="result-name">{{ result.displayName }}</span>
              <span class="result-meta">{{ result.sshAddress }}</span>
            </div>
            <span class="result-status">
              <template v-if="result.status === 'running'">运行中</template>
              <template v-else-if="result.status === 'success'">成功</template>
              <template v-else-if="result.status === 'error'">失败</template>
              <template v-else>等待中</template>
            </span>
          </div>
          <div v-if="result.output" class="result-output">
            <pre>{{ result.output }}</pre>
          </div>
          <div v-if="result.error" class="result-error">
            {{ result.error }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.batch-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  overflow: hidden;
}

.batch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.batch-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.batch-title-badge {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
}

.batch-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
}

.batch-close:hover {
  background: var(--hover-bg);
  color: var(--danger);
}

.batch-sessions {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.sessions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.sessions-actions {
  display: flex;
  gap: 4px;
}

.session-action-btn {
  padding: 2px 6px;
  font-size: 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  color: var(--text-secondary);
  cursor: pointer;
}

.session-action-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 140px;
  overflow-y: auto;
}

.session-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  font-size: 11px;
  color: var(--text-primary);
  cursor: pointer;
  min-width: 0;
}

.session-checkbox input {
  cursor: pointer;
  margin-top: 2px;
}

.session-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.session-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.session-meta {
  font-size: 10px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-input {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.command-textarea {
  width: 100%;
  padding: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  resize: none;
  outline: none;
}

.command-textarea:focus {
  border-color: var(--accent);
}

.command-textarea:disabled {
  opacity: 0.6;
}

.input-options {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
}

.timeout-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.timeout-input {
  width: 60px;
  padding: 3px 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 11px;
  outline: none;
}

.timeout-input:focus {
  border-color: var(--accent);
}

.timeout-input:disabled {
  opacity: 0.6;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.execute-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.execute-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.execute-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clear-btn {
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.clear-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

.batch-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.results-summary {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 11px;
}

.result-count {
  padding: 2px 6px;
  border-radius: 4px;
}

.result-count.success {
  background: rgba(46, 160, 67, 0.15);
  color: #3fb950;
}

.result-count.error {
  background: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.result-count.pending {
  background: rgba(187, 187, 187, 0.15);
  color: var(--text-secondary);
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-item {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.result-item.success {
  border-color: rgba(46, 160, 67, 0.3);
}

.result-item.error {
  border-color: rgba(248, 81, 73, 0.3);
}

.result-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  background: var(--bg-tertiary);
  font-size: 11px;
}

.result-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.result-name {
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-meta {
  font-size: 10px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-status {
  color: var(--text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.result-item.success .result-status {
  color: #3fb950;
}

.result-item.error .result-status {
  color: #f85149;
}

.result-output {
  padding: 8px 10px;
  background: var(--bg-primary);
  max-height: 150px;
  overflow-y: auto;
}

.result-output pre {
  margin: 0;
  font-size: 11px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

.result-error {
  padding: 8px 10px;
  background: rgba(248, 81, 73, 0.1);
  font-size: 11px;
  color: #f85149;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin-icon {
  animation: spin 1s linear infinite;
}
</style>
