import { getClassWithColor } from 'file-icons-js'

const iconClassCache = new Map<string, string>()
const MAX_ICON_CLASS_CACHE_SIZE = 256

function getCachedIconClass(key: string): string | undefined {
  const cached = iconClassCache.get(key)
  if (cached === undefined) return undefined
  iconClassCache.delete(key)
  iconClassCache.set(key, cached)
  return cached
}

function setCachedIconClass(key: string, value: string): string {
  iconClassCache.set(key, value)
  if (iconClassCache.size > MAX_ICON_CLASS_CACHE_SIZE) {
    const oldestKey = iconClassCache.keys().next().value
    if (oldestKey) iconClassCache.delete(oldestKey)
  }
  return value
}

export function getFileIconClass(name: string, isDir: boolean, isSymlink: boolean): string {
  if (isSymlink) return 'icon link-icon medium-blue'
  if (isDir) return 'file-icon-folder'

  const cacheKey = name.toLowerCase()
  const cached = getCachedIconClass(cacheKey)
  if (cached !== undefined) return cached

  return setCachedIconClass(cacheKey, `icon ${getClassWithColor(name) || 'text-icon medium-blue'}`)
}
