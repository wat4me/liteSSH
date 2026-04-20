<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTheme } from '../composables/useTheme'
import type { Theme, CustomColors } from '../composables/useTheme'

const { theme, customColors, setTheme, setCustomColors, themeOrder, themeLabels } = useTheme()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const localBgColor = ref(customColors.value.bgColor)
const localFontColor = ref(customColors.value.fontColor)

watch(() => customColors.value, (val) => {
  localBgColor.value = val.bgColor
  localFontColor.value = val.fontColor
})

function selectTheme(t: Theme) {
  setTheme(t)
  if (t !== 'custom') {
    emit('close')
  }
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
          :class="{ active: theme === t }"
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

    <div v-if="theme === 'custom'" class="settings-section custom-colors">
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
</style>