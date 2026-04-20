<script setup lang="ts">
import { ref } from 'vue'
import { Close } from '@element-plus/icons-vue'
import type { Theme } from '../composables/useTheme'

const HOME_ID = '__home__'

defineProps<{
  groups: { connectionId: string; connectionName: string; sessions: { id: string }[] }[]
  activeGroupId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', connectionId: string): void
  (e: 'close', connectionId: string): void
  (e: 'select-home'): void
  (e: 'cycle-theme'): void
  (e: 'set-theme', theme: Theme): void
}>()

const showThemePicker = ref(false)

const themeOptions: { value: Theme; label: string; icon: string }[] = [
  { value: 'dark', label: '深色', icon: '🌙' },
  { value: 'light', label: '浅色', icon: '☀️' },
  { value: 'eyecare', label: '护眼', icon: '🍃' },
]

function selectTheme(t: Theme) {
  emit('set-theme', t)
  showThemePicker.value = false
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
        <button class="tab-close" @click.stop="emit('close', group.connectionId)">
          <el-icon :size="12"><Close /></el-icon>
        </button>
      </div>
    </div>

    <div class="tab-right-actions">
      <div class="theme-picker-wrapper">
        <button class="toolbar-btn" @click.stop="showThemePicker = !showThemePicker" title="切换主题">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </button>
        <Transition name="popup">
          <div v-if="showThemePicker" class="theme-picker" @click.stop>
            <div class="theme-picker-label">主题</div>
            <button
              v-for="opt in themeOptions"
              :key="opt.value"
              class="theme-option"
              @click="selectTheme(opt.value)"
            >
              <span class="theme-option-icon">{{ opt.icon }}</span>
              <span>{{ opt.label }}</span>
            </button>
          </div>
        </Transition>
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
  overflow: hidden;
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

.theme-picker-wrapper {
  position: relative;
}

.theme-picker {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 6px;
  min-width: 140px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  z-index: 100;
}

.theme-picker-label {
  font-size: 11px;
  color: var(--text-secondary);
  padding: 4px 10px 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.theme-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
}

.theme-option:hover {
  background: var(--bg-tertiary);
}

.theme-option-icon {
  width: 20px;
  text-align: center;
  font-size: 14px;
}

.popup-enter-active,
.popup-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
