<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const emit = defineEmits<{
  (e: 'unlocked'): void
}>()

const password = ref('')
const confirmPassword = ref('')
const isSetup = ref(false)
const loading = ref(false)

async function checkInit() {
  const initialized = await window.liteSSH.isInitialized()
  isSetup.value = !initialized
}

checkInit()

async function handleSubmit() {
  if (!password.value) {
    ElMessage.warning('请输入密码')
    return
  }

  if (isSetup.value) {
    if (password.value !== confirmPassword.value) {
      ElMessage.error('两次密码不一致')
      return
    }
    if (password.value.length < 6) {
      ElMessage.error('密码至少6位')
      return
    }
  }

  loading.value = true
  try {
    if (isSetup.value) {
      await window.liteSSH.initMasterPassword(password.value)
      ElMessage.success('主密码设置成功')
    } else {
      const ok = await window.liteSSH.unlock(password.value)
      if (!ok) {
        ElMessage.error('密码错误')
        loading.value = false
        return
      }
    }
    emit('unlocked')
  } catch (err: any) {
    ElMessage.error(err.message || '操作失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="unlock-view">
    <div class="unlock-card">
      <div class="logo">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      </div>
      <h1 class="title">liteSSH</h1>
      <p class="subtitle">{{ isSetup ? '首次使用，请设置主密码' : '请输入主密码解锁' }}</p>

      <form @submit.prevent="handleSubmit" class="unlock-form">
        <div class="form-group">
          <input
            v-model="password"
            type="password"
            :placeholder="isSetup ? '设置主密码 (至少6位)' : '输入主密码'"
            class="input"
            autofocus
          />
        </div>
        <div v-if="isSetup" class="form-group">
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="确认主密码"
            class="input"
          />
        </div>
        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? '处理中...' : isSetup ? '设置密码' : '解锁' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.unlock-view {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.unlock-card {
  width: 380px;
  padding: 48px 40px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  text-align: center;
}

.logo {
  color: var(--accent);
  margin-bottom: 16px;
}

.title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 32px;
}

.unlock-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  width: 100%;
}

.input {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
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

.btn-primary {
  width: 100%;
  padding: 12px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
