<script setup lang="ts">
import { ref } from 'vue'
import { Close } from '@element-plus/icons-vue'
import SettingsPanel from './SettingsPanel.vue'

const HOME_ID = '__home__'

defineProps<{
  groups: { connectionId: string; connectionName: string; sessions: { id: string }[] }[]
  activeGroupId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', connectionId: string): void
  (e: 'close', connectionId: string): void
  (e: 'select-home'): void
}>()

const showSettings = ref(false)
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
        <button class="tab-close" @click.stop="emit('close', group.connectionId)">
          <el-icon :size="12"><Close /></el-icon>
        </button>
      </div>
    </div>

    <div class="tab-right-actions">
      <div class="settings-wrapper">
        <button class="toolbar-btn" :class="{ active: showSettings }" @click.stop="showSettings = !showSettings" title="设置">
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
  transition: background-color 0.3s, border-color 0.3s;
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

.tab-right-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding-right: 4px;
  border-left: 1px solid var(--border-color);
  height: 100%;
  position: relative;
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

.settings-wrapper {
  position: relative;
}

.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
}

.settings-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1000;
}
</style>