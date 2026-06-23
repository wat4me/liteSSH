<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { FileEntry } from '../env.d.ts'
import { formatSize } from '../utils/format'
import { getFileIcon } from '../utils/fileIcons'

const props = defineProps<{
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

const INITIAL_FILE_LIMIT = 20
const fileLimit = ref(INITIAL_FILE_LIMIT)
const searchQuery = ref('')
const searchVisible = ref(false)
let searchInputRef: HTMLInputElement | null = null

const setSearchInputRef = (el: any) => {
  searchInputRef = el as HTMLInputElement | null
}

const filteredFiles = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return props.files
  return props.files.filter(entry =>
    entry.name.toLowerCase().includes(query)
  )
})

const directories = computed(() => filteredFiles.value.filter(entry => entry.isDirectory || entry.isSymlink))
const regularFiles = computed(() => filteredFiles.value.filter(entry => !entry.isDirectory && !entry.isSymlink))
const visibleFiles = computed(() => regularFiles.value.slice(0, fileLimit.value))
const hiddenFileCount = computed(() => Math.max(0, regularFiles.value.length - visibleFiles.value.length))
const visibleEntries = computed(() => [...directories.value, ...visibleFiles.value])
const isSearching = computed(() => searchQuery.value.trim().length > 0)

function showMoreFiles() {
  fileLimit.value += INITIAL_FILE_LIMIT
}

function showAllFiles() {
  fileLimit.value = regularFiles.value.length
}

function toggleSearch() {
  searchVisible.value = !searchVisible.value
  if (searchVisible.value) {
    searchQuery.value = ''
    nextTick(() => {
      searchInputRef?.focus()
      searchInputRef?.select()
    })
  } else {
    searchQuery.value = ''
  }
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    toggleSearch()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    e.stopPropagation()
    toggleSearch()
  }
}

watch(() => props.currentPath, () => {
  fileLimit.value = INITIAL_FILE_LIMIT
  searchQuery.value = ''
  searchVisible.value = false
})

defineExpose({ toggleSearch, handleKeydown })
</script>

<template>
  <div class="file-list-container" @keydown="handleKeydown" tabindex="0">
    <div v-if="searchVisible" class="file-search-bar">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        :ref="setSearchInputRef"
        v-model="searchQuery"
        class="file-search-input"
        placeholder="搜索文件..."
        @keydown="onSearchKeydown"
      />
      <span v-if="isSearching" class="search-count">{{ filteredFiles.length }} 个结果</span>
      <button class="file-search-close" @click="toggleSearch" title="关闭搜索">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div v-if="error" class="sidebar-error">{{ error }}</div>

    <div v-if="loading && files.length === 0" class="sidebar-loading">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <span>加载中...</span>
    </div>

    <div class="file-list" v-else>
      <div
        v-if="currentPath !== '/' && !isSearching"
        class="file-entry file-entry-parent"
        @click="emit('goUp')"
      >
        <span class="file-icon-img file-icon-img-parent" v-html="getFileIcon('', true, false)"></span>
        <span class="file-name">..</span>
      </div>

      <div
        v-for="entry in visibleEntries"
        :key="entry.path"
        class="file-entry"
        :class="{ 'file-entry-dir': entry.isDirectory || entry.isSymlink }"
        @click="entry.isDirectory || entry.isSymlink ? emit('navigate', entry) : undefined"
        @contextmenu="emit('contextMenu', $event, entry)"
      >
        <span class="file-icon-img" v-html="getFileIcon(entry.name, entry.isDirectory, entry.isSymlink)"></span>
        <span class="file-name" :title="entry.name">
          <template v-if="isSearching">
            <template v-for="(part, idx) in highlightMatch(entry.name, searchQuery)" :key="idx">
              <mark v-if="part.highlight" class="search-highlight">{{ part.text }}</mark>
              <span v-else>{{ part.text }}</span>
            </template>
          </template>
          <template v-else>{{ entry.name }}</template>
        </span>
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

      <div v-if="hiddenFileCount > 0 && !isSearching" class="file-list-more">
        <span>已显示全部 {{ directories.length }} 个目录，文件显示 {{ visibleFiles.length }} / {{ regularFiles.length }}</span>
        <div class="file-list-more-actions">
          <button class="file-list-more-btn" @click="showMoreFiles">再显示 20 个文件</button>
          <button class="file-list-more-btn" @click="showAllFiles">显示全部文件</button>
        </div>
      </div>

      <div v-if="isSearching && filteredFiles.length === 0" class="sidebar-empty">
        未找到匹配 "{{ searchQuery }}" 的文件
      </div>

      <div v-if="files.length === 0 && currentPath && !loading && !isSearching" class="sidebar-empty">
        空目录
      </div>
    </div>
  </div>
</template>

<script lang="ts">
function highlightMatch(text: string, query: string): { text: string; highlight: boolean }[] {
  if (!query.trim()) return [{ text, highlight: false }]
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase().trim()
  const parts: { text: string; highlight: boolean }[] = []
  let lastIndex = 0
  let searchIndex = 0

  while (searchIndex < text.length) {
    const matchIndex = lowerText.indexOf(lowerQuery, searchIndex)
    if (matchIndex === -1) break

    if (matchIndex > lastIndex) {
      parts.push({ text: text.slice(lastIndex, matchIndex), highlight: false })
    }
    parts.push({ text: text.slice(matchIndex, matchIndex + lowerQuery.length), highlight: true })
    lastIndex = matchIndex + lowerQuery.length
    searchIndex = lastIndex
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false })
  }

  return parts.length > 0 ? parts : [{ text, highlight: false }]
}
</script>

<style scoped>
.file-list-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  outline: none;
}

.file-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.file-search-bar svg {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.file-search-input {
  flex: 1;
  padding: 3px 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 11px;
  outline: none;
}

.file-search-input:focus {
  border-color: var(--accent);
}

.search-count {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.file-search-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 3px;
  flex-shrink: 0;
}

.file-search-close:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

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
  gap: 8px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: default;
  transition: background 0.12s, transform 0.12s;
  min-height: 28px;
  border-radius: 6px;
  margin: 1px 6px;
}

.file-entry-dir {
  cursor: pointer;
}

.file-entry:hover {
  background: var(--hover-bg);
  transform: translateX(1px);
}

.file-entry-parent:hover {
  background: var(--hover-bg);
}

.file-icon-img {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--hover-bg) 68%, transparent);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.file-icon-img :deep(svg) {
  width: 18px;
  height: 18px;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.18));
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

.search-highlight {
  background: var(--accent);
  color: #fff;
  border-radius: 2px;
  padding: 0 1px;
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

.file-list-more {
  margin: 8px 10px 10px;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-tertiary) 70%, transparent);
  color: var(--text-secondary);
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.file-list-more-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.file-list-more-btn {
  border: none;
  background: var(--button-bg);
  color: var(--text-primary);
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
}

.file-list-more-btn:hover {
  background: var(--hover-bg);
}

.sidebar-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
