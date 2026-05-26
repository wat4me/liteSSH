# liteSSH

liteSSH 是一个基于 Electron、Vue 3 和 TypeScript 的轻量级 SSH 桌面客户端，集成终端、SFTP 文件管理、服务器监控和 AI 助手，适合快速连接、切换和管理多台 Linux 服务器。

## 功能特性

### 连接管理

- 新建、编辑、删除 SSH 连接
- 支持连接分组、分组排序和默认分组
- 支持密码和私钥认证
- 支持连接可用性测试
- 支持连接延迟诊断，包括 TCP、SSH Ready、Shell 打开和 Shell 首字节耗时

### 终端

- 基于 `ssh2` 的交互式 Shell
- 使用 `xterm.js` 渲染终端
- 支持多服务器标签切换
- 支持同一连接下打开多个子会话
- 窗口尺寸变化时自动同步远端终端尺寸
- 支持复制、粘贴、搜索和字体大小调整

### SFTP 文件侧栏

- 浏览远程目录，支持进入、返回、回到主目录
- 手动刷新，同步到终端当前目录
- 支持跟随终端 `cd` 命令自动更新文件侧栏路径
- 支持文件上传、下载和上传确认
- 支持传输任务列表实时展示
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
- 支持选中终端文本后发送给 AI 或放入 AI 输入框
- AI 会话按 SSH 会话隔离
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
| 构建 | Vite + electron-builder |

## 目录结构

```text
liteSSH/
├── electron/                 # Electron 主进程
│   ├── ssh/
│   │   ├── manager.ts         # SSH/SFTP 连接管理
│   │   └── monitor.ts         # 服务器监控数据采集
│   ├── store/
│   │   ├── credentialStore.ts # 连接凭据持久化
│   │   └── settingsStore.ts   # 设置持久化
│   ├── main.ts                # 主进程入口和 IPC
│   └── preload.ts             # preload 脚本
├── src/                       # Vue 渲染进程
│   ├── components/
│   │   ├── AiSidebar.vue
│   │   ├── FileSidebar.vue
│   │   ├── MonitorPanel.vue
│   │   ├── TerminalTab.vue
│   │   └── ...
│   ├── composables/
│   ├── utils/
│   ├── views/
│   ├── App.vue
│   ├── main.ts
│   └── env.d.ts
├── build/                     # 构建资源
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

终端默认以服务端真实回显为准，避免本地乐观回显导致字符错位、丢字等问题。`TerminalTab.vue` 中保留了本地回显相关判断，但实际输入仍以远端回显为准。

### SFTP 会话缓存

多个 SSH 会话之间切换时，SFTP 侧栏会优先恢复该会话上次缓存的目录、路径和状态。若需要最新远端状态，请手动刷新。

### AI 会话与历史

AI 对话按 SSH 会话隔离，避免不同终端会话之间共享上下文。对话记录保存为 JSONL 文件，位于 Electron `userData/ai-history` 目录，可用于应用重启后的历史恢复。

### 数据存储

连接、分组、设置等数据存储在 Electron `userData` 目录下。连接密码会优先使用系统安全存储能力；当系统加密能力不可用时，应用会给出提示。

## 许可

MIT License
