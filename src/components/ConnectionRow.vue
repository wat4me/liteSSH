<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { Link, Edit, Delete } from '@element-plus/icons-vue'
import type { Connection } from '../env.d.ts'

interface TestStatus {
  state: 'idle' | 'testing' | 'success' | 'error'
  latency?: number
  error?: string
}

const props = defineProps<{
  connection: Connection
  testStatus: TestStatus
}>()

const emit = defineEmits<{
  (e: 'connect', connectionId: string): void
  (e: 'test', connectionId: string): void
  (e: 'edit', connection: Connection): void
  (e: 'delete', connectionId: string): void
}>()

function onDoubleClick() {
  emit('connect', props.connection.id)
}
</script>

<template>
  <div class="connection-row" @dblclick="onDoubleClick">
    <div class="row-main">
      <div class="status-dot"></div>
      <div class="row-info">
        <span class="conn-name">{{ connection.name }}</span>
        <span class="conn-meta">{{ connection.username }}@{{ connection.host }}:{{ connection.port }}</span>
      </div>
    </div>
    <div class="row-actions">
      <el-tooltip content="连接" placement="bottom">
        <button class="action-btn connect" @click.stop="emit('connect', connection.id)">
          <el-icon :size="14"><Link /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip v-if="testStatus.state === 'idle'" content="测试连接" placement="bottom">
        <button class="action-btn test" @click.stop="emit('test', connection.id)">测试</button>
      </el-tooltip>
      <button v-else-if="testStatus.state === 'testing'" class="action-btn testing" disabled>
        <span class="spinner"></span> 测试中...
      </button>
      <el-tooltip v-else-if="testStatus.state === 'success'" content="连接正常" placement="bottom">
        <button class="action-btn success">✅ {{ testStatus.latency }}ms</button>
      </el-tooltip>
      <el-tooltip v-else-if="testStatus.state === 'error'" :content="testStatus.error || '连接失败'" placement="bottom">
        <button class="action-btn error">❌ {{ testStatus.error || '失败' }}</button>
      </el-tooltip>
      <el-tooltip content="编辑" placement="bottom">
        <button class="action-btn" @click.stop="emit('edit', connection)">
          <el-icon :size="14"><Edit /></el-icon>
        </button>
      </el-tooltip>
      <el-tooltip content="删除" placement="bottom">
        <button class="action-btn danger" @click.stop="emit('delete', connection.id)">
          <el-icon :size="14"><Delete /></el-icon>
        </button>
      </el-tooltip>
    </div>
  </div>
</template>

<style scoped>
.connection-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: default;
  transition: background 0.15s;
  border: 1px solid var(--border-color);
  margin-bottom: 8px;
  background: var(--bg-primary);
}

.connection-row:hover {
  background: var(--bg-tertiary);
}

.row-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(63, 185, 80, 0.4);
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.conn-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conn-meta {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 5px;
  font-size: 12px;
  transition: all 0.15s;
  white-space: nowrap;
}

.action-btn:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
  border-color: var(--text-secondary);
}

.action-btn.connect {
  color: var(--accent);
  border-color: var(--accent);
}

.action-btn.connect:hover {
  background: var(--accent-bg);
}

.action-btn.danger:hover {
  color: var(--danger);
  border-color: var(--danger);
}

.action-btn.test {
  color: var(--accent);
  border-color: var(--accent);
}

.action-btn.testing {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn.success {
  color: var(--success);
  border-color: var(--success);
  cursor: default;
}

.action-btn.error {
  color: var(--danger);
  border-color: var(--danger);
  cursor: default;
}

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
