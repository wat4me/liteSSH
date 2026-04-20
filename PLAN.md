# liteSSH 下一步实施计划

## 当前项目状态

### 技术栈
- Electron 33 + Vue 3 + TypeScript + Element Plus
- xterm.js (终端渲染) + ssh2 (SSH连接)
- 暗色/亮色/护眼 三套主题，CSS变量切换

### 项目结构

```
liteSSH/
├── electron/
│   ├── main.ts              # 窗口管理、IPC、菜单隐藏、titleBarOverlay主题同步
│   ├── preload.ts           # contextBridge 桥接
│   ├── ssh/
│   │   └── manager.ts       # ssh2 多session连接池 (connect/disconnect/write/resize)
│   └── store/
│       └── credentialStore.ts  # 明文JSON存储 (connections.json)
├── src/
│   ├── main.ts              # Vue入口
│   ├── App.vue              # 主布局 + ConnectionGroup 数据模型 + 页面状态
│   ├── env.d.ts             # 类型声明 + Window.liteSSH API
│   ├── views/
│   │   └── UnlockView.vue   # (已废弃，解锁流程已移除)
│   ├── components/
│   │   ├── Sidebar.vue      # 连接列表侧边栏 (将被移除)
│   │   ├── ConnectionForm.vue   # 新建/编辑连接弹窗
│   │   ├── TabBar.vue       # 主TAB栏 (按连接分组, 主题切换)
│   │   ├── SubTabBar.vue    # 子TAB栏 (同连接多窗口 "终端 1/2/3" + 加号)
│   │   ├── TerminalTab.vue  # xterm.js 终端组件
│   │   └── EmptyState.vue   # 空状态欢迎页
│   ├── composables/
│   │   └── useTheme.ts      # 主题管理 + xterm色板
│   └── styles/
│       └── main.css         # 三套主题CSS变量 (dark/light/eyecare)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── electron-builder.yml
└── index.html
```

### 当前页面结构

```
┌─────────────────────────────────────────┐
│ titlebar-spacer (liteSSH)    [─ □ ✕]   │
├──────┬──────────────────────────────────┤
│      │ [ Server1 | Server2(3) ]  ☀️     │  ← 主TAB (按连接分组)
│ 侧   │ [ 终端1 | 终端2 | 终端3 | + ]    │  ← 子TAB (同连接多窗口)
│ 边   │                                  │
│ 栏   │        xterm 终端区域             │
│      │                                  │
└──────┴──────────────────────────────────┘
```

### 当前数据模型

```ts
// App.vue 中
interface Session {
  id: string
  connectionId: string
  connectionName: string
  tabNumber: number  // 固定编号，关闭不重命名
}

interface ConnectionGroup {
  connectionId: string
  connectionName: string
  sessions: Session[]
  activeSessionId: string | null
  nextTabNumber: number  // 递增分配 tabNumber
}

// credentialStore.ts 中
interface Connection {
  id: string
  name: string
  host: string
  port: number
  username: string
  password: string
  group?: string       // 当前存的是分组名字符串，需迁移为 groupId
  createdAt: number
  updatedAt: number
}
```

### 当前 IPC API

| 通道 | 方向 | 说明 |
|------|------|------|
| `store:getConnections` | invoke | 获取所有连接 |
| `store:saveConnection` | invoke | 新增/更新连接 |
| `store:deleteConnection` | invoke | 删除连接 |
| `ssh:connect` | invoke | SSH连接，返回 sessionId |
| `ssh:disconnect` | invoke | 断开连接 |
| `ssh:write` | send | 写入终端数据 |
| `ssh:resize` | send | 调整终端尺寸 |
| `titlebar:theme` | send | 更新标题栏颜色 |

---

## 目标页面结构

### 连接管理页面 (ConnectionsView)

```
┌──────────────────────────────────────────────────┐
│ titlebar-spacer                       [─ □ ✕]   │
├────────────┬─────────────────────────────────────┤
│            │  🔍 搜索框               + 新建连接  │
│  分组列表    │─────────────────────────────────────│
│            │                                     │
│  ⭐ 默认分组 │  ┌─────────────────────────────┐   │
│  ▸ 生产环境  │  │ 🟢  Web Server              │   │
│  ▸ 测试环境  │  │ root@192.168.1.1:22         │   │
│  ▸ 个人开发  │  │    [连接] [测试] [编辑] [删除] │   │
│            │  └─────────────────────────────┘   │
│  + 新建分组  │                                     │
│            │  ┌─────────────────────────────┐   │
│            │  │ 🟢  DB Server               │   │
│            │  │ root@192.168.1.2:22         │   │
│            │  │    [连接] [测试] [编辑] [删除] │   │
│            │  └─────────────────────────────┘   │
└────────────┴─────────────────────────────────────┘
```

### 终端工作区 (Workspace) — TabBar 加返回按钮

```
┌──────────────────────────────────────────────────┐
│ titlebar-spacer                       [─ □ ✕]   │
├──────────────────────────────────────────────────┤
│ [🏠] [ Server1 | Server2(3) ]           ☀️       │
│       [ 终端1 | 终端2 | 终端3 | + ]              │
│                                                   │
│                xterm 终端区域                      │
└──────────────────────────────────────────────────┘
```

---

## 详细实施步骤

### 步骤 1：credentialStore.ts — Group 管理

新增 Group 接口和存储：

```ts
export interface Group {
  id: string
  name: string
  order: number        // 排序权重，越小越靠前
  isDefault: boolean   // 默认分组
}
```

新增存储文件 `groups.json`，与 `connections.json` 同目录。

新增方法：
- `getGroups(): Group[]` — 返回按 order 排序的分组列表
- `saveGroup(group: Partial<Group> & { name: string }): Group` — 新增/更新
- `deleteGroup(id: string): boolean` — 删除，关联连接的 group 设为 undefined
- `reorderGroups(orderedIds: string[]): void` — 保存拖拽后的新顺序
- `setDefaultGroup(id: string): void` — 取消旧默认，设置新默认

**数据迁移逻辑（在 load() 中执行）：**
- 检测旧 `connections.json` 中 `group` 字段是字符串名称
- 如果是字符串（非 UUID 格式），自动创建同名 Group，将 group 值改为 groupId
- 迁移后保存文件

**Connection.group 字段变更：**
- 从 `group?: string`（名称）改为 `group?: string`（groupId）
- 类型不变，语义改变
- 未设置 group 的连接归入"未分组"（系统内置，不需要 Group 记录）

---

### 步骤 2：electron/main.ts — 新增 IPC

```ts
// 分组 CRUD
ipcMain.handle('store:getGroups', () => credentialStore.getGroups())
ipcMain.handle('store:saveGroup', (_event, group) => credentialStore.saveGroup(group))
ipcMain.handle('store:deleteGroup', (_event, id) => credentialStore.deleteGroup(id))
ipcMain.handle('store:reorderGroups', (_event, ids) => credentialStore.reorderGroups(ids))
ipcMain.handle('store:setDefaultGroup', (_event, id) => credentialStore.setDefaultGroup(id))

// 测试连接 — 连接成功后立即断开
ipcMain.handle('ssh:testConnection', async (_event, connectionId: string) => {
  const connection = credentialStore.getConnection(connectionId)
  if (!connection) throw new Error('Connection not found')
  
  const start = Date.now()
  return new Promise((resolve) => {
    const client = new Client()
    client.on('ready', () => {
      const latency = Date.now() - start
      client.end()
      resolve({ ok: true, latency })
    })
    client.on('error', (err) => {
      resolve({ ok: false, error: err.message })
    })
    client.connect({
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      readyTimeout: 10000,
    })
  })
})
```

---

### 步骤 3：preload.ts + env.d.ts — 新增 API

preload.ts 新增：

```ts
getGroups: () => ipcRenderer.invoke('store:getGroups'),
saveGroup: (group: any) => ipcRenderer.invoke('store:saveGroup', group),
deleteGroup: (id: string) => ipcRenderer.invoke('store:deleteGroup', id),
reorderGroups: (ids: string[]) => ipcRenderer.invoke('store:reorderGroups', ids),
setDefaultGroup: (id: string) => ipcRenderer.invoke('store:setDefaultGroup', id),
sshTestConnection: (connectionId: string) => ipcRenderer.invoke('ssh:testConnection', connectionId),
```

env.d.ts 新增 Group 接口和 API 类型声明。

---

### 步骤 4：GroupPanel.vue — 分组列表组件

位置：`src/components/GroupPanel.vue`

Props: `groups: Group[]`, `activeGroupId: string | null`
Emits: `select`, `add`, `rename`, `delete`, `setDefault`, `reorder`

功能：
- 分组列表，每项显示：名称 + 连接数量角标
- 默认分组显示 ⭐ 标记
- 点击选中，高亮当前分组
- **拖拽排序**：使用 HTML5 Drag & Drop（draggable、dragstart、dragover、drop），不引入额外库
- hover 时显示操作按钮：重命名（内联编辑）、设为默认、删除
- 底部"+ 新建分组"按钮
- 最后一个固定项"未分组"（不可删除/重命名/拖拽）
- 未分组项的 id 用特殊值 `__ungrouped__`

样式要点：
- 左侧固定宽度 220px
- 选中项 `background: var(--bg-tertiary)`
- 拖拽时降低 opacity，drop 位置显示蓝色指示线

---

### 步骤 5：ConnectionRow.vue — 连接列表行组件

位置：`src/components/ConnectionRow.vue`

Props: `connection: Connection`, `testStatus: { state: 'idle'|'testing'|'success'|'error', latency?: number, error?: string }`
Emits: `connect`, `test`, `edit`, `delete`

布局（单行紧凑）：
```
┌────────────────────────────────────────────────────┐
│ 🟢  Web Server    root@192.168.1.1:22              │
│                   [连接] [✅ 32ms] [编辑] [删除]     │
└────────────────────────────────────────────────────┘
```

测试状态内联显示规则：
- `idle`：按钮显示"测试"
- `testing`：按钮显示"⏳ 测试中..."（禁用状态，旋转动画）
- `success`：按钮显示"✅ 32ms"（绿色），3秒后自动恢复 idle
- `error`：按钮显示"❌ 连接拒绝"（红色），5秒后自动恢复 idle

双击行 → emit `connect`

---

### 步骤 6：ConnectionsView.vue — 组装连接管理页面

位置：`src/views/ConnectionsView.vue`

布局：
```
<div class="connections-page">
  <GroupPanel />          <!-- 左侧 220px -->
  <div class="connections-main">
    <div class="connections-header">  <!-- 搜索框 + 新建连接按钮 -->
    <div class="connections-list">    <!-- ConnectionRow 列表 -->
  </div>
</div>
```

逻辑：
- 维护 `activeGroupId`（选中分组），默认选中默认分组，无默认分组则选第一个
- 过滤 connections：如果选中分组，只显示 `connection.group === activeGroupId` 的连接；如果选中"未分组"，显示 `!connection.group` 的连接
- 搜索框：在当前分组内搜索（名称/地址/用户名）
- 测试连接：维护 `Map<string, TestStatus>` 跟踪每个连接的测试状态
- 点击"连接"或双击 → emit `connect(connectionId)`，由 App.vue 处理

---

### 步骤 7：ConnectionForm.vue 微调

将"分组"字段从文本输入改为 el-select 下拉：
- 选项从 `getGroups()` 获取
- 新建连接时默认选中当前活跃分组
- 保留一个"未分组"选项

---

### 步骤 8：App.vue 页面路由改造

```ts
const page = ref<'connections' | 'workspace'>('connections')
```

- 启动时 `page = 'connections'`
- 点击连接成功后 `page = 'workspace'`
- TabBar 🏠 按钮 `page = 'connections'`
- 所有终端关闭后自动回到 `page = 'connections'`

模板变更：
```html
<!-- connections 页 -->
<ConnectionsView v-if="page === 'connections'" @connect="onConnect" />

<!-- workspace 页 -->
<div v-else class="workspace">
  <TabBar ... @go-connections="page = 'connections'" />
  <SubTabBar ... />
  <div class="terminal-container">...</div>
</div>
```

移除：
- `Sidebar` 组件引用
- `sidebarCollapsed` 状态
- `toggleSidebar` 方法

---

### 步骤 9：TabBar.vue 改造

变更：
- 移除 `sidebarCollapsed` prop
- 移除 `toggle-sidebar` 事件
- 左侧第一个按钮从侧栏切换改为 🏠 图标，emit `go-connections`
- 移除侧栏相关的 SVG 图标

---

### 步骤 10：删除 Sidebar.vue

文件 `src/components/Sidebar.vue` 整体删除。

---

### 步骤 11：构建验证

```bash
npx vite build
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npx electron ." -WorkingDirectory "D:\project\liteSSH"
```

验证：
1. 打开应用 → 显示连接管理页
2. 新建分组 → 拖拽排序
3. 新建连接（选择分组） → 连接行出现
4. 点击测试 → 行内显示 ✅ 成功 / ❌ 失败
5. 双击连接 → 切换到终端工作区
6. 点击 🏠 → 回到连接管理页
7. 主题切换正常
8. 默认分组 → 重启后自动选中

---

## 注意事项

1. **数据迁移**：旧 `connections.json` 中 `group` 是名称字符串，需要在 store 初始化时检测并迁移
2. **拖拽排序**：使用原生 HTML5 Drag & Drop，注意 Windows 上的兼容性处理（dragenter/dragover 需要 preventDefault）
3. **测试连接超时**：`readyTimeout: 10000`（10秒），超时返回 `{ ok: false, error: '连接超时' }`
4. **groups.json 初始状态**：首次使用没有 groups.json，前端应显示空的分组列表 + "未分组"项
5. **主题**：新增的连接管理页所有颜色必须使用 CSS 变量，确保三套主题都生效
6. **Element Plus 深色模式**：已移除 `theme-chalk/dark/css-vars.css`，所有颜色通过自定义 CSS 变量控制
