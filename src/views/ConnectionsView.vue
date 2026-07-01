<script setup lang="ts">
import { defineAsyncComponent, ref, computed, onBeforeUnmount, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { Search, Plus, Download, Upload } from '@element-plus/icons-vue'
import GroupPanel from '../components/GroupPanel.vue'
import ConnectionRow from '../components/ConnectionRow.vue'
import type { Connection, Group, SavedCredential } from '../env.d.ts'

const ConnectionForm = defineAsyncComponent(() => import('../components/ConnectionForm.vue'))

const UNGROUPED_ID = '__ungrouped__'

interface TestStatus {
  state: 'idle' | 'testing' | 'success' | 'error'
  latency?: number
  error?: string
}

const emit = defineEmits<{
  (e: 'connect', connectionId: string): void
  (e: 'connection-saved', connection: Connection): void
}>()

const props = withDefaults(defineProps<{
  initialData?: {
    connections: Connection[]
    groups: Group[]
  } | null
  initialDataPending?: boolean
}>(), {
  initialData: null,
  initialDataPending: false,
})

const connections = ref<Connection[]>([])
const groups = ref<Group[]>([])
const activeGroupId = ref<string | null>(null)
const searchQuery = ref('')
const showForm = ref(false)
const editingConnection = ref<Connection | null>(null)
const testStatuses = ref<Map<string, TestStatus>>(new Map())
const testTimers = ref<Map<string, ReturnType<typeof setTimeout>>>(new Map())
const importing = ref(false)
const initialized = ref(false)
const showCredentialManager = ref(false)
const savedCredentials = ref<SavedCredential[]>([])
const credentialPasswords = ref<Record<string, string>>({})
const credentialLoading = ref(false)
const credentialSaving = ref(false)
const credentialPasswordVisible = ref(false)
const credentialForm = ref({
  id: '',
  name: '',
  username: '',
  password: '',
})

const credentialFormTitle = computed(() => credentialForm.value.id ? '编辑凭据' : '新建凭据')

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

watch(
  () => [props.initialData, props.initialDataPending] as const,
  async ([initialData, initialDataPending]) => {
    if (initialized.value) return

    if (initialData) {
      connections.value = [...initialData.connections]
      groups.value = [...initialData.groups]
      selectInitialGroup()
      initialized.value = true
      return
    }

    if (initialDataPending) return

    await loadData()
    selectInitialGroup()
    initialized.value = true
  },
  { immediate: true },
)

async function loadData() {
  const [nextConnections, nextGroups] = await Promise.all([
    window.liteSSH.getConnections(),
    window.liteSSH.getGroups(),
  ])
  connections.value = nextConnections
  groups.value = nextGroups
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

async function onSetDefault(groupId: string | null) {
  await window.liteSSH.setDefaultGroup(groupId)
  await loadData()
}

async function onReorderGroups(orderedIds: string[]) {
  await window.liteSSH.reorderGroups(orderedIds)
  await loadData()
}

async function onMoveConnection(connectionId: string, groupId: string | null) {
  await window.liteSSH.updateConnectionGroup(connectionId, groupId || undefined)
  ElMessage.success('已移动')
  await loadData()
}

function onAddConnection() {
  editingConnection.value = null
  showForm.value = true
}

async function loadSavedCredentials() {
  credentialLoading.value = true
  try {
    savedCredentials.value = await window.liteSSH.getSavedCredentials()
  } finally {
    credentialLoading.value = false
  }
}

async function openCredentialManager() {
  showCredentialManager.value = true
  credentialPasswords.value = {}
  resetCredentialForm()
  await loadSavedCredentials()
}

function closeCredentialManager() {
  showCredentialManager.value = false
  credentialPasswords.value = {}
  resetCredentialForm()
}

function resetCredentialForm() {
  credentialForm.value = {
    id: '',
    name: '',
    username: '',
    password: '',
  }
  credentialPasswordVisible.value = false
}

async function editCredential(credential: SavedCredential) {
  const password = await window.liteSSH.getSavedCredentialPassword(credential.id)
  credentialForm.value = {
    id: credential.id,
    name: credential.name,
    username: credential.username,
    password,
  }
  credentialPasswordVisible.value = false
}

async function saveCredential() {
  if (!credentialForm.value.name.trim()) {
    ElMessage.warning('请输入凭据名称')
    return
  }
  if (!credentialForm.value.username.trim()) {
    ElMessage.warning('请输入用户名')
    return
  }
  if (!credentialForm.value.password) {
    ElMessage.warning('请输入密码')
    return
  }

  credentialSaving.value = true
  try {
    await window.liteSSH.saveSavedCredential({
      ...(credentialForm.value.id ? { id: credentialForm.value.id } : {}),
      name: credentialForm.value.name.trim(),
      username: credentialForm.value.username.trim(),
      password: credentialForm.value.password,
    })
    const savedId = credentialForm.value.id
    await loadSavedCredentials()
    resetCredentialForm()
    ElMessage.success(savedId ? '凭据已更新' : '凭据已保存')
  } catch (err: any) {
    ElMessage.error(err.message || '保存凭据失败')
  } finally {
    credentialSaving.value = false
  }
}

async function toggleCredentialPassword(credential: SavedCredential) {
  if (credentialPasswords.value[credential.id]) {
    const next = { ...credentialPasswords.value }
    delete next[credential.id]
    credentialPasswords.value = next
    return
  }
  const password = await window.liteSSH.getSavedCredentialPassword(credential.id)
  credentialPasswords.value = {
    ...credentialPasswords.value,
    [credential.id]: password,
  }
}

async function deleteCredential(credential: SavedCredential) {
  try {
    await ElMessageBox.confirm(`确定要删除凭据“${credential.name}”吗？`, '删除凭据', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await window.liteSSH.deleteSavedCredential(credential.id)
    const next = { ...credentialPasswords.value }
    delete next[credential.id]
    credentialPasswords.value = next
    if (credentialForm.value.id === credential.id) {
      resetCredentialForm()
    }
    await loadSavedCredentials()
    ElMessage.success('凭据已删除')
  } catch {}
}

function formatCredentialTime(value: number): string {
  if (!value) return '--'
  return new Date(value).toLocaleString()
}

async function handleExport() {
  try {
    const ok = await window.liteSSH.exportConnections()
    if (ok) ElMessage.success('连接配置已导出')
  } catch (err: any) {
    ElMessage.error(err.message || '导出失败')
  }
}

async function handleImport() {
  importing.value = true
  try {
    const result = await window.liteSSH.importConnections()
    if (result) {
      ElMessage.success(`成功导入 ${result.imported}/${result.total} 个连接`)
      await loadData()
      if (activeGroupId.value && !groups.value.some((group) => group.id === activeGroupId.value) && activeGroupId.value !== UNGROUPED_ID) {
        selectInitialGroup()
      }
    }
  } catch (err: any) {
    ElMessage.error(err.message || '导入失败')
  } finally {
    importing.value = false
  }
}

function generateCopyName(originalName: string): string {
  const existingNames = connections.value.map(c => c.name)
  const match = originalName.match(/^(.+?)\s*\((\d+)\)$/)
  let baseName = originalName.trim()
  let counter = 1

  if (match) {
    baseName = match[1].trim()
    counter = parseInt(match[2]) + 1
  }

  while (existingNames.includes(`${baseName} (${counter})`)) {
    counter++
  }
  return `${baseName} (${counter})`
}

async function onCopyConnection(conn: Connection) {
  const password = conn.id
    ? await window.liteSSH.getConnectionPassword(conn.id)
    : conn.password
  editingConnection.value = {
    ...conn,
    id: '',
    password: password || conn.password,
    name: generateCopyName(conn.name),
    createdAt: 0,
    updatedAt: 0,
  }
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

async function onFormSaved(savedConnection: Connection) {
  showForm.value = false
  editingConnection.value = null
  await loadData()
  const refreshed = connections.value.find((conn) => conn.id === savedConnection.id) || savedConnection
  emit('connection-saved', refreshed)
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
      @move-connection="onMoveConnection"
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
        <div class="header-actions">
          <button class="action-btn" :disabled="importing" @click="handleImport" title="导入配置">
            <el-icon><Download /></el-icon>
          </button>
          <button class="action-btn" @click="handleExport" title="导出全部配置">
            <el-icon><Upload /></el-icon>
          </button>
          <button class="credential-manager-btn" @click="openCredentialManager">
            <span>凭据管理</span>
          </button>
          <button class="add-connection-btn" @click="onAddConnection">
            <el-icon><Plus /></el-icon>
            <span>新建连接</span>
          </button>
        </div>
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
          @copy="onCopyConnection"
        />

        <div v-if="filteredConnections.length === 0" class="empty-connections">
          <p v-if="searchQuery">未找到匹配的连接</p>
          <p v-else>当前分组暂无连接</p>
        </div>
      </div>
    </div>

    <div v-if="showCredentialManager" class="credential-overlay" @click.self="closeCredentialManager">
      <div class="credential-modal">
        <button class="credential-close" @click="closeCredentialManager" title="关闭">
          <span>×</span>
        </button>
        <div class="credential-header">
          <div>
            <h3 class="credential-title">凭据管理</h3>
            <p class="credential-subtitle">统一管理可复用的 SSH 用户名和密码</p>
          </div>
          <button class="credential-create-btn" @click="resetCredentialForm">
            <el-icon><Plus /></el-icon>
            <span>新建凭据</span>
          </button>
        </div>

        <form class="credential-form" @submit.prevent="saveCredential">
          <div class="credential-form-title">{{ credentialFormTitle }}</div>
          <div class="credential-form-grid">
            <label class="credential-form-field">
              <span>名称</span>
              <input v-model="credentialForm.name" class="credential-input" placeholder="例如：生产 root" />
            </label>
            <label class="credential-form-field">
              <span>用户名</span>
              <input v-model="credentialForm.username" class="credential-input" placeholder="root" />
            </label>
            <label class="credential-form-field credential-form-password">
              <span>密码</span>
              <div class="credential-password-input">
                <input
                  v-model="credentialForm.password"
                  :type="credentialPasswordVisible ? 'text' : 'password'"
                  class="credential-input"
                  placeholder="SSH 密码"
                />
                <button type="button" class="credential-password-toggle" @click="credentialPasswordVisible = !credentialPasswordVisible">
                  {{ credentialPasswordVisible ? '隐藏' : '显示' }}
                </button>
              </div>
            </label>
          </div>
          <div class="credential-form-actions">
            <button v-if="credentialForm.id" type="button" class="credential-action-btn" @click="resetCredentialForm">取消编辑</button>
            <button type="submit" class="credential-save-btn" :disabled="credentialSaving">
              {{ credentialSaving ? '保存中...' : (credentialForm.id ? '保存修改' : '保存凭据') }}
            </button>
          </div>
        </form>

        <div v-if="credentialLoading" class="credential-empty">正在加载...</div>
        <div v-else-if="savedCredentials.length === 0" class="credential-empty">暂无凭据</div>
        <div v-else class="credential-list">
          <div v-for="credential in savedCredentials" :key="credential.id" class="credential-item">
            <div class="credential-main">
              <div class="credential-name">{{ credential.name }}</div>
              <div class="credential-meta">
                <span>{{ credential.username }}</span>
                <span>更新于 {{ formatCredentialTime(credential.updatedAt || credential.createdAt) }}</span>
              </div>
              <div class="credential-password">
                {{ credentialPasswords[credential.id] ?? '••••••••' }}
              </div>
            </div>
            <div class="credential-actions">
              <button class="credential-action-btn" @click="editCredential(credential)">编辑</button>
              <button class="credential-action-btn" @click="toggleCredentialPassword(credential)">
                {{ credentialPasswords[credential.id] ? '隐藏' : '查看' }}
              </button>
              <button class="credential-action-btn danger" @click="deleteCredential(credential)">删除</button>
            </div>
          </div>
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-tertiary);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.credential-manager-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.credential-manager-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg-tertiary);
}

.credential-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.credential-modal {
  width: 680px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 48px);
  overflow: hidden;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 22px;
  position: relative;
  display: flex;
  flex-direction: column;
}

.credential-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.credential-close:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.credential-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-right: 28px;
  margin-bottom: 18px;
}

.credential-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
}

.credential-subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.credential-create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.credential-create-btn:hover {
  background: var(--accent-hover);
}

.credential-form {
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  margin-bottom: 14px;
}

.credential-form-title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}

.credential-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.credential-form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.credential-form-password {
  grid-column: 1 / -1;
}

.credential-input {
  width: 100%;
  min-width: 0;
  padding: 9px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.credential-input:focus {
  border-color: var(--accent);
}

.credential-password-input {
  display: flex;
}

.credential-password-input .credential-input {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}

.credential-password-toggle {
  width: 64px;
  border: 1px solid var(--border-color);
  border-radius: 0 6px 6px 0;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.credential-password-toggle:hover {
  color: var(--text-primary);
}

.credential-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.credential-save-btn {
  padding: 7px 14px;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.credential-save-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.credential-save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.credential-list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}

.credential-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
}

.credential-main {
  min-width: 0;
}

.credential-name {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 5px;
}

.credential-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 7px;
}

.credential-password {
  color: var(--text-primary);
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  word-break: break-all;
}

.credential-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.credential-action-btn {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
}

.credential-action-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.credential-action-btn.danger:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.credential-empty {
  padding: 48px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
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
