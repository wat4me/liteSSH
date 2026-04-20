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
          <input v-model="form.password" type="password" placeholder="SSH 密码" class="input" />
        </div>

        <div class="form-row">
          <label class="label">分组</label>
          <select v-model="form.group" class="input select-input">
            <option value="">未分组</option>
            <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>

        <div class="form-actions">
          <button type="button" class="btn-cancel" @click="emit('cancel')">取消</button>
          <button type="submit" class="btn-save" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
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
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
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
</style>
