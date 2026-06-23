<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import type { AiHistorySummary, AiSettings, AiUsage } from '../env.d.ts'
import { useMarkdownRenderer } from '../composables/useMarkdownRenderer'
import { useAiChat, type ChatItem } from '../composables/useAiChat'

const DEFAULT_SYSTEM_PROMPT = [
  '你是 liteSSH 内置的 AI 助手，主要帮助用户理解和处理 SSH 终端、Linux 命令、报错排查、服务运维和文件操作问题。',
  '请默认使用简体中文回答；只有当用户明确要求其他语言，或需要保留原始命令、日志、错误信息、配置字段时，才使用对应语言。',
  '回答要简洁、可执行，优先给出下一步操作和判断依据。涉及命令时，用 Markdown 代码块展示，并说明命令作用。',
  '对 rm、chmod、chown、mkfs、dd、防火墙、重启服务、修改 SSH 配置等可能造成破坏或断连的操作，必须先提醒风险，并给出更安全的验证步骤。',
  '如果用户提供的是终端选中文本、日志或报错，请先概括关键信息，再给出排查步骤。',
].join('\n')

const props = defineProps<{
  sessionId: string
  selectionRequest?: {
    id: number
    sessionId: string
    text: string
    mode: 'send' | 'insert'
  } | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectionConsumed', id: number): void
}>()

const { parseMarkdown } = useMarkdownRenderer()
const {
  settings,
  sendText,
  clearMessages,
  loadHistory,
  getSessionState,
  saveSessionInput,
} = useAiChat()

const messages = ref<ChatItem[]>([])
const input = ref('')
const loading = ref(false)
const showSettings = ref(false)
const showHistory = ref(false)
const historyList = ref<AiHistorySummary[]>([])
const copiedKey = ref('')
const consumedSelectionIds = new Set<number>()
const draftSettings = ref<AiSettings>({ ...settings.value })
let initialLoadPromise: Promise<void> | null = null
let copiedTimer: ReturnType<typeof setTimeout> | null = null
let historyListLoaded = false

const canSend = computed(() => input.value.trim().length > 0 && !loading.value)

function syncMessages(msgs: ChatItem[]) {
  messages.value = msgs
}

onMounted(() => {
  const state = getSessionState(props.sessionId)
  messages.value = state.messages
  input.value = state.input
  loading.value = state.loading
  ensureInitialLoad().catch(() => {})
})

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
  saveSessionInput(props.sessionId, input.value)
})

watch(
  () => props.sessionId,
  async (newId, oldId) => {
    if (oldId) saveSessionInput(oldId, input.value)
    const state = getSessionState(newId)
    messages.value = state.messages
    input.value = state.input
    loading.value = state.loading
    initialLoadPromise = null
    await ensureInitialLoad()
  }
)

watch(input, (value) => {
  saveSessionInput(props.sessionId, value)
})

watch(showHistory, (value) => {
  if (value) {
    void ensureHistoryListLoaded()
  }
})

watch(
  () => props.selectionRequest,
  async (request) => {
    if (!request?.text) return
    if (request.sessionId !== props.sessionId) return
    if (consumedSelectionIds.has(request.id)) return
    await ensureInitialLoad()
    consumedSelectionIds.add(request.id)
    emit('selectionConsumed', request.id)

    if (request.mode === 'insert') {
      input.value = request.text
      return
    }
    const sent = await handleSendText(request.text)
    if (!sent) input.value = request.text
  },
  { immediate: true }
)

function formatUsage(usage?: AiUsage): string {
  if (!usage) return ''
  const parts: string[] = []
  if (usage.promptTokens !== undefined) parts.push(`输入 ${usage.promptTokens}`)
  if (usage.completionTokens !== undefined) parts.push(`输出 ${usage.completionTokens}`)
  if (usage.reasoningTokens !== undefined) parts.push(`思考 ${usage.reasoningTokens}`)
  if (usage.totalTokens !== undefined) parts.push(`总计 ${usage.totalTokens}`)
  return parts.join(' · ')
}

async function copyText(text: string, key: string) {
  const content = text.trim()
  if (!content) return
  try {
    await window.liteSSH.clipboardWriteText(content)
    copiedKey.value = key
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = ''
      copiedTimer = null
    }, 1400)
  } catch (err: any) {
    ElMessage.warning(err?.message || '复制失败')
  }
}

async function loadHistoryList() {
  try {
    historyList.value = await window.liteSSH.listAiSessionHistories()
    historyListLoaded = true
  } catch {
    historyList.value = []
    historyListLoaded = false
  }
}

async function ensureHistoryListLoaded(force = false) {
  if (historyListLoaded && !force) return
  await loadHistoryList()
}

async function loadHistorySession(sessionId: string) {
  try {
    const records = await window.liteSSH.getAiSessionHistory(sessionId)
    messages.value = records.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      reasoningContent: r.reasoningContent,
      usage: r.usage,
      error: r.error,
      createdAt: r.createdAt,
    }))
    showHistory.value = false
  } catch (err: any) {
    ElMessage.warning(err?.message || '加载 AI 历史记录失败')
  }
}

async function ensureInitialLoad() {
  if (!initialLoadPromise) {
    initialLoadPromise = (async () => {
      try {
        settings.value = await window.liteSSH.getAiSettings()
        draftSettings.value = { ...settings.value }
      } catch (err: any) {
        ElMessage.warning(err?.message || '加载 AI 设置失败')
      }
      const history = await loadHistory(props.sessionId)
      const state = getSessionState(props.sessionId)
      if (state.messages.length === 0 && history.length > 0) {
        state.messages.push(...history)
      }
      syncMessages(state.messages)
    })()
  }
  await initialLoadPromise
}

async function saveSettings() {
  const next = {
    ...draftSettings.value,
    baseUrl: draftSettings.value.baseUrl.trim(),
    model: draftSettings.value.model.trim(),
    temperature: Number(draftSettings.value.temperature),
  }
  if (!next.baseUrl || !next.model) {
    ElMessage.warning('请填写 AI URL 和模型名')
    return
  }

  await window.liteSSH.setAiSettings(next)
  settings.value = next
  draftSettings.value = { ...next }
  ElMessage.success('AI 设置已保存')
  showSettings.value = false
}

async function handleSendText(text: string): Promise<boolean> {
  const content = text.trim()
  if (!content) return false
  loading.value = true
  const result = await sendText(props.sessionId, content, syncMessages)
  loading.value = getSessionState(props.sessionId).loading
  return result
}

async function sendMessage() {
  if (!canSend.value) return
  const content = input.value.trim()
  input.value = ''
  await handleSendText(content)
}

function handleClearMessages() {
  clearMessages(props.sessionId, syncMessages)
  historyListLoaded = false
  if (showHistory.value) {
    loadHistoryList().catch(() => {})
  }
}
</script>

<template>
  <div class="ai-sidebar">
    <div class="ai-header">
      <div>
        <div class="ai-title">AI 助手</div>
        <div class="ai-subtitle">{{ settings.model }}</div>
      </div>
      <div class="ai-header-actions">
        <button class="icon-btn" @click="showHistory = !showHistory" title="历史记录">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 5.64 6.64L3 8"/><path d="M12 7v5l3 2"/>
          </svg>
        </button>
        <button class="icon-btn" @click="showSettings = !showSettings" title="AI 设置">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"/>
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z"/>
          </svg>
        </button>
        <button class="icon-btn close-btn" @click="emit('close')" title="关闭 AI 面板">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <div v-if="showHistory" class="history-box">
      <div v-if="historyList.length === 0" class="history-empty">暂无历史记录</div>
      <button
        v-for="item in historyList"
        :key="item.sessionId"
        class="history-item"
        @click="loadHistorySession(item.sessionId)"
      >
        <span class="history-title">{{ item.title }}</span>
        <span class="history-meta">{{ item.messageCount }} 条消息 · {{ new Date(item.updatedAt).toLocaleString() }}</span>
      </button>
    </div>

    <div v-if="showSettings" class="settings-box">
      <label class="field-label">Base URL</label>
      <input v-model="draftSettings.baseUrl" class="field-input" placeholder="https://api.openai.com/v1" />

      <label class="field-label">模型名</label>
      <input v-model="draftSettings.model" class="field-input" placeholder="gpt-4o-mini" />

      <label class="field-label">API Key</label>
      <input v-model="draftSettings.apiKey" class="field-input" type="password" placeholder="sk-..." />

      <label class="field-label">系统提示词</label>
      <textarea v-model="draftSettings.systemPrompt" class="field-textarea" rows="3" />

      <div class="temperature-row">
        <label class="field-label">温度 {{ Number(draftSettings.temperature).toFixed(1) }}</label>
        <input v-model.number="draftSettings.temperature" type="range" min="0" max="2" step="0.1" />
      </div>

      <button class="primary-btn" @click="saveSettings">保存设置</button>
    </div>

    <div class="chat-list">
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-title">可以问我命令、报错和排障思路</div>
        <div class="empty-text">先在设置里填好 URL、模型名和 API Key。</div>
      </div>
      <div
        v-for="message in messages"
        :key="message.id"
        class="chat-message"
        :class="[message.role, { error: message.error }]"
      >
        <div class="message-role">{{ message.role === 'user' ? '你' : 'AI' }}</div>
        <details v-if="message.reasoningContent" class="reasoning-box">
          <summary>思考内容</summary>
          <div class="reasoning-content">
            <template v-for="(block, index) in parseMarkdown(message.reasoningContent)" :key="index">
              <div v-if="block.type === 'code'" class="code-block">
                <div class="code-block-header">
                  <span class="code-language">{{ block.language || 'text' }}</span>
                  <button
                    type="button"
                    class="copy-btn"
                    :title="copiedKey === `${message.id}-reasoning-code-${index}` ? '已复制' : '复制代码'"
                    @click="copyText(block.content, `${message.id}-reasoning-code-${index}`)"
                  >
                    <svg v-if="copiedKey === `${message.id}-reasoning-code-${index}`" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>
                <pre class="markdown-code"><code>{{ block.content }}</code></pre>
              </div>
              <div v-else class="markdown-block" v-html="block.content"></div>
            </template>
          </div>
        </details>
        <div v-if="message.content || (!message.reasoningContent && message.streaming)" class="message-content">
          <button
            v-if="message.content && message.role === 'assistant'"
            type="button"
            class="message-copy-btn"
            :title="copiedKey === `${message.id}-message` ? '已复制' : '复制回复'"
            @click="copyText(message.content, `${message.id}-message`)"
          >
            <svg v-if="copiedKey === `${message.id}-message`" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <template v-if="message.content">
            <template v-for="(block, index) in parseMarkdown(message.content)" :key="index">
              <div v-if="block.type === 'code'" class="code-block">
                <div class="code-block-header">
                  <span class="code-language">{{ block.language || 'text' }}</span>
                  <button
                    type="button"
                    class="copy-btn"
                    :title="copiedKey === `${message.id}-code-${index}` ? '已复制' : '复制代码'"
                    @click="copyText(block.content, `${message.id}-code-${index}`)"
                  >
                    <svg v-if="copiedKey === `${message.id}-code-${index}`" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>
                <pre class="markdown-code"><code>{{ block.content }}</code></pre>
              </div>
              <div v-else class="markdown-block" v-html="block.content"></div>
            </template>
          </template>
          <span v-else>思考中...</span>
        </div>
        <div v-if="formatUsage(message.usage)" class="usage-line">
          Token: {{ formatUsage(message.usage) }}
        </div>
      </div>
    </div>

    <form class="composer" @submit.prevent="sendMessage">
      <textarea
        v-model="input"
        class="composer-input"
        rows="3"
        placeholder="输入问题..."
        @keydown.enter.exact.prevent="sendMessage"
        @keydown.shift.enter.stop
        @keydown.ctrl.enter.prevent="sendMessage"
        @keydown.meta.enter.prevent="sendMessage"
      />
      <div class="composer-actions">
        <button type="button" class="ghost-btn" @click="handleClearMessages" title="清空对话">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
        <button type="submit" class="send-btn" :disabled="!canSend">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.ai-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  overflow: hidden;
}

.ai-header {
  min-height: 48px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
}

.ai-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.ai-subtitle {
  margin-top: 2px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--text-secondary);
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.ai-header-actions,
.composer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn,
.ghost-btn,
.send-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.icon-btn:hover,
.ghost-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

.close-btn:hover {
  color: var(--danger);
  border-color: var(--danger);
}

.settings-box {
  padding: 10px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.history-box {
  max-height: 220px;
  overflow-y: auto;
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
}

.history-empty {
  padding: 10px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
}

.history-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.history-item:hover {
  background: var(--hover-bg);
}

.history-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.history-meta {
  font-size: 10px;
  color: var(--text-secondary);
}

.field-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
}

.field-input,
.field-textarea,
.composer-input {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  outline: none;
  font-size: 12px;
}

.field-input {
  height: 30px;
  padding: 0 8px;
}

.field-textarea,
.composer-input {
  padding: 8px;
  resize: none;
  line-height: 1.45;
}

.field-input:focus,
.field-textarea:focus,
.composer-input:focus {
  border-color: var(--accent);
}

.temperature-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.primary-btn {
  height: 30px;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.chat-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty-state {
  margin: auto 0;
  color: var(--text-secondary);
  text-align: center;
  padding: 16px 8px;
}

.empty-title {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 700;
}

.empty-text {
  margin-top: 6px;
  font-size: 11px;
}

.chat-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-message.user {
  align-items: flex-end;
}

.message-role {
  font-size: 10px;
  color: var(--text-secondary);
}

.message-content {
  position: relative;
  max-width: 100%;
  word-break: break-word;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
}

.chat-message.assistant .message-content {
  padding-right: 38px;
}

.chat-message.user .message-content {
  background: var(--accent-bg);
  border-color: var(--accent);
}

.chat-message.error .message-content {
  border-color: var(--danger);
  color: var(--danger);
}

.markdown-block + .markdown-block,
.markdown-block + .code-block,
.code-block + .markdown-block,
.code-block + .code-block {
  margin-top: 8px;
}

.markdown-block :deep(p) {
  margin: 0;
}

.markdown-block :deep(h3),
.markdown-block :deep(h4),
.markdown-block :deep(h5),
.markdown-block :deep(h6) {
  margin: 8px 0 4px;
  font-size: 13px;
  line-height: 1.35;
}

.markdown-block :deep(h1),
.markdown-block :deep(h2) {
  margin: 10px 0 6px;
  font-size: 14px;
  line-height: 1.35;
}

.markdown-block :deep(ul),
.markdown-block :deep(ol) {
  margin: 4px 0 4px 16px;
  padding: 0;
}

.markdown-block :deep(li) {
  margin: 2px 0;
}

.markdown-block :deep(del) {
  text-decoration: line-through;
  opacity: 0.6;
}

.markdown-block :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 8px 0;
}

.markdown-block :deep(blockquote) {
  margin: 4px 0;
  padding: 4px 8px;
  border-left: 2px solid var(--accent);
  color: var(--text-secondary);
  background: var(--accent-bg);
}

.markdown-block :deep(code),
.markdown-code,
.code-language {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.markdown-block :deep(code) {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--bg-tertiary);
}

.markdown-block :deep(a) {
  color: var(--accent);
}

.code-block {
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
}

.code-block-header {
  min-height: 28px;
  padding: 4px 6px 4px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.code-language {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
}

.copy-btn,
.message-copy-btn {
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: 0 0 auto;
}

.copy-btn:hover,
.message-copy-btn:hover {
  border-color: var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
}

.message-copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  opacity: 0;
}

.message-content:hover .message-copy-btn,
.message-copy-btn:focus-visible {
  opacity: 1;
}

.markdown-code {
  margin: 0;
  padding: 8px;
  overflow-x: auto;
  background: transparent;
  color: var(--text-primary);
  font-size: 11px;
  line-height: 1.45;
  white-space: pre;
}

.reasoning-box {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 11px;
}

.reasoning-box summary {
  padding: 6px 8px;
  cursor: pointer;
  color: var(--text-secondary);
  font-weight: 600;
}

.reasoning-content {
  padding: 0 8px 8px;
}

.usage-line {
  font-size: 10px;
  color: var(--text-secondary);
  opacity: 0.8;
}

.composer {
  padding: 10px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.composer-actions {
  justify-content: space-between;
}

.send-btn {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
