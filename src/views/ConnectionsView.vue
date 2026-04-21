<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import GroupPanel from '../components/GroupPanel.vue'
import ConnectionRow from '../components/ConnectionRow.vue'
import ConnectionForm from '../components/ConnectionForm.vue'
import type { Connection, Group } from '../env.d.ts'

const UNGROUPED_ID = '__ungrouped__'

interface TestStatus {
  state: 'idle' | 'testing' | 'success' | 'error'
  latency?: number
  error?: string
}

const emit = defineEmits<{
  (e: 'connect', connectionId: string): void
}>()

const connections = ref<Connection[]>([])
const groups = ref<Group[]>([])
const activeGroupId = ref<string | null>(null)
const searchQuery = ref('')
const showForm = ref(false)
const editingConnection = ref<Connection | null>(null)
const testStatuses = ref<Map<string, TestStatus>>(new Map())
const testTimers = ref<Map<string, ReturnType<typeof setTimeout>>>(new Map())

const connectionCounts = computed(() => {
  const counts: Record<string, number> = {}
  counts[UNGROUPED_ID] = 0
  for (const g of groups.value) {
    counts[g.id] = 0
  }
  for (const conn of connections.value) {
    if (conn.group && counts[conn.group] !== undefined) {
      counts[conn.group]++
    } else if (!conn.group) {
      counts[UNGROUPED_ID]++
    } else {
      counts[UNGROUPED_ID]++
    }
  }
  return counts
})

const filteredConnections = computed(() => {
  let list = connections.value

  if (activeGroupId.value === UNGROUPED_ID) {
    list = list.filter((c) => !c.group)
  } else if (activeGroupId.value) {
    list = list.filter((c) => c.group === activeGroupId.value)
  }

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.host.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q)
    )
  }

  return list
})

onMounted(async () => {
  await loadData()
  selectInitialGroup()
})

async function loadData() {
  connections.value = await window.liteSSH.getConnections()
  groups.value = await window.liteSSH.getGroups()
}

function selectInitialGroup() {
  const defaultGroup = groups.value.find((g) => g.isDefault)
  if (defaultGroup) {
    activeGroupId.value = defaultGroup.id
  } else if (groups.value.length > 0) {
    activeGroupId.value = groups.value[0].id
  } else {
    activeGroupId.value = UNGROUPED_ID
  }
}

function onSelectGroup(groupId: string) {
  activeGroupId.value = groupId
}

async function onAddGroup() {
  try {
    const { value } = await ElMessageBox.prompt('请输入分组名称', '新建分组', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '分组名称不能为空',
    })
    const saved = await window.liteSSH.saveGroup({ name: value.trim() })
    await loadData()
    activeGroupId.value = saved.id
  } catch {}
}

async function onRenameGroup(group: Group) {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的分组名称', '重命名分组', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: group.name,
      inputPattern: /\S+/,
      inputErrorMessage: '分组名称不能为空',
    })
    await window.liteSSH.saveGroup({ id: group.id, name: value.trim() })
    await loadData()
  } catch {}
}

async function onDeleteGroup(groupId: string) {
  try {
    await ElMessageBox.confirm('删除分组后，该分组下的连接将移至"未分组"', '确认删除分组', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await window.liteSSH.deleteGroup(groupId)
    await loadData()
    if (activeGroupId.value === groupId) {
      selectInitialGroup()
    }
  } catch {}
}

async function onSetDefault(groupId: string) {
  await window.liteSSH.setDefaultGroup(groupId)
  await loadData()
}

async function onReorderGroups(orderedIds: string[]) {
  await window.liteSSH.reorderGroups(orderedIds)
  await loadData()
}

function onAddConnection() {
  editingConnection.value = null
  showForm.value = true
}

function onEditConnection(conn: Connection) {
  editingConnection.value = { ...conn }
  showForm.value = true
}

async function onDeleteConnection(connectionId: string) {
  const conn = connections.value.find((c) => c.id === connectionId)
  if (!conn) return
  try {
    await ElMessageBox.confirm(`确定要删除连接 "${conn.name}" 吗？`, '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await window.liteSSH.deleteConnection(connectionId)
    ElMessage.success('已删除')
    await loadData()
  } catch {}
}

async function onTestConnection(connectionId: string) {
  clearTestTimer(connectionId)
  testStatuses.value.set(connectionId, { state: 'testing' })

  try {
    const result = await window.liteSSH.sshTestConnection(connectionId)
    if (result.ok) {
      testStatuses.value.set(connectionId, { state: 'success', latency: result.latency })
      const timer = setTimeout(() => {
        if (testStatuses.value.get(connectionId)?.state === 'success') {
          testStatuses.value.delete(connectionId)
        }
      }, 10000)
      testTimers.value.set(connectionId, timer)
    } else {
      testStatuses.value.set(connectionId, { state: 'error', error: result.error || '连接失败' })
      const timer = setTimeout(() => {
        if (testStatuses.value.get(connectionId)?.state === 'error') {
          testStatuses.value.delete(connectionId)
        }
      }, 10000)
      testTimers.value.set(connectionId, timer)
    }
  } catch (err: any) {
    testStatuses.value.set(connectionId, { state: 'error', error: err.message || '测试失败' })
    const timer = setTimeout(() => {
      if (testStatuses.value.get(connectionId)?.state === 'error') {
        testStatuses.value.delete(connectionId)
      }
    }, 10000)
    testTimers.value.set(connectionId, timer)
  }
}

function clearTestTimer(connectionId: string) {
  const timer = testTimers.value.get(connectionId)
  if (timer) {
    clearTimeout(timer)
    testTimers.value.delete(connectionId)
  }
}

function getTestStatus(connectionId: string): TestStatus {
  return testStatuses.value.get(connectionId) || { state: 'idle' }
}

async function onFormSaved() {
  showForm.value = false
  editingConnection.value = null
  await loadData()
}

function onFormCancel() {
  showForm.value = false
  editingConnection.value = null
}

function onConnectFromRow(connectionId: string) {
  emit('connect', connectionId)
}

onBeforeUnmount(() => {
  for (const [, timer] of testTimers.value) {
    clearTimeout(timer)
  }
})

defineExpose({ loadData })
</script>

<template>
  <div class="connections-page">
    <GroupPanel
      :groups="groups"
      :active-group-id="activeGroupId"
      :connection-counts="connectionCounts"
      :connections="connections"
      @select="onSelectGroup"
      @add="onAddGroup"
      @rename="onRenameGroup"
      @delete="onDeleteGroup"
      @set-default="onSetDefault"
      @reorder="onReorderGroups"
      @connect="onConnectFromRow"
    />

    <div class="connections-main">
      <div class="connections-header">
        <div class="search-box">
          <el-icon class="search-icon"><Search /></el-icon>
          <input
            v-model="searchQuery"
            placeholder="搜索连接..."
            class="search-input"
          />
        </div>
        <button class="add-connection-btn" @click="onAddConnection">
          <el-icon><Plus /></el-icon>
          <span>新建连接</span>
        </button>
      </div>

      <div class="connections-list">
        <ConnectionRow
          v-for="conn in filteredConnections"
          :key="conn.id"
          :connection="conn"
          :test-status="getTestStatus(conn.id)"
          @connect="onConnectFromRow"
          @test="onTestConnection"
          @edit="onEditConnection"
          @delete="onDeleteConnection"
        />

        <div v-if="filteredConnections.length === 0" class="empty-connections">
          <p v-if="searchQuery">未找到匹配的连接</p>
          <p v-else>当前分组暂无连接</p>
        </div>
      </div>
    </div>

    <ConnectionForm
      v-if="showForm"
      :connection="editingConnection"
      :default-group-id="activeGroupId === UNGROUPED_ID ? undefined : activeGroupId || undefined"
      @saved="onFormSaved"
      @cancel="onFormCancel"
    />
  </div>
</template>

<style scoped>
.connections-page {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.connections-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 20px 24px;
}

.connections-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.search-box {
  position: relative;
  flex: 1;
  max-width: 400px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 9px 12px 9px 36px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-bg);
}

.search-input::placeholder {
  color: var(--text-secondary);
}

.add-connection-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}

.add-connection-btn:hover {
  background: var(--accent-hover);
}

.connections-list {
  flex: 1;
  overflow-y: auto;
}

.empty-connections {
  text-align: center;
  padding: 60px 16px;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
