<script setup lang="ts">
import { ref } from 'vue'
import { Star, Edit, Delete, Plus } from '@element-plus/icons-vue'
import type { Connection, Group } from '../env.d.ts'

const UNGROUPED_ID = '__ungrouped__'

const props = defineProps<{
  groups: Group[]
  activeGroupId: string | null
  connectionCounts: Record<string, number>
  connections: Connection[]
}>()

const emit = defineEmits<{
  (e: 'select', groupId: string): void
  (e: 'add'): void
  (e: 'rename', group: Group): void
  (e: 'delete', groupId: string): void
  (e: 'setDefault', groupId: string): void
  (e: 'reorder', orderedIds: string[]): void
  (e: 'connect', connectionId: string): void
  (e: 'moveConnection', connectionId: string, groupId: string | null): void
}>()

const editingId = ref<string | null>(null)
const editingName = ref('')
const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)
const dragConnId = ref<string | null>(null)
const dropTargetGroupId = ref<string | null>(null)

function getConnectionsForGroup(groupId: string): Connection[] {
  if (groupId === UNGROUPED_ID) {
    return props.connections.filter((c) => !c.group)
  }
  return props.connections.filter((c) => c.group === groupId)
}

function startRename(group: Group) {
  editingId.value = group.id
  editingName.value = group.name
}

function finishRename(group: Group) {
  if (editingName.value.trim() && editingName.value.trim() !== group.name) {
    emit('rename', { ...group, name: editingName.value.trim() })
  }
  editingId.value = null
}

function cancelRename() {
  editingId.value = null
}

function onDragStart(index: number) {
  if (dragConnId.value) return
  dragIndex.value = index
}

function onDragOver(e: DragEvent, index: number) {
  if (dragConnId.value) return
  e.preventDefault()
  dropIndex.value = index
}

function onDragLeave() {
  dropIndex.value = null
}

function onDrop(e: DragEvent, index: number) {
  e.preventDefault()
  if (dragConnId.value) return
  if (dragIndex.value !== null && dragIndex.value !== index) {
    const ids = props.groups.map((g) => g.id)
    const [moved] = ids.splice(dragIndex.value, 1)
    ids.splice(index, 0, moved)
    emit('reorder', ids)
  }
  dragIndex.value = null
  dropIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  dropIndex.value = null
}

function onConnDragStart(e: DragEvent, connId: string) {
  dragConnId.value = connId
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-lite-ssh-conn', connId)
  }
}

function onConnDragEnd() {
  dragConnId.value = null
  dropTargetGroupId.value = null
}

function onGroupDragOverConn(e: DragEvent, groupId: string) {
  if (!dragConnId.value && !e.dataTransfer?.types.includes('application/x-lite-ssh-conn')) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropTargetGroupId.value = groupId
}

function onGroupDragLeaveConn() {
  dropTargetGroupId.value = null
}

function onGroupDropConn(e: DragEvent, groupId: string) {
  e.preventDefault()
  const connId = dragConnId.value || e.dataTransfer?.getData('application/x-lite-ssh-conn')
  if (connId) {
    emit('moveConnection', connId, groupId)
  }
  dragConnId.value = null
  dropTargetGroupId.value = null
}

function onUngroupedDropConn(e: DragEvent) {
  e.preventDefault()
  const connId = dragConnId.value || e.dataTransfer?.getData('application/x-lite-ssh-conn')
  if (connId) {
    emit('moveConnection', connId, null)
  }
  dragConnId.value = null
  dropTargetGroupId.value = null
}

function onUngroupedDragOverConn(e: DragEvent) {
  if (!dragConnId.value && !e.dataTransfer?.types.includes('application/x-lite-ssh-conn')) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropTargetGroupId.value = UNGROUPED_ID
}
</script>

<template>
  <div class="group-panel">
    <div class="group-panel-title">分组</div>
    <div class="group-list">
      <template v-for="(group, index) in groups" :key="group.id">
        <div
          class="group-item"
          :class="{
            active: group.id === activeGroupId,
            dragging: dragIndex === index,
            'drop-above': dropIndex === index && dragIndex !== null && dragIndex < index,
            'drop-below': dropIndex === index && dragIndex !== null && dragIndex > index,
            'drop-target': dropTargetGroupId === group.id,
          }"
          draggable="true"
          @click="emit('select', group.id)"
          @dragstart="onDragStart(index)"
          @dragover="onDragOver($event, index); onGroupDragOverConn($event, group.id)"
          @dragleave="onDragLeave; onGroupDragLeaveConn"
          @drop="onDrop($event, index); onGroupDropConn($event, group.id)"
          @dragend="onDragEnd"
        >
          <div v-if="dropIndex === index && dragIndex !== null && dragIndex < index" class="drop-indicator top"></div>
          <div class="group-item-content">
            <span v-if="group.isDefault" class="default-star" title="默认分组">
              <el-icon :size="12"><Star /></el-icon>
            </span>
            <template v-if="editingId === group.id">
              <input
                v-model="editingName"
                class="rename-input"
                @keyup.enter="finishRename(group)"
                @keyup.escape="cancelRename"
                @blur="finishRename(group)"
                @click.stop
              />
            </template>
            <template v-else>
              <span class="group-name">{{ group.name }}</span>
              <span class="group-count" v-if="connectionCounts[group.id]">{{ connectionCounts[group.id] }}</span>
            </template>
          </div>
          <div v-if="editingId !== group.id" class="group-actions">
            <el-tooltip content="重命名" placement="right">
              <button class="icon-btn-tiny" @click.stop="startRename(group)">
                <el-icon :size="12"><Edit /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip v-if="!group.isDefault" content="设为默认" placement="right">
              <button class="icon-btn-tiny" @click.stop="emit('setDefault', group.id)">
                <el-icon :size="12"><Star /></el-icon>
              </button>
            </el-tooltip>
            <el-tooltip content="删除" placement="right">
              <button class="icon-btn-tiny danger" @click.stop="emit('delete', group.id)">
                <el-icon :size="12"><Delete /></el-icon>
              </button>
            </el-tooltip>
          </div>
          <div v-if="dropIndex === index && dragIndex !== null && dragIndex > index" class="drop-indicator bottom"></div>
        </div>
        <div class="group-connections">
          <div
            v-for="conn in getConnectionsForGroup(group.id)"
            :key="conn.id"
            class="sidebar-conn"
            :class="{ dragging: dragConnId === conn.id }"
            draggable="true"
            @dblclick="emit('connect', conn.id)"
            @dragstart="onConnDragStart($event, conn.id)"
            @dragend="onConnDragEnd"
          >
            <span class="sidebar-conn-dot"></span>
            <span class="sidebar-conn-name" :title="conn.name">{{ conn.name }}</span>
          </div>
        </div>
      </template>

      <div
        class="group-item ungrouped"
        :class="{ active: UNGROUPED_ID === activeGroupId, 'drop-target': dropTargetGroupId === UNGROUPED_ID }"
        @click="emit('select', UNGROUPED_ID)"
        @dragover="onUngroupedDragOverConn"
        @dragleave="onGroupDragLeaveConn"
        @drop="onUngroupedDropConn"
      >
        <div class="group-item-content">
          <span class="group-name">未分组</span>
          <span class="group-count" v-if="connectionCounts[UNGROUPED_ID]">{{ connectionCounts[UNGROUPED_ID] }}</span>
        </div>
      </div>
      <div class="group-connections">
        <div
          v-for="conn in getConnectionsForGroup(UNGROUPED_ID)"
          :key="conn.id"
          class="sidebar-conn"
          :class="{ dragging: dragConnId === conn.id }"
          draggable="true"
          @dblclick="emit('connect', conn.id)"
          @dragstart="onConnDragStart($event, conn.id)"
          @dragend="onConnDragEnd"
        >
          <span class="sidebar-conn-dot"></span>
          <span class="sidebar-conn-name" :title="conn.name">{{ conn.name }}</span>
        </div>
      </div>
    </div>

    <div class="group-panel-footer">
      <button class="add-group-btn" @click="emit('add')">
        <el-icon><Plus /></el-icon>
        <span>新建分组</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.group-panel {
  width: 220px;
  min-width: 220px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  user-select: none;
}

.group-panel-title {
  padding: 16px 16px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.group-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.group-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 1px;
}

.group-item:hover {
  background: var(--bg-tertiary);
}

.group-item.active {
  background: var(--bg-tertiary);
}

.group-item.dragging {
  opacity: 0.4;
}

.group-item-content {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.group-name {
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.default-star {
  color: var(--warning);
  display: flex;
  align-items: center;
}

.group-actions {
  display: flex;
  gap: 1px;
  opacity: 0;
  transition: opacity 0.15s;
}

.group-item:hover .group-actions {
  opacity: 1;
}

.icon-btn-tiny {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: all 0.15s;
}

.icon-btn-tiny:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
}

.icon-btn-tiny.danger:hover {
  color: var(--danger);
}

.rename-input {
  width: 100%;
  padding: 2px 6px;
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.drop-indicator {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
}

.drop-indicator.top {
  top: -1px;
}

.drop-indicator.bottom {
  bottom: -1px;
}

.ungrouped {
  cursor: default;
}

.group-item.drop-target {
  outline: 2px dashed var(--accent);
  outline-offset: -2px;
  background: var(--accent-bg);
}

.sidebar-conn.dragging {
  opacity: 0.4;
}

.group-panel-footer {
  padding: 12px;
  border-top: 1px solid var(--border-color);
}

.add-group-btn {
  width: 100%;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
  color: var(--accent);
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.add-group-btn:hover {
  background: var(--accent-bg);
  border-color: var(--accent);
}

.group-connections {
  padding: 0 4px 2px 4px;
}

.sidebar-conn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 24px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.sidebar-conn:hover {
  background: var(--bg-tertiary);
}

.sidebar-conn-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
  opacity: 0.6;
}

.sidebar-conn-name {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-conn:hover .sidebar-conn-name {
  color: var(--text-primary);
}
</style>
