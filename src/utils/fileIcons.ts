export interface FileIconInfo {
  svg: string
  color: string
}

type IconMap = Record<string, FileIconInfo>

const CODE_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 2L2.5 8L6 14H4.5L1 8L4.5 2H6Z" fill="currentColor"/><path d="M10 2L13.5 8L10 14H11.5L15 8L11.5 2H10Z" fill="currentColor"/></svg>`
const PYTHON_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 1C5.84 1 5 2.17 5 3.5V5H8V5.5H3.5C2.17 5.5 1 6.34 1 8V11.5C1 12.83 2.17 14 3.5 14H5V12C5 11.45 5.45 11 6 11H10C10.55 11 11 10.55 11 10V7H12.5C13.16 7 13.8 6.73 14.27 6.27V3.5C14.27 2.17 13.1 1 11.77 1H7.5ZM5.5 3C6.05 3 6.5 3.45 6.5 4C6.5 4.55 6.05 5 5.5 5C4.95 5 4.5 4.55 4.5 4C4.5 3.45 4.95 3 5.5 3Z" fill="#3776AB"/><path d="M8.5 15C10.16 15 11 13.83 11 12.5V11H8V10.5H12.5C13.83 10.5 15 9.66 15 8V4.5C15 3.17 13.83 2 12.5 2H11V4C11 4.55 10.55 5 10 5H6C5.45 5 5 5.45 5 6V9H3.5C2.84 9 2.2 9.27 1.73 9.73V12.5C1.73 13.83 2.9 15 4.23 15H8.5ZM10.5 13C9.95 13 9.5 12.55 9.5 12C9.5 11.45 9.95 11 10.5 11C11.05 11 11.5 11.45 11.5 12C11.5 12.55 11.05 13 10.5 13Z" fill="#FFD43B"/></svg>`
const SHELL_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 3H14V13H2V3Z" fill="#282C34" stroke="#4E5A5E" stroke-width="0.5"/><path d="M4 6L6 8L4 10" stroke="#89DDFF" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 10H11" stroke="#89DDFF" stroke-width="1.2" stroke-linecap="round"/></svg>`
const DOCKER_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2C4.5 2 3 4 3 5.5V7H1V9C1 10 2 11 4 11.5C5 13 6.5 14 8 14C9.5 14 11 13 12 11.5C14 11 15 10 15 9V7H13C13 5.5 11.5 2 8 2Z" fill="#2496ED"/><rect x="4" y="5" width="2" height="2" rx="0.3" fill="white"/><rect x="7" y="5" width="2" height="2" rx="0.3" fill="white"/><rect x="10" y="5" width="2" height="2" rx="0.3" fill="white"/><rect x="7" y="2.5" width="2" height="2" rx="0.3" fill="white"/><rect x="4" y="8" width="2" height="2" rx="0.3" fill="white"/><rect x="7" y="8" width="2" height="2" rx="0.3" fill="white"/></svg>`
const DATABASE_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="8" cy="4" rx="5.5" ry="2.5" stroke="#E37933" stroke-width="1.2"/><path d="M2.5 4V8C2.5 9.38 5.04 10.5 8 10.5C10.96 10.5 13.5 9.38 13.5 8V4" stroke="#E37933" stroke-width="1.2"/><path d="M2.5 8V12C2.5 13.38 5.04 14.5 8 14.5C10.96 14.5 13.5 13.38 13.5 12V8" stroke="#E37933" stroke-width="1.2"/></svg>`
const CONFIG_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5.5A2.5 2.5 0 1 0 8 10.5A2.5 2.5 0 1 0 8 5.5Z" stroke="#6D8086" stroke-width="1.2"/><path d="M13.5 9.7L12.3 9.9C12.1 10.5 11.8 11 11.4 11.4L11.8 12.6C11.9 12.8 11.8 13 11.6 13.1L10.6 13.7C10.4 13.8 10.2 13.7 10.1 13.6L9.4 12.6C8.8 12.7 8.3 12.7 7.6 12.6L6.9 13.6C6.8 13.8 6.6 13.8 6.4 13.7L5.4 13.1C5.2 13 5.1 12.8 5.2 12.6L5.6 11.4C5.2 11 4.9 10.5 4.7 9.9L3.5 9.7C3.3 9.7 3.1 9.5 3.1 9.3V8.1C3.1 7.9 3.3 7.7 3.5 7.7L4.7 7.5C4.9 6.9 5.2 6.4 5.6 6L5.2 4.8C5.1 4.6 5.2 4.4 5.4 4.3L6.4 3.7C6.6 3.6 6.8 3.7 6.9 3.8L7.6 4.8C8.2 4.7 8.7 4.7 9.4 4.8L10.1 3.8C10.2 3.6 10.4 3.6 10.6 3.7L11.6 4.3C11.8 4.4 11.9 4.6 11.8 4.8L11.4 6C11.8 6.4 12.1 6.9 12.3 7.5L13.5 7.7C13.7 7.7 13.9 7.9 13.9 8.1V9.3C13.9 9.5 13.7 9.7 13.5 9.7Z" fill="#6D8086"/></svg>`
const LOCK_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="7" width="9" height="7" rx="1" fill="#5C6BC0"/><path d="M5.5 7V5C5.5 3.62 6.62 2.5 8 2.5C9.38 2.5 10.5 3.62 10.5 5V7" stroke="#5C6BC0" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="10.5" r="1" fill="white"/></svg>`
const IMAGE_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="2.5" width="13" height="11" rx="1" stroke="#A074C4" stroke-width="1.2"/><circle cx="5" cy="6" r="1.2" fill="#A074C4"/><path d="M2 12L5.5 8.5L7.5 10.5L10 7.5L14 12V13C14 13.55 13.55 14 13 14H3C2.45 14 2 13.55 2 13V12Z" fill="#A074C4"/></svg>`
const VIDEO_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="3" width="9" height="10" rx="1" fill="#DD6666"/><path d="M10 5.5L14.5 3.5V12.5L10 10.5V5.5Z" fill="#DD6666"/><polygon points="6,6 6,10 9.5,8" fill="white"/></svg>`
const AUDIO_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 2V6.27C8.69 6.1 8.36 6 8 6C6.62 6 5.5 7.12 5.5 8.5C5.5 9.88 6.62 11 8 11C9.38 11 10.5 9.88 10.5 8.5V3H12.5L9 2Z" fill="#E535AB"/><path d="M5 8.5C5 6.84 6.34 5.5 8 5.5" stroke="#E535AB" stroke-width="1.2"/><rect x="4" y="10" width="2.5" height="3.5" rx="1" fill="#E535AB"/><rect x="8.5" y="10" width="2.5" height="3.5" rx="1" fill="#E535AB"/><path d="M4 13.5V14.5H2.5V13.5H4ZM12.5 13.5V14.5H11V13.5H12.5Z" fill="#E535AB"/></svg>`
const ARCHIVE_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 1H13L14 2V4H2V2L3 1Z" fill="#6DB56D"/><rect x="2" y="4" width="12" height="11" rx="1" stroke="#6DB56D" stroke-width="1.2"/><path d="M7 7H9V9H7V7Z" fill="#6DB56D"/><path d="M7 10H9V12H7V10Z" fill="#6DB56D"/><line x1="6" y1="4" x2="6" y2="1" stroke="#6DB56D" stroke-width="1"/><line x1="10" y1="4" x2="10" y2="1" stroke="#6DB56D" stroke-width="1"/></svg>`
const DOC_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 1H3.5C2.67 1 2 1.67 2 2.5V13.5C2 14.33 2.67 15 3.5 15H12.5C13.33 15 14 14.33 14 13.5V5L10 1Z" fill="#4285F4"/><path d="M10 1V5H14" stroke="#4285F4" stroke-width="0.5"/><path d="M5 8H11M5 10H11M5 12H9" stroke="white" stroke-width="0.8" stroke-linecap="round"/></svg>`
const EXCEL_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 1H3.5C2.67 1 2 1.67 2 2.5V13.5C2 14.33 2.67 15 3.5 15H12.5C13.33 15 14 14.33 14 13.5V5L10 1Z" fill="#217346"/><path d="M10 1V5H14" stroke="#217346" stroke-width="0.5"/><text x="8" y="12" font-size="7" font-weight="bold" fill="white" text-anchor="middle" font-family="sans-serif">X</text></svg>`

const FOLDER_ICON_BLUE = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 4C1.5 3.17 2.17 2.5 3 2.5H6.1C6.45 2.5 6.78 2.65 7.02 2.91L8.02 4H13C13.83 4 14.5 4.67 14.5 5.5V6.6H1.5V4Z" fill="#7DD3FC"/><path d="M1.25 5.5H14.75L13.8 12.8C13.7 13.58 13.04 14.17 12.25 14.17H3.75C2.96 14.17 2.3 13.58 2.2 12.8L1.25 5.5Z" fill="#3B82F6"/><path d="M2.2 6.5H13.8" stroke="white" stroke-opacity="0.28" stroke-linecap="round"/><path d="M2.4 5.5H14.75L14.55 7H2.2L2.4 5.5Z" fill="#60A5FA" fill-opacity="0.62"/></svg>`

const SYMLINK_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 4C1.5 3.17 2.17 2.5 3 2.5H6.1C6.45 2.5 6.78 2.65 7.02 2.91L8.02 4H13C13.83 4 14.5 4.67 14.5 5.5V6.6H1.5V4Z" fill="#C4B5FD"/><path d="M1.25 5.5H14.75L13.8 12.8C13.7 13.58 13.04 14.17 12.25 14.17H3.75C2.96 14.17 2.3 13.58 2.2 12.8L1.25 5.5Z" fill="#8B5CF6"/><path d="M2.4 5.5H14.75L14.55 7H2.2L2.4 5.5Z" fill="#A78BFA" fill-opacity="0.68"/><path d="M6.15 10.9H5.2C4.15 10.9 3.3 10.05 3.3 9C3.3 7.95 4.15 7.1 5.2 7.1H6.15" stroke="white" stroke-width="1.1" stroke-linecap="round"/><path d="M9.85 7.1H10.8C11.85 7.1 12.7 7.95 12.7 9C12.7 10.05 11.85 10.9 10.8 10.9H9.85" stroke="white" stroke-width="1.1" stroke-linecap="round"/><path d="M5.8 9H10.2" stroke="white" stroke-width="1.1" stroke-linecap="round"/></svg>`

const DEFAULT_FILE_ICON = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 1.2H3.6C2.72 1.2 2 1.92 2 2.8V13.2C2 14.08 2.72 14.8 3.6 14.8H12.4C13.28 14.8 14 14.08 14 13.2V5.2L10 1.2Z" fill="#6B7280"/><path d="M10 1.2V4C10 4.66 10.54 5.2 11.2 5.2H14" fill="#D1D5DB" fill-opacity="0.72"/><path d="M4.6 8.2H11.4M4.6 10.2H10.2M4.6 12.2H8.8" stroke="white" stroke-opacity="0.6" stroke-width="0.8" stroke-linecap="round"/></svg>`

const extMap: IconMap = {
  '.js': { svg: CODE_ICON, color: '#CBCB41' },
  '.jsx': { svg: CODE_ICON, color: '#00D8FF' },
  '.ts': { svg: CODE_ICON, color: '#3178C6' },
  '.tsx': { svg: CODE_ICON, color: '#3178C6' },
  '.mjs': { svg: CODE_ICON, color: '#CBCB41' },
  '.cjs': { svg: CODE_ICON, color: '#CBCB41' },
  '.py': { svg: PYTHON_ICON, color: '#3776AB' },
  '.pyw': { svg: PYTHON_ICON, color: '#3776AB' },
  '.pyi': { svg: PYTHON_ICON, color: '#3776AB' },
  '.rb': { svg: CODE_ICON, color: '#CC342D' },
  '.rs': { svg: CODE_ICON, color: '#DEA584' },
  '.go': { svg: CODE_ICON, color: '#00ADD8' },
  '.java': { svg: CODE_ICON, color: '#5382A1' },
  '.kt': { svg: CODE_ICON, color: '#7F52FF' },
  '.swift': { svg: CODE_ICON, color: '#FA7343' },
  '.c': { svg: CODE_ICON, color: '#599BE5' },
  '.h': { svg: CODE_ICON, color: '#599BE5' },
  '.cpp': { svg: CODE_ICON, color: '#5C8DBC' },
  '.cc': { svg: CODE_ICON, color: '#5C8DBC' },
  '.cxx': { svg: CODE_ICON, color: '#5C8DBC' },
  '.hpp': { svg: CODE_ICON, color: '#5C8DBC' },
  '.cs': { svg: CODE_ICON, color: '#68217A' },
  '.php': { svg: CODE_ICON, color: '#777BB4' },
  '.sh': { svg: SHELL_ICON, color: '#89DDFF' },
  '.bash': { svg: SHELL_ICON, color: '#89DDFF' },
  '.zsh': { svg: SHELL_ICON, color: '#89DDFF' },
  '.fish': { svg: SHELL_ICON, color: '#89DDFF' },
  '.ps1': { svg: SHELL_ICON, color: '#012456' },
  '.bat': { svg: SHELL_ICON, color: '#89DDFF' },
  '.cmd': { svg: SHELL_ICON, color: '#89DDFF' },
  '.html': { svg: CODE_ICON, color: '#E44D26' },
  '.htm': { svg: CODE_ICON, color: '#E44D26' },
  '.css': { svg: CODE_ICON, color: '#563D7C' },
  '.scss': { svg: CODE_ICON, color: '#CF649A' },
  '.sass': { svg: CODE_ICON, color: '#CF649A' },
  '.less': { svg: CODE_ICON, color: '#1D365D' },
  '.vue': { svg: CODE_ICON, color: '#42B883' },
  '.svelte': { svg: CODE_ICON, color: '#FF3E00' },
  '.json': { svg: CODE_ICON, color: '#F5D142' },
  '.xml': { svg: CODE_ICON, color: '#E37933' },
  '.yaml': { svg: CODE_ICON, color: '#CB171E' },
  '.yml': { svg: CODE_ICON, color: '#CB171E' },
  '.toml': { svg: CODE_ICON, color: '#9C4221' },
  '.ini': { svg: CONFIG_ICON, color: '#6D8086' },
  '.cfg': { svg: CONFIG_ICON, color: '#6D8086' },
  '.conf': { svg: CONFIG_ICON, color: '#6D8086' },
  '.env': { svg: LOCK_ICON, color: '#ECD53F' },
  '.sql': { svg: DATABASE_ICON, color: '#E37933' },
  '.md': { svg: DOC_ICON, color: '#4285F4' },
  '.mdx': { svg: DOC_ICON, color: '#4285F4' },
  '.txt': { svg: DOC_ICON, color: '#8B8B8B' },
  '.log': { svg: DOC_ICON, color: '#8B8B8B' },
  '.rtf': { svg: DOC_ICON, color: '#8B8B8B' },
  '.pdf': { svg: DOC_ICON, color: '#DB4437' },
  '.doc': { svg: DOC_ICON, color: '#2B579A' },
  '.docx': { svg: DOC_ICON, color: '#2B579A' },
  '.xls': { svg: EXCEL_ICON, color: '#217346' },
  '.xlsx': { svg: EXCEL_ICON, color: '#217346' },
  '.csv': { svg: EXCEL_ICON, color: '#217346' },
  '.ppt': { svg: DOC_ICON, color: '#D24726' },
  '.pptx': { svg: DOC_ICON, color: '#D24726' },
  '.png': { svg: IMAGE_ICON, color: '#A074C4' },
  '.jpg': { svg: IMAGE_ICON, color: '#A074C4' },
  '.jpeg': { svg: IMAGE_ICON, color: '#A074C4' },
  '.gif': { svg: IMAGE_ICON, color: '#A074C4' },
  '.svg': { svg: IMAGE_ICON, color: '#FFB13B' },
  '.ico': { svg: IMAGE_ICON, color: '#A074C4' },
  '.webp': { svg: IMAGE_ICON, color: '#A074C4' },
  '.bmp': { svg: IMAGE_ICON, color: '#A074C4' },
  '.mp4': { svg: VIDEO_ICON, color: '#DD6666' },
  '.mkv': { svg: VIDEO_ICON, color: '#DD6666' },
  '.avi': { svg: VIDEO_ICON, color: '#DD6666' },
  '.mov': { svg: VIDEO_ICON, color: '#DD6666' },
  '.wmv': { svg: VIDEO_ICON, color: '#DD6666' },
  '.webm': { svg: VIDEO_ICON, color: '#DD6666' },
  '.mp3': { svg: AUDIO_ICON, color: '#E535AB' },
  '.wav': { svg: AUDIO_ICON, color: '#E535AB' },
  '.flac': { svg: AUDIO_ICON, color: '#E535AB' },
  '.ogg': { svg: AUDIO_ICON, color: '#E535AB' },
  '.aac': { svg: AUDIO_ICON, color: '#E535AB' },
  '.m4a': { svg: AUDIO_ICON, color: '#E535AB' },
  '.wma': { svg: AUDIO_ICON, color: '#E535AB' },
  '.zip': { svg: ARCHIVE_ICON, color: '#6DB56D' },
  '.tar': { svg: ARCHIVE_ICON, color: '#8B6C5C' },
  '.gz': { svg: ARCHIVE_ICON, color: '#8B6C5C' },
  '.bz2': { svg: ARCHIVE_ICON, color: '#8B6C5C' },
  '.xz': { svg: ARCHIVE_ICON, color: '#8B6C5C' },
  '.7z': { svg: ARCHIVE_ICON, color: '#6DB56D' },
  '.rar': { svg: ARCHIVE_ICON, color: '#6DB56D' },
  '.tgz': { svg: ARCHIVE_ICON, color: '#8B6C5C' },
  '.rpm': { svg: ARCHIVE_ICON, color: '#DB4437' },
  '.deb': { svg: ARCHIVE_ICON, color: '#8B6C5C' },
  '.dockerfile': { svg: DOCKER_ICON, color: '#2496ED' },
  '.pem': { svg: LOCK_ICON, color: '#5C6BC0' },
  '.key': { svg: LOCK_ICON, color: '#5C6BC0' },
  '.crt': { svg: LOCK_ICON, color: '#5C6BC0' },
  '.pub': { svg: LOCK_ICON, color: '#5C6BC0' },
}

const nameMap: IconMap = {
  'dockerfile': { svg: DOCKER_ICON, color: '#2496ED' },
  '.dockerignore': { svg: DOCKER_ICON, color: '#2496BC' },
  '.gitignore': { svg: CONFIG_ICON, color: '#F34F29' },
  '.gitattributes': { svg: CONFIG_ICON, color: '#F34F29' },
  '.npmrc': { svg: CONFIG_ICON, color: '#CB3837' },
  '.nvmrc': { svg: CONFIG_ICON, color: '#8CC84B' },
  '.eslintrc': { svg: CONFIG_ICON, color: '#4B32C3' },
  '.eslintrc.js': { svg: CONFIG_ICON, color: '#4B32C3' },
  '.prettierrc': { svg: CONFIG_ICON, color: '#56B3B4' },
  'Makefile': { svg: SHELL_ICON, color: '#6D8086' },
  'README': { svg: DOC_ICON, color: '#4285F4' },
  'README.md': { svg: DOC_ICON, color: '#4285F4' },
  'LICENSE': { svg: LOCK_ICON, color: '#D4AF37' },
  'package.json': { svg: CODE_ICON, color: '#CB3837' },
  'tsconfig.json': { svg: CODE_ICON, color: '#3178C6' },
  '.env': { svg: LOCK_ICON, color: '#ECD53F' },
  '.env.local': { svg: LOCK_ICON, color: '#ECD53F' },
  '.env.production': { svg: LOCK_ICON, color: '#ECD53F' },
  'Vagrantfile': { svg: CONFIG_ICON, color: '#1868B2' },
  'Jenkinsfile': { svg: CONFIG_ICON, color: '#D33833' },
  'docker-compose.yml': { svg: DOCKER_ICON, color: '#2496ED' },
  'docker-compose.yaml': { svg: DOCKER_ICON, color: '#2496ED' },
}

const MAX_COMPILED_CACHE_SIZE = 128
const compiledCache = new Map<string, string>()

function getExtFromName(name: string): string {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1) return ''
  return name.slice(dotIndex).toLowerCase()
}

function buildSvg(info: FileIconInfo): string {
  return info.svg.replace(/fill="currentColor"/g, `fill="${info.color}"`)
}

function getCachedIcon(key: string): string | undefined {
  const cached = compiledCache.get(key)
  if (cached === undefined) return undefined
  compiledCache.delete(key)
  compiledCache.set(key, cached)
  return cached
}

function setCachedIcon(key: string, svg: string): string {
  compiledCache.set(key, svg)
  if (compiledCache.size > MAX_COMPILED_CACHE_SIZE) {
    const oldestKey = compiledCache.keys().next().value
    if (oldestKey) compiledCache.delete(oldestKey)
  }
  return svg
}

export function getFileIcon(name: string, isDir: boolean, isSymlink: boolean): string {
  if (isDir && !isSymlink) {
    return FOLDER_ICON_BLUE
  }
  if (isSymlink) {
    return SYMLINK_ICON
  }

  const lowerName = name.toLowerCase()

  if (nameMap[lowerName] || nameMap[name]) {
    const cacheKey = `name:${nameMap[lowerName] ? lowerName : name}`
    const cached = getCachedIcon(cacheKey)
    if (cached !== undefined) return cached

    const info = nameMap[lowerName] || nameMap[name]
    return setCachedIcon(cacheKey, buildSvg(info!))
  }

  const ext = getExtFromName(lowerName)
  if (ext && extMap[ext]) {
    const cacheKey = `ext:${ext}`
    const cached = getCachedIcon(cacheKey)
    if (cached !== undefined) return cached

    return setCachedIcon(cacheKey, buildSvg(extMap[ext]))
  }

  const cached = getCachedIcon('default')
  if (cached !== undefined) return cached

  return setCachedIcon('default', buildSvg({ svg: DEFAULT_FILE_ICON, color: '#8B8B8B' }))
}
