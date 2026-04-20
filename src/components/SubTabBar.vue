<script setup lang="ts">
import { Close, Plus } from '@element-plus/icons-vue'

defineProps<{
  sessions: { id: string; connectionName: string; tabNumber: number }[]
  activeSessionId: string | null
  connectionId: string
}>()

const emit = defineEmits<{
  (e: 'select', sessionId: string): void
  (e: 'close', sessionId: string): void
  (e: 'add', connectionId: string): void
}>()
</script>

<template>
  <div class="sub-tab-bar">
    <div class="sub-tabs-scroll">
      <div
        v-for="(session, index) in sessions"
        :key="session.id"
        class="sub-tab"
        :class="{ active: session.id === activeSessionId }"
        @click="emit('select', session.id)"
      >
        <span class="sub-tab-label">终端 {{ session.tabNumber }}</span>
        <button class="sub-tab-close" @click.stop="emit('close', session.id)">
          <el-icon :size="10"><Close /></el-icon>
        </button>
      </div>
      <button class="sub-tab-add" @click="emit('add', connectionId)" title="新建窗口">
        <el-icon :size="12"><Plus /></el-icon>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sub-tab-bar {
  height: 30px;
  min-height: 30px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding-left: 8px;
}

.sub-tabs-scroll {
  display: flex;
  height: 100%;
  align-items: center;
  gap: 2px;
}

.sub-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: 22px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-secondary);
  transition: all 0.15s;
  user-select: none;
  background: transparent;
}

.sub-tab:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sub-tab.active {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sub-tab-label {
  font-weight: 500;
  min-width: 8px;
  text-align: center;
}

.sub-tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 1px;
  border-radius: 3px;
  transition: all 0.15s;
  opacity: 0.5;
}

.sub-tab:hover .sub-tab-close {
  opacity: 1;
}

.sub-tab-close:hover {
  opacity: 1;
  background: rgba(248, 81, 73, 0.15);
  color: var(--danger);
}

.sub-tab-add {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.sub-tab-add:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-bg);
}
</style>
