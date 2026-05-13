<script setup lang="ts">
import type { FileEntry } from '../env.d.ts'

const props = defineProps<{
  visible: boolean
  files: { name: string; path: string }[]
  targetPath: string
  existingFiles?: FileEntry[]
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

function isOverwrite(fileName: string): boolean {
  return props.existingFiles?.some(f => f.name === fileName) ?? false
}
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3 class="modal-title">确认上传</h3>
      <p class="upload-confirm-text">将以下文件上传到：</p>
      <div class="upload-confirm-path">{{ targetPath }}</div>
      <ul class="upload-file-list">
        <li v-for="file in files" :key="file.path" :class="{ 'file-overwrite': isOverwrite(file.name) }">
          {{ file.name }}
          <span v-if="isOverwrite(file.name)" class="overwrite-badge">覆盖</span>
        </li>
      </ul>
      <div class="upload-confirm-actions">
        <button class="btn-cancel" @click="emit('cancel')">取消</button>
        <button class="btn-upload" @click="emit('confirm')">上传</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  width: 420px;
  max-height: 80vh;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.upload-confirm-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.upload-confirm-path {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  color: var(--accent);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
  word-break: break-all;
}

.upload-file-list {
  list-style: none;
  padding: 0;
  margin: 0 0 16px 0;
  max-height: 200px;
  overflow-y: auto;
}

.upload-file-list li {
  padding: 4px 0;
  font-size: 12px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.upload-file-list li:last-child {
  border-bottom: none;
}

.file-overwrite {
  color: var(--danger);
}

.overwrite-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(248, 81, 73, 0.15);
  color: var(--danger);
  font-weight: 600;
}

.upload-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  padding: 6px 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel:hover {
  background: var(--bg-secondary);
  border-color: var(--text-secondary);
}

.btn-upload {
  padding: 6px 16px;
  border: none;
  background: var(--accent);
  color: #fff;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-upload:hover {
  opacity: 0.9;
}
</style>
