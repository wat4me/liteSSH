<script setup lang="ts">
import { ref, computed } from 'vue'
import { Close, Plus } from '@element-plus/icons-vue'
import SettingsPanel from './SettingsPanel.vue'
import type { Connection } from '../env.d.ts'

const HOME_ID = '__home__'

const props = defineProps<{
  groups: { connectionId: string; connectionName: string; sessions: { id: string }[] }[]
  activeGroupId: string | null
  recentConnections: Connection[]
  latencyMap: Record<string, number> | null
  latencyEnabled: boolean
}>()

const emit = defineEmits<{
  (e: 'select', connectionId: string): void
  (e: 'close', connectionId: string): void
  (e: 'select-home'): void
  (e: 'quick-connect', connectionId: string): void
}>()

const showSettings = ref(false)
const showQuickConnect = ref(false)
const isHomeActive = computed(() => props.activeGroupId === HOME_ID)

function formatLatency(ms: number): string {
  if (ms < 0) return '✕'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function latencyColor(ms: number): string {
  if (ms < 0) return 'var(--danger)'
  if (ms < 200) return 'var(--success)'
  if (ms < 500) return '#e5a000'
  return 'var(--danger)'
}
</script>

<template>
  <div class="tab-bar">
    <div class="tabs-scroll">
      <div
        class="tab home-tab"
        :class="{ active: activeGroupId === HOME_ID }"
        @click="emit('select-home')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span class="tab-name">连接管理</span>
      </div>

      <div class="tab-separator" v-if="groups.length > 0"></div>

      <div
        v-for="group in groups"
        :key="group.connectionId"
        class="tab"
        :class="{ active: group.connectionId === activeGroupId }"
        @click="emit('select', group.connectionId)"
      >
        <div class="tab-indicator"></div>
        <span class="tab-name">{{ group.connectionName }}</span>
        <span v-if="group.sessions.length > 1" class="tab-count">{{ group.sessions.length }}</span>
        <span
          v-if="latencyEnabled && latencyMap && latencyMap[group.connectionId] !== undefined"
          class="tab-latency"
          :style="{ color: latencyColor(latencyMap[group.connectionId]) }"
        >{{ formatLatency(latencyMap[group.connectionId]) }}</span>
        <button class="tab-close" @click.stop="emit('close', group.connectionId)">
          <el-icon :size="12"><Close /></el-icon>
        </button>
      </div>
    </div>

    <div class="quick-connect-wrapper">
      <button
        class="tab-add-btn"
        :class="{ active: showQuickConnect }"
        @click.stop="showQuickConnect = !showQuickConnect; showSettings = false"
        title="快速连接"
      >
        <el-icon :size="14"><Plus /></el-icon>
      </button>
      <div v-if="showQuickConnect" class="settings-overlay" @click="showQuickConnect = false"></div>
      <div v-if="showQuickConnect" class="quick-connect-dropdown" @click.stop>
        <div class="quick-connect-title">最近连接</div>
        <button
          v-for="connection in recentConnections"
          :key="connection.id"
          class="recent-connection-item"
          @click="showQuickConnect = false; emit('quick-connect', connection.id)"
        >
          <span class="recent-connection-name">{{ connection.name }}</span>
          <span class="recent-connection-meta">{{ connection.username }}@{{ connection.host }}:{{ connection.port }}</span>
        </button>
        <div v-if="recentConnections.length === 0" class="quick-connect-empty">暂无最近连接</div>
        <button class="quick-connect-manage" @click="showQuickConnect = false; emit('select-home')">
          打开连接管理
        </button>
      </div>
    </div>

    <div v-if="isHomeActive" class="tab-right-actions">
      <div class="settings-wrapper">
        <button class="toolbar-btn" :class="{ active: showSettings }" @click.stop="showSettings = !showSettings; showQuickConnect = false" title="设置">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <div v-if="showSettings" class="settings-overlay" @click="showSettings = false"></div>
        <div v-if="showSettings" class="settings-dropdown" @click.stop>
          <SettingsPanel @close="showSettings = false" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  height: var(--tab-height);
  min-height: var(--tab-height);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding-right: 46px;
  transition: background-color 0.3s, border-color 0.3s;
  -webkit-app-region: no-drag;
}

.tabs-scroll {
  display: flex;
  height: 100%;
  flex: 1;
  overflow-x: auto;
  align-items: center;
  padding-left: 4px;
}

.tabs-scroll::-webkit-scrollbar {
  height: 0;
}

.tab-separator {
  width: 1px;
  height: 18px;
  background: var(--border-color);
  margin: 0 4px;
  flex-shrink: 0;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  height: 100%;
  cursor: pointer;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-secondary);
  transition: all 0.15s;
  user-select: none;
  position: relative;
  flex-shrink: 0;
}

.tab::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: transparent;
  transition: background 0.2s;
}

.tab:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.tab.active {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.tab.active::after {
  background: var(--accent);
}

.home-tab {
  gap: 6px;
  padding: 0 12px;
}

.home-tab svg {
  flex-shrink: 0;
}

.tab-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
}

.tab-name {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.tab-count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tab-latency {
  font-size: 10px;
  font-weight: 600;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  opacity: 0.85;
  margin-left: 2px;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: all 0.15s;
  opacity: 0.5;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: rgba(248, 81, 73, 0.15);
  color: var(--danger);
}

.tab-add-btn {
  width: 28px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.tab-add-btn:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.tab-add-btn.active {
  color: var(--accent);
  background: var(--accent-bg);
}

.tab-right-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding-right: 4px;
  height: 100%;
  position: relative;
}

.tab-right-actions:not(:empty) {
  border-left: 1px solid var(--border-color);
}

.toolbar-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
}

.toolbar-btn.active {
  color: var(--accent);
  background: var(--accent-bg);
}

.quick-connect-wrapper {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
}

.settings-wrapper {
  position: relative;
}

.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.settings-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 10001;
}

.quick-connect-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  right: 0;
  z-index: 10000;
  width: 320px;
  padding: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

.quick-connect-title {
  padding: 4px 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.recent-connection-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.recent-connection-item:hover {
  background: var(--hover-bg);
}

.recent-connection-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.recent-connection-meta {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.quick-connect-empty {
  padding: 12px 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

.quick-connect-manage {
  width: 100%;
  margin-top: 6px;
  padding: 8px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-connect-manage:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
