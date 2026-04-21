<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { Connection, Group } from '../env.d.ts'

const props = defineProps<{
  connection: Connection | null
  defaultGroupId?: string
}>()

const emit = defineEmits<{
  (e: 'saved'): void
  (e: 'cancel'): void
}>()

const form = ref({
  name: '',
  host: '',
  port: 22,
  username: '',
  password: '',
  group: '' as string | undefined,
})

const groups = ref<Group[]>([])
const saving = ref(false)
const showPassword = ref(false)

type TestState = 'idle' | 'testing' | 'success' | 'error'
const testState = ref<TestState>('idle')
const testLatency = ref(0)
const testError = ref('')
let testTimer: ReturnType<typeof setTimeout> | null = null

type DiagnoseState = 'idle' | 'testing' | 'success' | 'error'
interface DiagnoseResult {
  ok: boolean
  tcpLatency?: number
  sshReadyLatency?: number
  shellOpenLatency?: number
  shellFirstByteLatency?: number
  totalLatency?: number
  error?: string
}
const diagnoseState = ref<DiagnoseState>('idle')
const diagnoseResult = ref<DiagnoseResult | null>(null)

onMounted(async () => {
  groups.value = await window.liteSSH.getGroups()

  if (props.connection) {
    form.value = {
      name: props.connection.name,
      host: props.connection.host,
      port: props.connection.port,
      username: props.connection.username,
      password: props.connection.password,
      group: props.connection.group || '',
    }
  } else if (props.defaultGroupId) {
    form.value.group = props.defaultGroupId
  }
})

async function handleSave() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入连接名称')
    return
  }
  if (!form.value.host.trim()) {
    ElMessage.warning('请输入主机地址')
    return
  }
  if (!form.value.username.trim()) {
    ElMessage.warning('请输入用户名')
    return
  }

  saving.value = true
  try {
    const data: any = {
      name: form.value.name.trim(),
      host: form.value.host.trim(),
      port: form.value.port,
      username: form.value.username.trim(),
      password: form.value.password,
      group: form.value.group || undefined,
    }
    if (props.connection) {
      data.id = props.connection.id
    }
    await window.liteSSH.saveConnection(data)
    ElMessage.success(props.connection ? '连接已更新' : '连接已添加')
    emit('saved')
  } catch (err: any) {
    ElMessage.error(err.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  if (!form.value.host.trim()) {
    ElMessage.warning('请输入主机地址')
    return
  }
  if (!form.value.username.trim()) {
    ElMessage.warning('请输入用户名')
    return
  }

  if (testTimer) {
    clearTimeout(testTimer)
    testTimer = null
  }

  testState.value = 'testing'
  testLatency.value = 0
  testError.value = ''

  try {
    const result = await window.liteSSH.sshTestConnectionParams({
      host: form.value.host.trim(),
      port: form.value.port,
      username: form.value.username.trim(),
      password: form.value.password,
    })
    if (result.ok) {
      testState.value = 'success'
      testLatency.value = result.latency || 0
    } else {
      testState.value = 'error'
      testError.value = result.error || '连接失败'
    }
  } catch (err: any) {
    testState.value = 'error'
    testError.value = err.message || '测试失败'
  }

  testTimer = setTimeout(() => {
    testState.value = 'idle'
    testTimer = null
  }, 10000)
}

async function handleDiagnose() {
  if (!form.value.host.trim()) {
    ElMessage.warning('请输入主机地址')
    return
  }
  if (!form.value.username.trim()) {
    ElMessage.warning('请输入用户名')
    return
  }

  diagnoseState.value = 'testing'
  diagnoseResult.value = null

  try {
    const result = await window.liteSSH.sshDiagnoseConnectionParams({
      host: form.value.host.trim(),
      port: form.value.port,
      username: form.value.username.trim(),
      password: form.value.password,
    })
    diagnoseResult.value = result
    diagnoseState.value = result.ok ? 'success' : 'error'
  } catch (err: any) {
    diagnoseState.value = 'error'
    diagnoseResult.value = {
      ok: false,
      error: err.message || '诊断失败',
    }
  }
}

function formatLatency(value?: number): string {
  return typeof value === 'number' ? `${value} ms` : '--'
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3 class="modal-title">{{ connection ? '编辑连接' : '新建连接' }}</h3>

      <form @submit.prevent="handleSave" class="form">
        <div class="form-row">
          <label class="label">连接名称</label>
          <input v-model="form.name" placeholder="例如: Production Server" class="input" />
        </div>

        <div class="form-row">
          <label class="label">主机地址</label>
          <div class="host-row">
            <input v-model="form.host" placeholder="192.168.1.1 或 example.com" class="input host-input" />
            <input v-model.number="form.port" type="number" placeholder="端口" class="input port-input" />
          </div>
        </div>

        <div class="form-row">
          <label class="label">用户名</label>
          <input v-model="form.username" placeholder="root" class="input" />
        </div>

        <div class="form-row">
          <label class="label">密码</label>
          <div class="password-row">
            <input v-model="form.password" :type="showPassword ? 'text' : 'password'" placeholder="SSH 密码" class="input password-input" />
            <button type="button" class="btn-toggle-password" @click="showPassword = !showPassword" :title="showPassword ? '隐藏密码' : '显示密码'">
              <svg v-if="!showPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
            </button>
          </div>
        </div>

        <div class="form-row">
          <label class="label">分组</label>
          <select v-model="form.group" class="input select-input">
            <option value="">未分组</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>

        <div class="form-actions">
          <div class="form-actions-left">
            <button type="button" class="btn-test" :disabled="testState === 'testing'" @click="handleTest">
              <template v-if="testState === 'testing'">
                <span class="spinner"></span> 测试中...
              </template>
              <template v-else-if="testState === 'success'">
                ✅ {{ testLatency }}ms
              </template>
              <template v-else-if="testState === 'error'">
                ❌ {{ testError }}
              </template>
              <template v-else>
                测试连接
              </template>
            </button>
            <button type="button" class="btn-test" :disabled="diagnoseState === 'testing'" @click="handleDiagnose">
              <template v-if="diagnoseState === 'testing'">
                <span class="spinner"></span> 诊断中...
              </template>
              <template v-else>
                延迟诊断
              </template>
            </button>
          </div>
          <div class="form-actions-right">
            <button type="button" class="btn-cancel" @click="emit('cancel')">取消</button>
            <button type="submit" class="btn-save" :disabled="saving">
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>

        <div v-if="diagnoseResult" class="diagnose-panel">
          <div class="diagnose-title">
            连接延迟诊断
            <span v-if="diagnoseResult.ok" class="diagnose-ok">成功</span>
            <span v-else class="diagnose-fail">失败</span>
          </div>
          <div class="diagnose-grid">
            <span class="diag-label">TCP 建连</span>
            <span class="diag-value">{{ formatLatency(diagnoseResult.tcpLatency) }}</span>
            <span class="diag-label">SSH Ready</span>
            <span class="diag-value">{{ formatLatency(diagnoseResult.sshReadyLatency) }}</span>
            <span class="diag-label">Shell 打开</span>
            <span class="diag-value">{{ formatLatency(diagnoseResult.shellOpenLatency) }}</span>
            <span class="diag-label">Shell 首字节</span>
            <span class="diag-value">{{ formatLatency(diagnoseResult.shellFirstByteLatency) }}</span>
            <span class="diag-label">总耗时</span>
            <span class="diag-value">{{ formatLatency(diagnoseResult.totalLatency) }}</span>
          </div>
          <div v-if="diagnoseResult.error" class="diagnose-error">原因：{{ diagnoseResult.error }}</div>
        </div>
      </form>
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
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 28px;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 24px;
  color: var(--text-primary);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.input {
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: var(--accent);
}

.input::placeholder {
  color: var(--text-secondary);
}

.host-row {
  display: flex;
  gap: 8px;
}

.password-row {
  display: flex;
  gap: 0;
}

.password-input {
  flex: 1;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}

.btn-toggle-password {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  padding: 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s;
}

.btn-toggle-password:hover {
  color: var(--text-primary);
}

.host-input {
  flex: 1;
}

.port-input {
  width: 100px;
}

.select-input {
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238b949e' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
  cursor: pointer;
}

.select-input option {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.form-actions-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-actions-right {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  padding: 8px 20px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.btn-cancel:hover {
  background: var(--border-color);
}

.btn-save {
  padding: 8px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-save:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-test {
  padding: 8px 16px;
  background: none;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-test:hover:not(:disabled) {
  background: var(--accent-bg);
}

.btn-test:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.diagnose-panel {
  margin-top: 2px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
}

.diagnose-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.diagnose-ok {
  color: var(--success);
}

.diagnose-fail {
  color: var(--danger);
}

.diagnose-grid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  font-size: 12px;
}

.diag-label {
  color: var(--text-secondary);
}

.diag-value {
  color: var(--text-primary);
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.diagnose-error {
  margin-top: 8px;
  font-size: 12px;
  color: var(--danger);
}

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
