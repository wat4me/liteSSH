export type MarkdownBlock =
  | { type: 'code'; content: string; language: string }
  | { type: 'html'; content: string }

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeExternalUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function renderInlineMarkdown(value: string): string {
  let rendered = escapeHtml(value)
  rendered = rendered.replace(/`([^`]+)`/g, '\x00code\x01$1\x00/code\x01')
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  rendered = rendered.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  rendered = rendered.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    const safeUrl = sanitizeExternalUrl(url)
    if (!safeUrl) return match
    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer noopener">${label}</a>`
  })
  rendered = rendered.replace(/(?<![="'])https?:\/\/[^\s<>"')]+/g, (url: string) => {
    const safeUrl = sanitizeExternalUrl(url)
    if (!safeUrl) return url
    const escapedUrl = escapeHtml(safeUrl)
    return `<a href="${escapedUrl}" target="_blank" rel="noreferrer noopener">${escapedUrl}</a>`
  })
  rendered = rendered.replace(/\x00/g, '<').replace(/\x01/g, '>')
  return rendered
}

export function useMarkdownRenderer() {
  function parseMarkdown(markdown: string): MarkdownBlock[] {
    const lines = markdown.split(/\r?\n/)
    const blocks: MarkdownBlock[] = []
    let paragraph: string[] = []
    let listItems: string[] = []
    let listOrdered = false
    let code: string[] | null = null
    let codeLanguage = ''

    const flushParagraph = () => {
      if (paragraph.length === 0) return
      blocks.push({ type: 'html', content: `<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>` })
      paragraph = []
    }

    const flushList = () => {
      if (listItems.length === 0) return
      const tag = listOrdered ? 'ol' : 'ul'
      blocks.push({ type: 'html', content: `<${tag}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</${tag}>` })
      listItems = []
      listOrdered = false
    }

    for (const line of lines) {
      const fence = line.match(/^```(\S*)\s*$/)
      if (fence) {
        if (code) {
          blocks.push({ type: 'code', content: code.join('\n'), language: codeLanguage })
          code = null
          codeLanguage = ''
        } else {
          flushParagraph()
          flushList()
          code = []
          codeLanguage = fence[1] || ''
        }
        continue
      }

      if (code) {
        code.push(line)
        continue
      }

      if (!line.trim()) {
        flushParagraph()
        flushList()
        continue
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/)
      if (heading) {
        flushParagraph()
        flushList()
        const level = Math.min(heading[1].length, 6)
        blocks.push({ type: 'html', content: `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>` })
        continue
      }

      if (/^[-*_]{3,}\s*$/.test(line.trim())) {
        flushParagraph()
        flushList()
        blocks.push({ type: 'html', content: '<hr>' })
        continue
      }

      const unorderedItem = line.match(/^\s*[-*+]\s+(.+)$/)
      const orderedItem = line.match(/^\s*\d+\.\s+(.+)$/)

      if (unorderedItem || orderedItem) {
        flushParagraph()
        const isOrdered = !!orderedItem
        if (listItems.length > 0 && listOrdered !== isOrdered) {
          flushList()
        }
        listOrdered = isOrdered
        listItems.push((unorderedItem || orderedItem)![1])
        continue
      }

      if (line.startsWith('> ')) {
        flushParagraph()
        flushList()
        blocks.push({ type: 'html', content: `<blockquote>${renderInlineMarkdown(line.slice(2))}</blockquote>` })
        continue
      }

      paragraph.push(line)
    }

    if (code) blocks.push({ type: 'code', content: code.join('\n'), language: codeLanguage })
    flushParagraph()
    flushList()
    return blocks
  }

  return { parseMarkdown }
}
