# liteSSH

liteSSH 是一个基于 Electron、Vue 3 和 TypeScript 的轻量级 SSH 桌面客户端，集成终端、SFTP 文件管理、服务器监控和 AI 助手，适合快速连接、切换和管理多台 Linux 服务器。

## 功能特性

### 连接管理

- 新建、编辑、删除 SSH 连接
- 支持连接分组、分组排序和默认分组
- 支持密码和私钥认证
- 统一凭据管理：保存和复用 SSH 密码/私钥，连接时可从凭据列表选择和自动填充
- 支持连接可用性测试
- 支持连接延迟诊断，包括 TCP、SSH Ready、Shell 打开和 Shell 首字节耗时
- 持久化 SSH 主机密钥（known_hosts），首次连接确认指纹，密钥变更时拒绝并提示

### 终端

- 基于 `ssh2` 的交互式 Shell
- 使用 `xterm.js` 渲染终端
- 支持多服务器标签切换
- 支持同一连接下打开多个子会话
- 支持水平 / 垂直分屏，同时显示两个终端，分屏拖拽条支持双击重置
- 窗口尺寸变化时自动同步远端终端尺寸
- 支持复制、粘贴、搜索和字体大小调整
- 启用 TCP_NODELAY 关闭 Nagle 算法，降低按键回显延迟
- 按键时光标短暂高亮，即时确认客户端已接收
- 子标签栏按会话显示实时 RTT 延迟（绿 / 黄 / 红分级）
- 支持批量命令面板，一次向多个会话广播命令

### SFTP 文件侧栏

- 浏览远程目录，支持进入、返回、回到主目录
- 手动刷新，同步到终端当前目录
- 支持跟随终端 `cd` 命令自动更新文件侧栏路径
- 支持文件上传、下载和上传确认
- 支持传输任务列表实时展示，含传输速度和进度百分比
- 支持文件重命名、编辑（内置模态编辑器）和修改权限（chmod/chown，目录可递归）
- 每个 SSH 会话独立缓存文件侧栏状态

### AI 助手

- 左侧侧栏内置 AI 对话面板
- 支持 OpenAI-compatible Chat Completions 接口
- 支持自定义 Base URL、模型名、API Key、系统提示词和温度
- 默认系统提示词面向 SSH、Linux 命令、日志分析和运维排障，并优先使用中文回复
- 支持流式输出
- 支持 Markdown 渲染
- 支持展示模型返回的思考内容，默认折叠
- 支持展示 token 用量，按模型厂商返回情况自动显示
- 支持选中终端文本后发送给 AI 或放入 AI 输入框，选中文本按 SSH 会话精准路由
- AI 会话按 SSH 会话隔离，切换标签时保留侧栏状态
- AI 侧栏与文件侧栏互斥显示，避免界面冲突
- AI 对话历史以 JSONL 保存到本地，重启后可从历史记录恢复

### 服务器监控

- 实时 CPU 使用率和每核负载
- 内存、缓存、Swap 使用情况
- 磁盘分区使用情况
- Top 进程列表
- 主机名、内核、架构和运行时长等系统信息

### 设置

- 配置默认下载目录
- 配置主题和自定义颜色
- 配置终端字体大小
- 配置延迟显示和服务器监控刷新间隔
- 下载完成后可在系统文件管理器中定位

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Electron 41 + Vue 3 |
| 语言 | TypeScript |
| 终端渲染 | xterm.js |
| SSH 协议 | ssh2 |
| UI 组件 | Element Plus |
| 文件图标 | file-icons-js |
| 构建 | Vite + electron-builder |

## 目录结构

```text
liteSSH/
├── electron/                       # Electron 主进程
│   ├── ipc/
│   │   ├── registerStoreHandlers.ts   # 连接 / 分组 / 设置 IPC
│   │   ├── registerSshHandlers.ts     # SSH 连接 / 终端 / SFTP IPC
│   │   ├── registerAiHandlers.ts      # AI 对话 / 流式响应 / 历史 IPC
│   │   └── registerUpdaterHandlers.ts # 自动更新 IPC
│   ├── ssh/
│   │   ├── manager.ts                 # SSH/SFTP 连接管理
│   │   ├── monitor.ts                 # 服务器监控数据采集
│   │   ├── diagnosis.ts               # 连接延迟诊断
│   │   └── knownHosts.ts              # SSH 主机密钥校验与持久化
│   ├── store/
│   │   ├── credentialStore.ts         # 连接凭据持久化
│   │   └── settingsStore.ts           # 设置持久化
│   ├── window/createWindow.ts         # 主窗口创建
│   ├── utils/validation.ts            # 参数校验工具
│   ├── main.ts                        # 主进程入口
│   └── preload.ts                     # preload 脚本
├── src/                            # Vue 渲染进程
│   ├── components/
│   │   ├── AiSidebar.vue
│   │   ├── FileSidebar.vue
│   │   ├── FileEditorModal.vue
│   │   ├── FilePropertiesModal.vue
│   │   ├── MonitorPanel.vue
│   │   ├── TerminalTab.vue
│   │   ├── BatchCommandPanel.vue
│   │   └── ...
│   ├── composables/                # 可复用逻辑
│   │   ├── useSessionManager.ts
│   │   ├── useSidebarState.ts
│   │   ├── useLatencyState.ts
│   │   ├── useTerminalLatency.ts
│   │   ├── useTerminalKeyHandler.ts
│   │   ├── useTerminalSearch.ts
│   │   ├── useTerminalPwdQuery.ts
│   │   ├── useCommandBuffer.ts
│   │   ├── useRenderBatch.ts
│   │   ├── useWriteQueue.ts
│   │   ├── usePasteDetection.ts
│   │   ├── useSplitTerminal.ts
│   │   ├── useTransfers.ts
│   │   ├── useContextMenu.ts
│   │   ├── useBatchCommand.ts
│   │   ├── useAppKeyboard.ts
│   │   ├── useAiChat.ts
│   │   ├── useMarkdownRenderer.ts
│   │   └── ...
│   ├── views/
│   ├── App.vue
│   ├── main.ts
│   └── env.d.ts
├── build/                          # 构建资源
├── public/
├── package.json
├── electron-builder.yml
├── vite.config.ts
└── tsconfig.json
```

## 开发环境

要求：

- Node.js 18+
- npm 9+

安装依赖：

```bash
npm install
```

启动开发模式：

```bash
npm run dev
```

构建前端和 Electron 产物：

```bash
npm run build
```

打包桌面应用：

```bash
npm run electron:build
```

## 脚本说明

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动 Vite 和 Electron 开发环境 |
| `npm run build` | 类型检查并构建前端与 Electron 产物 |
| `npm run preview` | 预览前端构建结果 |
| `npm run electron:build` | 构建并通过 `electron-builder` 打包桌面应用 |

## 重要设计说明

### 终端输入策略

终端默认以服务端真实回显为准，避免本地乐观回显导致字符错位、丢字等问题。
为缓解高延迟下的"卡顿感"，做了以下零副作用的优化：

- **TCP_NODELAY**：建立连接后立即关闭 Nagle 算法，让单字节按键不被 TCP 合并发送，最大化降低首字节往返时间
- **光标按键反馈**：用户按键时光标短暂高亮发光，给出"已接收"的视觉确认
- **按 session 显示 RTT**：终端子标签栏实时显示每个会话的延迟，让用户清楚区分"网络慢"和"应用卡"

不做本地预测回显（参考 OpenSSH / PuTTY / iTerm2 等主流客户端的策略）：
本地预测在 vim / less / readline 行编辑 / Tab 补全 / 密码输入等场景下
容易产生错位、闪烁或安全问题，正确性收益不抵成本。需要更激进的低延迟体验
请考虑使用 [Mosh](https://mosh.org/) 等专门方案。

### SFTP 会话缓存

多个 SSH 会话之间切换时，SFTP 侧栏会优先恢复该会话上次缓存的目录、路径和状态。若需要最新远端状态，请手动刷新。

### AI 会话与历史

AI 对话按 SSH 会话隔离，避免不同终端会话之间共享上下文。对话记录保存为 JSONL 文件，位于 Electron `userData/ai-history` 目录，可用于应用重启后的历史恢复。

### 数据存储

连接、分组、设置等数据存储在 Electron `userData` 目录下。连接密码会优先使用系统安全存储能力；当系统加密能力不可用时，应用会给出提示。

## 更新日志

### v0.2.4 (开发中)

- 新增统一凭据管理：保存、复用 SSH 密码/私钥，连接表单支持凭据列表选择和自动填充
- 新增文件编辑器：内置模态编辑器，按文件类型白名单打开，Ctrl+S 保存，脏标记提示
- 新增文件属性：chmod/chown 操作，目录支持递归修改权限
- 新增文件重命名：模态框操作，支持 Enter 确认 / Esc 取消
- 传输列表：实时显示传输速度（B/s、KB/s、MB/s）和进度百分比
- 分屏优化：拖拽条加宽命中区域、视觉手柄、双击重置、拖拽遮罩
- 文件图标迁移至 `file-icons-js` 库，侧栏图标更丰富准确
- 右键菜单：边界检测防止溢出，内容过多时可滚动

### v0.2.1

- 重构 Electron 主进程：拆分 1450 行的 `main.ts` 为 IPC handlers / window / utils 模块
- 重构渲染进程：抽离 16 个 composables（会话、侧栏、延迟、终端按键 / 搜索 / 命令缓冲 / 渲染批处理 等）
- 新增分屏功能：水平 / 垂直分屏，同时显示两个终端
- 新增批量命令面板：一次向多个会话广播命令
- 新增持久化 known_hosts：首次连接确认指纹，密钥变更时拒绝
- 终端延迟体验优化：启用 TCP_NODELAY，按键光标高亮反馈，子标签栏按 session 显示 RTT
- 修复多处 TypeScript 类型错误，补充 `*.vue` 模块声明
- 启用 vendor chunk 拆分（vue / element-plus / xterm / icons）

### v0.1.6

- 修复 AI 侧栏中文文本乱码问题
- AI 侧栏切换时保留状态（不再销毁重建）
- 修复终端选中文本跨会话误发送问题，新增 sessionId 路由
- 修复选中文本重复消费问题，增加去重机制
- 修复 AI 流式响应未正确清理导致的内存泄漏
- AI 侧栏与文件侧栏改为互斥显示

## 许可

MIT License
