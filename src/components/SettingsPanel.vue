<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useTheme } from '../composables/useTheme'
import type { Theme, CustomColors } from '../composables/useTheme'

const { theme, customColors, setTheme, setCustomColors, themeOrder, themeLabels } = useTheme()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const localTheme = ref<Theme>(theme.value)
const localBgColor = ref(customColors.value.bgColor)
const localFontColor = ref(customColors.value.fontColor)
const downloadPath = ref('')
const terminalFontSize = ref(14)
const recentDownloadPaths = ref<string[]>([])
const latencyEnabled = ref(true)
const latencyIntervalSec = ref(10)
const monitorEnabled = ref(true)
const monitorIntervalSec = ref(5)

watch(() => customColors.value, (val) => {
  localBgColor.value = val.bgColor
  localFontColor.value = val.fontColor
})

onMounted(async () => {
  localTheme.value = theme.value
  downloadPath.value = await window.liteSSH.getDownloadPath()
  terminalFontSize.value = await window.liteSSH.getTerminalFontSize()
  recentDownloadPaths.value = await window.liteSSH.getRecentDownloadPaths()
  latencyEnabled.value = await window.liteSSH.getLatencyEnabled()
  latencyIntervalSec.value = (await window.liteSSH.getLatencyIntervalMs()) / 1000
  monitorEnabled.value = await window.liteSSH.getMonitorEnabled()
  monitorIntervalSec.value = (await window.liteSSH.getMonitorIntervalMs()) / 1000
})

function selectTheme(t: Theme) {
  localTheme.value = t
  setTheme(t)
}

function onBgColorChange(e: Event) {
  const value = (e.target as HTMLInputElement).value
  localBgColor.value = value
  setCustomColors({ fontColor: localFontColor.value, bgColor: value })
}

function onFontColorChange(e: Event) {
  const value = (e.target as HTMLInputElement).value
  localFontColor.value = value
  setCustomColors({ fontColor: value, bgColor: localBgColor.value })
}

async function selectDownloadDirectory() {
  const dir = await window.liteSSH.selectDirectory()
  if (dir) {
    downloadPath.value = dir
    await window.liteSSH.setDownloadPath(dir)
  }
}

async function resetDownloadPath() {
  await window.liteSSH.setDownloadPath('')
  downloadPath.value = await window.liteSSH.getDownloadPath()
}

async function updateFontSize(delta: number) {
  const newSize = terminalFontSize.value + delta
  if (newSize < 10 || newSize > 24) return
  terminalFontSize.value = newSize
  await window.liteSSH.setTerminalFontSize(newSize)
}

async function addRecentPath() {
  const dir = await window.liteSSH.selectDirectory()
  if (dir) {
    await useDownloadPath(dir)
  }
}

async function useDownloadPath(dir: string) {
  downloadPath.value = dir
  await window.liteSSH.setDownloadPath(dir)
  await window.liteSSH.addRecentDownloadPath(dir)
  recentDownloadPaths.value = await window.liteSSH.getRecentDownloadPaths()
}

function toggleLatency() {
  latencyEnabled.value = !latencyEnabled.value
}

function toggleMonitor() {
  monitorEnabled.value = !monitorEnabled.value
}

async function handleGlobalSave() {
  await window.liteSSH.setLatencyEnabled(latencyEnabled.value)
  await window.liteSSH.setLatencyIntervalMs(latencyIntervalSec.value * 1000)
  window.dispatchEvent(new CustomEvent('latency-settings-change', {
    detail: { enabled: latencyEnabled.value, intervalMs: latencyIntervalSec.value * 1000 }
  }))

  await window.liteSSH.setMonitorEnabled(monitorEnabled.value)
  await window.liteSSH.setMonitorIntervalMs(monitorIntervalSec.value * 1000)
  window.dispatchEvent(new CustomEvent('monitor-settings-change', {
    detail: { enabled: monitorEnabled.value, intervalMs: monitorIntervalSec.value * 1000 }
  }))

  ElMessage.success('设置已保存')
  emit('close')
}

const themeSwatches: Record<Theme, { bg: string; fg: string }> = {
  dark: { bg: '#0d1117', fg: '#e6edf3' },
  light: { bg: '#ffffff', fg: '#1f2328' },
  eyecare: { bg: '#f5f0e8', fg: '#5c5346' },
  custom: { bg: '#0d1117', fg: '#e6edf3' },
}
</script>

<template>
  <div class="settings-panel">
    <div class="settings-title">设置</div>

    <div class="settings-section">
      <div class="settings-label">外观</div>
      <div class="theme-options">
        <button
          v-for="t in themeOrder"
          :key="t"
          class="theme-option"
          :class="{ active: localTheme === t }"
          @click="selectTheme(t)"
        >
          <span
            class="theme-swatch"
            :style="{
              backgroundColor: t === 'custom' ? customColors.bgColor : themeSwatches[t].bg,
              color: t === 'custom' ? customColors.fontColor : themeSwatches[t].fg,
            }"
          >Aa</span>
          <span class="theme-name">{{ themeLabels[t] }}</span>
        </button>
      </div>
    </div>

    <div v-if="localTheme === 'custom'" class="settings-section custom-colors">
      <div class="settings-label">自定义颜色</div>
      <div class="color-row">
        <label class="color-label">背景颜色</label>
        <div class="color-input-group">
          <input
            type="color"
            :value="localBgColor"
            class="color-picker"
            @input="onBgColorChange"
          />
          <input
            type="text"
            :value="localBgColor"
            class="color-hex"
            @change="onBgColorChange"
          />
        </div>
      </div>
      <div class="color-row">
        <label class="color-label">字体颜色</label>
        <div class="color-input-group">
          <input
            type="color"
            :value="localFontColor"
            class="color-picker"
            @input="onFontColorChange"
          />
          <input
            type="text"
            :value="localFontColor"
            class="color-hex"
            @change="onFontColorChange"
          />
        </div>
      </div>
      <div class="color-preview" :style="{ backgroundColor: localBgColor, color: localFontColor }">
        预览效果 Preview
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-label">下载路径</div>
      <div class="download-path-row">
        <span class="download-path-text" :title="downloadPath">{{ downloadPath }}</span>
        <button class="download-path-btn" @click="selectDownloadDirectory" title="选择目录">浏览</button>
        <button class="download-path-btn download-path-reset" @click="resetDownloadPath" title="重置为默认">重置</button>
      </div>
      <div v-if="recentDownloadPaths.length > 0" class="recent-paths">
        <div class="recent-paths-title">最近使用</div>
        <button
          v-for="p in recentDownloadPaths"
          :key="p"
          class="recent-path-item"
          :title="p"
          @click="useDownloadPath(p)"
        >
          {{ p }}
        </button>
      </div>
      <button class="add-path-btn" @click="addRecentPath">+ 添加下载路径</button>
    </div>

    <div class="settings-section">
      <div class="settings-label">终端字体大小</div>
      <div class="font-size-row">
        <button class="font-size-btn" @click="updateFontSize(-1)">−</button>
        <span class="font-size-value">{{ terminalFontSize }}px</span>
        <button class="font-size-btn" @click="updateFontSize(1)">+</button>
      </div>
      <div class="settings-hint">也可在终端内使用 Ctrl+= / Ctrl+- 调节</div>
    </div>

    <div class="settings-section">
      <div class="settings-label">网络延迟显示</div>
      <div class="latency-toggle-row">
        <span class="latency-toggle-text">{{ latencyEnabled ? '已开启' : '已关闭' }}</span>
        <button class="latency-toggle-btn" :class="{ active: latencyEnabled }" @click="toggleLatency">
          <span class="latency-toggle-indicator"></span>
        </button>
      </div>
      <div v-if="latencyEnabled" class="latency-interval-row">
        <span class="latency-interval-label">刷新间隔</span>
        <button class="font-size-btn" @click="latencyIntervalSec = Math.max(1, latencyIntervalSec - 1)">−</button>
        <span class="font-size-value">{{ latencyIntervalSec }}s</span>
        <button class="font-size-btn" @click="latencyIntervalSec = Math.min(60, latencyIntervalSec + 1)">+</button>
      </div>
      <div class="settings-hint">通过 SSH 通道测算真实输入回显延迟</div>
    </div>

    <div class="settings-section">
      <div class="settings-label">服务器监控</div>
      <div class="latency-toggle-row">
        <span class="latency-toggle-text">{{ monitorEnabled ? '已开启' : '已关闭' }}</span>
        <button class="latency-toggle-btn" :class="{ active: monitorEnabled }" @click="toggleMonitor">
          <span class="latency-toggle-indicator"></span>
        </button>
      </div>
      <div v-if="monitorEnabled" class="latency-interval-row">
        <span class="latency-interval-label">刷新间隔</span>
        <button class="font-size-btn" @click="monitorIntervalSec = Math.max(2, monitorIntervalSec - 1)">−</button>
        <span class="font-size-value">{{ monitorIntervalSec }}s</span>
        <button class="font-size-btn" @click="monitorIntervalSec = Math.min(30, monitorIntervalSec + 1)">+</button>
      </div>
      <div class="settings-hint">右侧面板显示 CPU/内存/磁盘等监控信息</div>
    </div>

    <div class="settings-footer">
      <button class="global-save-btn" @click="handleGlobalSave">保存并关闭</button>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px;
  min-width: 240px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.settings-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.settings-section {
  margin-bottom: 10px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.settings-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  font-weight: 500;
}

.theme-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
}

.theme-option:hover {
  background: var(--bg-tertiary);
  border-color: var(--text-secondary);
}

.theme-option.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}

.theme-swatch {
  width: 28px;
  height: 20px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid rgba(128, 128, 128, 0.3);
}

.theme-name {
  font-weight: 500;
}

.custom-colors {
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
}

.color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.color-label {
  font-size: 12px;
  color: var(--text-primary);
  flex-shrink: 0;
}

.color-input-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-picker {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  padding: 2px;
  background: var(--bg-primary);
}

.color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 2px;
}

.color-hex {
  width: 80px;
  padding: 4px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 11px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  outline: none;
}

.color-hex:focus {
  border-color: var(--accent);
}

.color-preview {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  border: 1px solid var(--border-color);
}

.download-path-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.download-path-text {
  flex: 1;
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  min-width: 0;
}

.download-path-btn {
  padding: 3px 8px;
  font-size: 11px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.download-path-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.download-path-reset {
  color: var(--text-secondary);
}

.download-path-reset:hover {
  color: var(--danger);
  border-color: var(--danger);
}

.recent-paths {
  margin-top: 8px;
  border-top: 1px solid var(--border-color);
  padding-top: 6px;
}

.recent-paths-title {
  font-size: 10px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.recent-path-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 3px 6px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 10px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  cursor: pointer;
  border-radius: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-path-item:hover {
  background: var(--hover-bg);
  color: var(--accent);
}

.add-path-btn {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 4px;
  background: none;
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-path-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.font-size-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.font-size-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
}

.font-size-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.font-size-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 40px;
  text-align: center;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
}

.settings-hint {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 4px;
  opacity: 0.7;
}

.latency-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.latency-toggle-text {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
}

.latency-toggle-btn {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  padding: 0;
  flex-shrink: 0;
}

.latency-toggle-btn.active {
  background: var(--accent);
  border-color: var(--accent);
}

.latency-toggle-indicator {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}

.latency-toggle-btn.active .latency-toggle-indicator {
  transform: translateX(16px);
}

.latency-interval-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.latency-interval-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-right: auto;
}

.save-btn {
  padding: 2px 8px;
  font-size: 10px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.save-btn:hover {
  opacity: 0.85;
}

.data-buttons {
  display: flex;
  gap: 6px;
}

.data-btn {
  flex: 1;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.data-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.data-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-footer {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
}

.global-save-btn {
  padding: 8px 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.global-save-btn:hover {
  opacity: 0.85;
}
</style>