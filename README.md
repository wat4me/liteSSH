# liteSSH

一个基于 Electron + Vue 3 + TypeScript 的轻量级 SSH 客户端，集成终端、SFTP 文件管理、服务器资源监控，适合在桌面端快速连接、切换和管理多台 Linux 服务器。

## 功能特性

### 连接管理

- 新建、编辑、删除 SSH 连接
- 支持连接分组、分组排序、默认分组
- 连接可用性测试
- 连接延迟诊断（TCP 连接耗时 / SSH Ready 耗时 / Shell 打开耗时 / Shell 首字节耗时）

### 终端

- 基于 `ssh2` 的交互式 Shell
- `xterm.js` 渲染终端
- 多服务器标签切换
- 同一连接下开启多个子会话
- 窗口尺寸变化自动同步远端终端
- 复制 / 粘贴操作

### SFTP 文件侧栏

- 浏览远程目录，进入/返回/回到主目录
- 手动刷新、同步到终端当前目录
- 跟随终端 `cd` 指令更新文件侧栏路径
- 文件上传与下载，上传确认弹窗
- 传输任务列表实时展示
- 每个 SSH 会话独立缓存文件侧栏状态

### 服务器监控

- 实时 CPU 使用率与每核负载
- 内存使用量 / 缓存 / Swap 详情
- 磁盘分区使用情况
- 进程 Top 5 列表
- 系统信息（主机名 / 内核 / 架构 / 运行时长）

### 设置

- 可配置默认下载目录
- 自定义主题切换
- 下载完成后在系统文件管理器中定位

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Electron 41 + Vue 3 |
| 语言 | TypeScript |
| 终端渲染 | xterm.js |
| SSH 协议 | ssh2 |
| UI 组件 | Element Plus |
| 构建 | Vite + electron-builder |

## 目录结构

```text
liteSSH/
├─ electron/               # Electron 主进程
│  ├─ ssh/
│  │  ├─ manager.ts         # SSH/SFTP 连接管理
│  │  └─ monitor.ts         # 服务器资源监控数据采集
│  ├─ store/
│  │  ├─ credentialStore.ts # 连接凭据持久化
│  │  └─ settingsStore.ts   # 设置持久化
│  ├─ main.ts               # 主进程入口
│  └─ preload.ts            # preload 脚本
├─ src/                     # 渲染进程 (Vue 3)
│  ├─ components/
│  │  ├─ ConnectionForm.vue
│  │  ├─ ConnectionRow.vue
│  │  ├─ FileList.vue
│  │  ├─ FileSidebar.vue
│  │  ├─ GroupPanel.vue
│  │  ├─ MonitorPanel.vue
│  │  ├─ SettingsPanel.vue
│  │  ├─ SubTabBar.vue
│  │  ├─ TabBar.vue
│  │  ├─ TerminalTab.vue
│  │  ├─ TransferList.vue
│  │  └─ UploadConfirmModal.vue
│  ├─ composables/
│  │  ├─ useContextMenu.ts
│  │  ├─ useDragDrop.ts
│  │  ├─ useSessionState.ts
│  │  ├─ useSftpNavigation.ts
│  │  ├─ useTerminalPwd.ts
│  │  ├─ useTheme.ts
│  │  └─ useTransfers.ts
│  ├─ utils/
│  │  └─ format.ts
│  ├─ views/
│  │  └─ ConnectionsView.vue
│  ├─ App.vue
│  ├─ main.ts
│  └─ env.d.ts
├─ build/                   # 构建资源（图标等）
├─ public/
├─ package.json
├─ electron-builder.yml
├─ vite.config.ts
└─ tsconfig.json
```

## 开发环境

**环境要求：**

- Node.js 18+
- npm 9+

**安装依赖：**

```bash
npm install
```

**启动开发模式：**

```bash
npm run dev
```

**构建前端产物：**

```bash
npm run build
```

**打包桌面应用：**

```bash
npm run electron:build
```

## 脚本说明

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发环境 |
| `npm run build` | 类型检查 + 构建前端与 Electron 产物 |
| `npm run preview` | 预览前端构建结果 |
| `npm run electron:build` | 构建并通过 `electron-builder` 打包 |

## 重要设计说明

### 终端输入策略

默认以服务端真实回显为准，避免字符错位、丢字等问题。`TerminalTab.vue` 中保留了乐观本地回显代码路径，但默认关闭。

### SFTP 会话缓存

多个 SSH 会话之间切换时，SFTP 侧栏优先恢复该会话上次缓存的目录和文件列表，不会自动刷新。如需最新状态，手动点击刷新。

### 数据存储

连接信息存储在 Electron `userData` 目录下的 JSON 文件（`connections.json`、`groups.json`、`settings.json`），当前为本地明文存储。适合个人开发环境使用，如需更高安全性，建议接入系统钥匙串或加密存储。


## 许可证

MIT License