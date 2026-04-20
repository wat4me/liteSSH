import { ref } from 'vue'

export type Theme = 'dark' | 'light' | 'eyecare'

const THEME_KEY = 'litessh-theme'
const themeOrder: Theme[] = ['dark', 'light', 'eyecare']
const themeLabels: Record<Theme, string> = {
  dark: '深色',
  light: '浅色',
  eyecare: '护眼',
}

const currentTheme = ref<Theme>((localStorage.getItem(THEME_KEY) as Theme) || 'dark')

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem(THEME_KEY, t)
  try {
    if (window.liteSSH?.updateTitleBar) {
      window.liteSSH.updateTitleBar(t)
    }
  } catch {}
}

applyTheme(currentTheme.value)

export function useTheme() {
  function setTheme(t: Theme) {
    currentTheme.value = t
    applyTheme(t)
  }

  function cycleTheme() {
    const idx = themeOrder.indexOf(currentTheme.value)
    const next = themeOrder[(idx + 1) % themeOrder.length]
    setTheme(next)
  }

  return {
    theme: currentTheme,
    setTheme,
    cycleTheme,
    themeOrder,
    themeLabels,
  }
}

export function getTerminalColors(t: Theme) {
  const palettes: Record<Theme, Record<string, string>> = {
    dark: {
      background: '#0d1117',
      foreground: '#e6edf3',
      cursor: '#58a6ff',
      selectionBackground: 'rgba(88,166,255,0.3)',
      black: '#0d1117',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#e6edf3',
      brightBlack: '#8b949e',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#ffffff',
    },
    light: {
      background: '#ffffff',
      foreground: '#1f2328',
      cursor: '#0969da',
      selectionBackground: 'rgba(9,105,218,0.2)',
      black: '#1f2328',
      red: '#cf222e',
      green: '#1a7f37',
      yellow: '#9a6700',
      blue: '#0969da',
      magenta: '#8250df',
      cyan: '#0b7570',
      white: '#656d76',
      brightBlack: '#6e7781',
      brightRed: '#a40e26',
      brightGreen: '#116329',
      brightYellow: '#845306',
      brightBlue: '#0550ae',
      brightMagenta: '#6e40c9',
      brightCyan: '#06615f',
      brightWhite: '#24292f',
    },
    eyecare: {
      background: '#f5f0e8',
      foreground: '#5c5346',
      cursor: '#5b8c5a',
      selectionBackground: 'rgba(91,140,90,0.2)',
      black: '#5c5346',
      red: '#b54a4a',
      green: '#5b8c5a',
      yellow: '#b58c5a',
      blue: '#5a7cb5',
      magenta: '#8c5a8c',
      cyan: '#5a9e9e',
      white: '#8a7f70',
      brightBlack: '#7a7060',
      brightRed: '#c06060',
      brightGreen: '#6a9c6a',
      brightYellow: '#c09c60',
      brightBlue: '#6a8cc0',
      brightMagenta: '#9c6a9c',
      brightCyan: '#6aaeae',
      brightWhite: '#3d3630',
    },
  }
  return palettes[t]
}
