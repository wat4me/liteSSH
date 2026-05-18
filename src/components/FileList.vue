<script setup lang="ts">
import type { FileEntry } from '../env.d.ts'
import { formatSize } from '../utils/format'
import { getFileIcon } from '../utils/fileIcons'

defineProps<{
  files: FileEntry[]
  currentPath: string
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  (e: 'navigate', entry: FileEntry): void
  (e: 'goUp'): void
  (e: 'download', entry: FileEntry): void
  (e: 'contextMenu', event: MouseEvent, entry: FileEntry): void
}>()
</script>

<template>
  <div v-if="error" class="sidebar-error">{{ error }}</div>

  <div v-if="loading && files.length === 0" class="sidebar-loading">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
    <span>加载中...</span>
  </div>

  <div class="file-list" v-else>
    <div
      v-if="currentPath !== '/'"
      class="file-entry file-entry-parent"
      @click="emit('goUp')"
    >
      <span class="file-icon-img file-icon-img-parent" v-html="getFileIcon('', true, false)"></span>
      <span class="file-name">..</span>
    </div>

    <div
      v-for="entry in files"
      :key="entry.path"
      class="file-entry"
      :class="{ 'file-entry-dir': entry.isDirectory || entry.isSymlink }"
      @click="entry.isDirectory || entry.isSymlink ? emit('navigate', entry) : undefined"
      @contextmenu="emit('contextMenu', $event, entry)"
    >
      <span class="file-icon-img" v-html="getFileIcon(entry.name, entry.isDirectory, entry.isSymlink)"></span>
      <span class="file-name" :title="entry.name">{{ entry.name }}</span>
      <span v-if="!entry.isDirectory && entry.size > 0" class="file-size">{{ formatSize(entry.size) }}</span>
      <button
        v-if="!entry.isDirectory"
        class="file-download-btn"
        @click.stop="emit('download', entry)"
        title="下载"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>

    <div v-if="files.length === 0 && currentPath && !loading" class="sidebar-empty">
      空目录
    </div>
  </div>
</template>

<style scoped>
.sidebar-error {
  padding: 6px 10px;
  font-size: 11px;
  color: var(--danger);
  background: rgba(248, 81, 73, 0.1);
  margin: 4px 8px;
  border-radius: 4px;
}

.sidebar-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  color: var(--text-secondary);
  font-size: 12px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.file-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.file-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: default;
  transition: background 0.1s;
  min-height: 24px;
}

.file-entry-dir {
  cursor: pointer;
}

.file-entry:hover {
  background: var(--hover-bg);
}

.file-entry-parent:hover {
  background: var(--hover-bg);
}

.file-icon-img {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.file-icon-img :deep(svg) {
  width: 100%;
  height: 100%;
}

.file-icon-img-parent {
  color: #54A6F5;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.file-download-btn {
  width: 18px;
  height: 18px;
  border: none;
  background: none;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.file-download-btn:hover {
  color: var(--accent);
  background: var(--accent-bg);
}

.sidebar-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
