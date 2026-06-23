import { ipcMain, app } from 'electron'
import { existsSync } from 'fs'
import { readFile, writeFile, mkdir, appendFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { SettingsStore } from '../store/settingsStore'

const LEGACY_AI_SYSTEM_PROMPT = 'You are a concise SSH assistant. Help explain commands, errors, Linux operations, and troubleshooting steps.'

const DEFAULT_AI_SYSTEM_PROMPT = [
  '你是 liteSSH 内置的 AI 助手，主要帮助用户理解和处理 SSH 终端、Linux 命令、报错排查、服务运维和文件操作问题。',
  '请默认使用简体中文回答；只有当用户明确要求其他语言，或需要保留原始命令、日志、错误信息、配置字段时，才使用对应语言。',
  '回答要简洁、可执行，优先给出下一步操作和判断依据。涉及命令时，用 Markdown 代码块展示，并说明命令作用。',
  '对 rm、chmod、chown、mkfs、dd、防火墙、重启服务、修改 SSH 配置等可能造成破坏或断连的操作，必须先提醒风险，并给出更安全的验证步骤。',
  '如果用户提供的是终端选中文本、日志或报错，请先概括关键信息，再给出排查步骤。',
].join('\n')

type AiChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function normalizeAiBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('Invalid AI base URL')
  }

  let parsed: URL
  try {
    parsed = new URL(baseUrl.trim())
  } catch {
    throw new Error('Invalid AI base URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('AI base URL must use http or https')
  }

  return parsed.toString().replace(/\/$/, '')
}

function getAiChatCompletionsUrl(baseUrl: string): string {
  const normalized = normalizeAiBaseUrl(baseUrl)
  if (normalized.endsWith('/chat/completions')) return normalized
  return `${normalized}/chat/completions`
}

function validateAiSettings(settings: any): {
  baseUrl: string
  model: string
  apiKey: string
  systemPrompt: string
  temperature: number
} {
  if (!settings || typeof settings !== 'object') {
    throw new Error('Invalid AI settings')
  }
  const baseUrl = normalizeAiBaseUrl(settings.baseUrl)
  const model = typeof settings.model === 'string' ? settings.model.trim() : ''
  if (!model) throw new Error('Invalid AI model')

  return {
    baseUrl,
    model,
    apiKey: typeof settings.apiKey === 'string' ? settings.apiKey : '',
    systemPrompt: typeof settings.systemPrompt === 'string' ? settings.systemPrompt : '',
    temperature: typeof settings.temperature === 'number'
      ? Math.max(0, Math.min(2, settings.temperature))
      : 0.2,
  }
}

function validateAiMessages(messages: any): AiChatMessage[] {
  if (!Array.isArray(messages)) throw new Error('Invalid AI messages')
  const validRoles = new Set(['system', 'user', 'assistant'])
  return messages.slice(-20).map((message) => {
    if (!message || typeof message !== 'object') throw new Error('Invalid AI message')
    if (!validRoles.has(message.role)) throw new Error('Invalid AI message role')
    if (typeof message.content !== 'string' || !message.content.trim()) {
      throw new Error('Invalid AI message content')
    }
    return {
      role: message.role,
      content: message.content.slice(0, 12000),
    }
  })
}

function getFirstString(...values: any[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function normalizeAiContent(content: any): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object') {
        return getFirstString(part.text, part.content)
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function extractAiUsage(usage: any): {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  reasoningTokens?: number
} | undefined {
  if (!usage || typeof usage !== 'object') return undefined
  const result = {
    promptTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
    completionTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined,
    totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined,
    reasoningTokens: typeof usage.completion_tokens_details?.reasoning_tokens === 'number'
      ? usage.completion_tokens_details.reasoning_tokens
      : typeof usage.reasoning_tokens === 'number'
        ? usage.reasoning_tokens
        : undefined,
  }
  if (Object.values(result).every((value) => value === undefined)) return undefined
  return result
}

type AiHistoryRecord = {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoningContent?: string
  usage?: ReturnType<typeof extractAiUsage>
  error?: boolean
  createdAt: number
}

function getAiHistoryPath(sessionId: string): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Invalid AI session id')
  }
  const safeId = encodeURIComponent(sessionId).replace(/[()]/g, '')
  return join(app.getPath('userData'), 'ai-history', `${safeId}.jsonl`)
}

function getAiHistoryDir(): string {
  return join(app.getPath('userData'), 'ai-history')
}

function normalizeAiHistoryRecord(record: any): AiHistoryRecord {
  if (!record || typeof record !== 'object') {
    throw new Error('Invalid AI history record')
  }
  if (record.role !== 'user' && record.role !== 'assistant') {
    throw new Error('Invalid AI history role')
  }
  if (typeof record.content !== 'string') {
    throw new Error('Invalid AI history content')
  }
  return {
    id: typeof record.id === 'string' && record.id ? record.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: record.role,
    content: record.content.slice(0, 200000),
    reasoningContent: typeof record.reasoningContent === 'string' ? record.reasoningContent.slice(0, 200000) : undefined,
    usage: extractAiUsage({
      prompt_tokens: record.usage?.promptTokens,
      completion_tokens: record.usage?.completionTokens,
      total_tokens: record.usage?.totalTokens,
      reasoning_tokens: record.usage?.reasoningTokens,
    }),
    error: record.error === true,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
  }
}

async function readAiHistoryRecords(sessionId: string): Promise<AiHistoryRecord[]> {
  const historyPath = getAiHistoryPath(sessionId)
  if (!existsSync(historyPath)) return []
  const data = await readFile(historyPath, 'utf-8')
  return data
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return normalizeAiHistoryRecord(JSON.parse(line))
      } catch {
        return null
      }
    })
    .filter((record): record is AiHistoryRecord => Boolean(record))
}

function extractAiReasoningFromMessage(message: any): string {
  return getFirstString(
    message?.reasoning_content,
    message?.reasoning,
    message?.thinking
  )
}

function extractAiReasoningFromChoice(choice: any): string {
  return getFirstString(
    extractAiReasoningFromMessage(choice?.delta),
    extractAiReasoningFromMessage(choice?.message),
    choice?.reasoning_content,
    choice?.reasoning,
    choice?.thinking
  )
}

async function readAiStream(response: Response, onEvent: (event: any) => void): Promise<void> {
  if (!response.body) throw new Error('AI response did not contain a stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() || ''

    for (const event of events) {
      const dataLines = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
      if (dataLines.length === 0) continue
      const payload = dataLines.join('\n')
      if (payload === '[DONE]') return
      try {
        onEvent(JSON.parse(payload))
      } catch {}
    }
  }
}

export function registerAiHandlers(settingsStore: SettingsStore): void {
  const ensureSettingsReady = () => settingsStore.init()

  ipcMain.handle('settings:getAiSettings', async () => {
    await ensureSettingsReady()
    return settingsStore.getAiSettings()
  })

  ipcMain.handle('settings:setAiSettings', async (_event, settings: any) => {
    await ensureSettingsReady()
    await settingsStore.setAiSettings(validateAiSettings(settings))
  })

  ipcMain.handle('ai:getSessionHistory', async (_event, sessionId: string) => {
    return await readAiHistoryRecords(sessionId)
  })

  ipcMain.handle('ai:listSessionHistories', async () => {
    const historyDir = getAiHistoryDir()
    if (!existsSync(historyDir)) return []
    const files = await readdir(historyDir)
    const histories = await Promise.all(files
      .filter((fileName) => fileName.endsWith('.jsonl'))
      .map(async (fileName) => {
        const sessionId = decodeURIComponent(fileName.replace(/\.jsonl$/, ''))
        const historyPath = join(historyDir, fileName)
        const [records, fileStat] = await Promise.all([
          readAiHistoryRecords(sessionId),
          stat(historyPath),
        ])
        const firstUser = records.find((record) => record.role === 'user')
        return {
          sessionId,
          title: firstUser?.content.slice(0, 60) || sessionId,
          messageCount: records.length,
          updatedAt: fileStat.mtimeMs,
        }
      }))
    return histories
      .filter((item) => item.messageCount > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50)
  })

  ipcMain.handle('ai:appendSessionHistory', async (_event, sessionId: string, record: any) => {
    const historyPath = getAiHistoryPath(sessionId)
    await mkdir(getAiHistoryDir(), { recursive: true })
    await appendFile(historyPath, `${JSON.stringify(normalizeAiHistoryRecord(record))}\n`, 'utf-8')
  })

  ipcMain.handle('ai:clearSessionHistory', async (_event, sessionId: string) => {
    const historyPath = getAiHistoryPath(sessionId)
    await mkdir(getAiHistoryDir(), { recursive: true })
    await writeFile(historyPath, '', 'utf-8')
  })

  ipcMain.handle('ai:chat', async (_event, messages: any) => {
    await ensureSettingsReady()
    const settings = settingsStore.getAiSettings()
    const chatMessages = validateAiMessages(messages)
    if (!settings.apiKey.trim()) {
      throw new Error('Please configure an AI API key first')
    }

    const response = await fetch(getAiChatCompletionsUrl(settings.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          ...(settings.systemPrompt.trim() ? [{ role: 'system', content: settings.systemPrompt.trim() }] : []),
          ...chatMessages.filter((message) => message.role !== 'system'),
        ],
        temperature: settings.temperature,
      }),
    })

    if (!response.ok) {
      let message = `AI request failed (${response.status})`
      try {
        const data = await response.json()
        message = data?.error?.message || data?.message || message
      } catch {}
      throw new Error(message)
    }

    const data = await response.json()
    const choice = data?.choices?.[0]
    const message = choice?.message || {}
    const content = normalizeAiContent(message.content ?? choice?.text)
    if (!content) {
      throw new Error('AI response did not contain a message')
    }
    const reasoningContent = getFirstString(
      message.reasoning_content,
      message.reasoning,
      message.thinking,
      choice?.reasoning_content,
      choice?.reasoning,
      choice?.thinking,
      data?.reasoning_content,
      data?.reasoning
    )
    return {
      content,
      reasoningContent: reasoningContent || undefined,
      usage: extractAiUsage(data?.usage),
    }
  })

  ipcMain.handle('ai:chatStream', async (event, requestId: string, messages: any) => {
    if (!requestId || typeof requestId !== 'string') {
      throw new Error('Invalid AI request id')
    }
    await ensureSettingsReady()
    const settings = settingsStore.getAiSettings()
    const chatMessages = validateAiMessages(messages)
    if (!settings.apiKey.trim()) {
      throw new Error('Please configure an AI API key first')
    }

    const send = (payload: any) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`ai:chatStream:${requestId}`, payload)
      }
    }

    const createBody = (includeUsage: boolean) => ({
        model: settings.model,
        messages: [
          ...(settings.systemPrompt.trim() ? [{ role: 'system', content: settings.systemPrompt.trim() }] : []),
          ...chatMessages.filter((message) => message.role !== 'system'),
        ],
        temperature: settings.temperature,
        stream: true,
        ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
      })

    const requestStream = (includeUsage: boolean) => fetch(getAiChatCompletionsUrl(settings.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(createBody(includeUsage)),
    })

    let response = await requestStream(true)
    if (!response.ok) {
      response = await requestStream(false)
    }

    if (!response.ok) {
      let message = `AI request failed (${response.status})`
      try {
        const data = await response.json()
        message = data?.error?.message || data?.message || message
      } catch {}
      throw new Error(message)
    }

    let content = ''
    let reasoningContent = ''
    let usage: ReturnType<typeof extractAiUsage> | undefined

    await readAiStream(response, (chunk) => {
      const choice = chunk?.choices?.[0]
      const delta = choice?.delta || {}
      const contentDelta = normalizeAiContent(delta.content ?? choice?.text)
      const reasoningDelta = extractAiReasoningFromChoice(choice)
      const chunkUsage = extractAiUsage(chunk?.usage)

      if (reasoningDelta) {
        reasoningContent += reasoningDelta
        send({ type: 'reasoning', value: reasoningDelta })
      }
      if (contentDelta) {
        content += contentDelta
        send({ type: 'content', value: contentDelta })
      }
      if (chunkUsage) {
        usage = chunkUsage
        send({ type: 'usage', value: chunkUsage })
      }
    })

    send({ type: 'done' })
    return {
      content,
      reasoningContent: reasoningContent || undefined,
      usage,
    }
  })
}
