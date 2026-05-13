import { createApp } from 'vue'
import { ElMessage, ElMessageBox, ElTooltip, ElIcon } from 'element-plus'

// On-demand component styles (replaces ~200KB element-plus/dist/index.css)
import 'element-plus/es/components/base/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/tooltip/style/css'
import 'element-plus/es/components/icon/style/css'

import '@xterm/xterm/css/xterm.css'
import App from './App.vue'
import './styles/main.css'

const app = createApp(App)

// Register Element Plus components globally
app.component('ElTooltip', ElTooltip)
app.component('ElIcon', ElIcon)

// Make Element Plus components available globally
app.config.globalProperties.$message = ElMessage
app.config.globalProperties.$msgbox = ElMessageBox

app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue Error]', err, info)
}

window.addEventListener('error', (event) => {
  console.error('[Unhandled Error]', event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise]', event.reason)
})

app.mount('#app')
