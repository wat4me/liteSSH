import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import type { AiChatMessage, AiChatResult, AiChatStreamPayload, AiHistoryRecord, AiSettings, AiUsage } from '../env.d'

export type ChatItem = AiChatMessage & {
  id: string
  createdAt: number
  error?: boolean
  reasoningContent?: string
  usage?: AiUsage
  streaming?: boolean
}

type AiSessionState = {
  messages: ChatItem[]
  input: string
  loading: boolean
  persisting: boolean
}

const aiSessionStates = new Map<string, AiSessionState>()

function getAiSessionState(sessionId: string): AiSessionState {
  let state = aiSessionStates.get(sessionId)
  if (!state) {
    state = {
      messages: reactive([]) as ChatItem[],
      input: '',
      loading: false,
      persisting: false,
    }
    aiSessionStates.set(sessionId, state)
  }
  return state
}

export function useAiChat() {
  const settings = ref<AiSettings>({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiKey: '',
    systemPrompt: '',
    temperature: 0.2,
  })

  let activeStreamUnsubscribe: (() => void) | null = null

  function createMessage(
    role: AiChatMessage['role'],
    content: string,
    error = false,
    result?: Partial<AiChatResult> & { streaming?: boolean }
  ): ChatItem {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      role,
      content,
      error,
      reasoningContent: result?.reasoningContent,
      usage: result?.usage,
      streaming: result?.streaming,
    }
  }

  function toHistoryRecord(message: ChatItem): AiHistoryRecord {
    return {
      id: message.id,
      role: message.role as 'user' | 'assistant',
      content: message.content,
      reasoningContent: message.reasoningContent,
      usage: message.usage,
      error: message.error,
      createdAt: message.createdAt,
    }
  }

  function fromHistoryRecord(record: AiHistoryRecord): ChatItem {
    return {
      id: record.id,
      role: record.role,
      content: record.content,
      reasoningContent: record.reasoningContent,
      usage: record.usage,
      error: record.error,
      createdAt: record.createdAt,
    }
  }

  function setSessionLoading(sessionId: string, value: boolean) {
    const state = getAiSessionState(sessionId)
    state.loading = value
  }

  async function persistMessage(sessionId: string, message: ChatItem) {
    try {
      await window.liteSSH.appendAiSessionHistory(sessionId, toHistoryRecord(message))
    } catch (err) {
      console.warn('Failed to persist AI message:', err)
    }
  }

  async function loadHistory(sessionId: string): Promise<ChatItem[]> {
    try {
      const records = await window.liteSSH.getAiSessionHistory(sessionId)
      return records.map(fromHistoryRecord)
    } catch (err: any) {
      ElMessage.warning(err?.message || '加载 AI 历史记录失败')
      return []
    }
  }

  async function sendText(
    sessionId: string,
    text: string,
    onUpdate: (messages: ChatItem[]) => void
  ): Promise<boolean> {
    const state = getAiSessionState(sessionId)
    const content = text.trim()
    if (!content) return false
    if (state.loading) {
      ElMessage.warning('AI 正在回复，请稍后再发送')
      return false
    }

    const userMessage = createMessage('user', content)
    state.messages.push(userMessage)
    onUpdate(state.messages)
    await persistMessage(sessionId, userMessage)
    setSessionLoading(sessionId, true)

    const chatMessages = state.messages
      .filter((message) => !message.error && !message.streaming)
      .map(({ role, content }) => ({ role, content }))

    const assistantMessage = createMessage('assistant', '', false, { streaming: true })
    state.messages.push(assistantMessage)
    onUpdate(state.messages)
    const assistantIndex = state.messages.length - 1

    const getAssistantMessage = () => state.messages[assistantIndex] || assistantMessage
    const updateAssistantMessage = (patch: Partial<ChatItem>) => {
      const current = getAssistantMessage()
      state.messages.splice(assistantIndex, 1, { ...current, ...patch })
      onUpdate(state.messages)
    }

    try {
      const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      activeStreamUnsubscribe = window.liteSSH.onAiChatStream(requestId, (payload: AiChatStreamPayload) => {
        const current = getAssistantMessage()
        if (payload.type === 'content') {
          updateAssistantMessage({ content: current.content + payload.value })
        } else if (payload.type === 'reasoning') {
          updateAssistantMessage({ reasoningContent: (current.reasoningContent || '') + payload.value })
        } else if (payload.type === 'usage') {
          updateAssistantMessage({ usage: payload.value })
        }
      })

      try {
        const reply = await window.liteSSH.aiChatStream(requestId, chatMessages)
        const current = getAssistantMessage()
        updateAssistantMessage({
          content: reply.content || current.content,
          reasoningContent: reply.reasoningContent || current.reasoningContent,
          usage: reply.usage || current.usage,
        })
      } finally {
        activeStreamUnsubscribe?.()
        activeStreamUnsubscribe = null
      }
    } catch (err: any) {
      const current = getAssistantMessage()
      if (!current.content && !current.reasoningContent) {
        try {
          const reply = await window.liteSSH.aiChat(chatMessages)
          updateAssistantMessage({
            content: reply.content,
            reasoningContent: reply.reasoningContent,
            usage: reply.usage,
          })
        } catch (fallbackErr: any) {
          updateAssistantMessage({
            content: fallbackErr?.message || err?.message || 'AI 请求失败',
            error: true,
          })
        }
      } else {
        updateAssistantMessage({
          content: `${current.content}\n\n${err?.message || 'AI 请求中断'}`,
          error: true,
        })
      }
    } finally {
      updateAssistantMessage({ streaming: false })
      state.persisting = true
      try {
        await persistMessage(sessionId, getAssistantMessage())
      } finally {
        state.persisting = false
        setSessionLoading(sessionId, false)
      }
    }
    return true
  }

  function clearMessages(sessionId: string, onUpdate: (messages: ChatItem[]) => void) {
    const state = getAiSessionState(sessionId)
    state.messages.splice(0, state.messages.length)
    onUpdate(state.messages)
    window.liteSSH.clearAiSessionHistory(sessionId).catch(() => {})
  }

  function getSessionState(sessionId: string): AiSessionState {
    return getAiSessionState(sessionId)
  }

  function saveSessionInput(sessionId: string, input: string) {
    const state = getAiSessionState(sessionId)
    state.input = input
  }

  return {
    settings,
    createMessage,
    sendText,
    clearMessages,
    loadHistory,
    getSessionState,
    saveSessionInput,
  }
}
