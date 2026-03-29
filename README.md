# 三条定时发送工具 | Santiao Scheduled Sender

> 🤖 基于 ADB 的安卓自动化定时消息发送工具，专为「三条」(SantiaoTalk) 群聊设计。
>
> ADB-based Android automation tool for scheduling text & image messages in SantiaoTalk group chats.

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey)

---

## 📋 功能特色 / Features

| 功能 | 说明 | Feature |
|------|------|---------|
| ⏰ 定时发送 | 支持 cron 表达式，精确控制发送时间 | Cron-based scheduled messaging |
| 📱 自动设备检测 | USB 连接后自动识别安卓设备及屏幕尺寸 | Auto-detect connected Android devices |
| 🖼️ 图文混发 | 同时支持文本消息和图片发送 | Send both text messages and images |
| 📡 群聊扫描 | 自动从手机端扫描并导入群聊列表 | Auto-scan group chats from the phone |
| 🧙 设置向导 | 一键安装三条 App + 配置 ADB 输入法 | Setup wizard: install app + configure ADB IME |
| 🌐 Web 控制台 | 浏览器操作，实时 SSE 状态推送 | Web dashboard with real-time SSE updates |
| 📏 屏幕自适应 | 比例坐标系统，兼容各种分辨率设备 | Ratio-based coordinates for any screen size |
| 📦 零配置分发 | 打包后开箱即用，无需安装 Node.js 或 ADB | Zero-config distribution with bundled runtime |

---

## 🖥️ 系统要求 / Requirements

### 打包版 / Packaged Version
- **操作系统**: macOS 或 Windows
- **安卓手机**: 已开启 USB 调试 (开发者选项)
- **USB 数据线**: 连接手机与电脑

> 打包版自带 Node.js、ADB 和所需 APK，无需额外安装。
> The packaged version bundles Node.js, ADB, and required APKs — nothing else to install.

### 开发环境 / Development
- **Node.js** >= 18
- **ADB** (Android Debug Bridge) 已安装并在 PATH 中
- **安卓手机**: USB 调试已开启

---

## 🚀 快速开始 / Quick Start

### 方式一：打包版（推荐普通用户）/ Packaged Version

**macOS:**
```bash
# 双击启动脚本
双击 启动.command
# 或终端运行
./启动.command
```

**Windows:**
```batch
:: 双击启动脚本
双击 启动.bat
```

浏览器会自动打开 `http://localhost:3456`。
The browser will auto-open `http://localhost:3456`.

### 方式二：开发模式 / Development Mode

```bash
# 1. 克隆项目 / Clone
git clone <repo-url>
cd santiao-scheduler

# 2. 安装依赖 / Install dependencies
npm install

# 3. 启动服务 / Start server
npm start
```

服务默认运行在 **http://localhost:3456**。

---

## 📱 使用流程 / Usage Flow

### 1️⃣ 连接设备 / Connect Device
将安卓手机通过 USB 连接电脑，确保已开启 **USB 调试模式**。

> 首次连接时手机会弹出授权对话框，请点击「允许」。

### 2️⃣ 运行设置向导 / Run Setup Wizard
打开 `http://localhost:3456/setup.html`，向导将自动完成：
- ✅ 检测已连接的设备
- ✅ 安装三条 App (`SantiaoTalk.apk`)
- ✅ 安装并激活 ADB 输入法 (`AdbIME.apk`)
- ✅ 配置设备屏幕参数

### 3️⃣ 扫描群聊 / Scan Groups
在 Web 控制台点击「扫描群聊」，工具会自动：
- 打开三条 App
- 遍历群聊列表
- 导入群聊名称到系统

### 4️⃣ 创建任务 / Create Tasks
在控制台中创建定时发送任务：
- 📝 选择目标群聊
- ✍️ 编写消息内容（支持中文）
- 🖼️ 可选：上传图片附件
- ⏰ 设置发送时间（cron 表达式或指定时刻）

### 5️⃣ 自动执行 / Auto Execute
任务到达设定时间后，系统自动通过 ADB 操控手机完成发送。可在日志页面查看执行结果。

---

## 🔧 配置说明 / Configuration

### 数据文件 / Data Files

所有数据以 JSON 文件存储，支持原子写入：

| 文件 | 用途 | Description |
|------|------|-------------|
| `setup.json` | 设备配置（屏幕尺寸、设备 ID 等） | Device configuration |
| `tasks.json` | 定时任务列表 | Scheduled tasks |
| `groups.json` | 群聊列表 | Group chat list |
| `logs.json` | 执行日志 | Execution logs |
| `templates.json` | 消息模板 | Message templates |

### 服务端口 / Server Port

默认端口为 `3456`，可通过环境变量修改：

```bash
PORT=8080 npm start
```

### 图片上传 / Image Uploads

上传的图片存放在 `uploads/` 目录，通过 Multer 中间件处理。

---

## 📂 项目结构 / Project Structure

```
santiao-scheduler/
├── server.js              # 🚀 主服务入口 / Main server entry
├── package.json
├── lib/
│   ├── adb.js             # 📱 ADB 核心操作 / ADB core operations
│   ├── adb-path.js        # 🔍 ADB 路径解析 / ADB path resolver
│   ├── device-config.js   # 📏 设备配置与屏幕适配 / Device config & screen adaptation
│   ├── scheduler.js       # ⏰ 定时任务调度器 / Cron task scheduler
│   ├── setup.js           # 🧙 设置向导逻辑 / Setup wizard logic
│   └── storage.js         # 💾 JSON 文件存储 / JSON file storage (atomic writes)
├── routes/
│   ├── groups.js          # 群聊相关接口 / Group chat endpoints
│   ├── tasks.js           # 任务相关接口 / Task endpoints
│   ├── templates.js       # 模板相关接口 / Template endpoints
│   ├── logs.js            # 日志相关接口 / Log endpoints
│   ├── setup.js           # 设置向导接口 / Setup wizard endpoints
│   └── misc.js            # 其他接口（设备、SSE）/ Misc endpoints (device, SSE)
├── public/
│   ├── index.html         # 🌐 主控制台页面 / Main dashboard
│   └── setup.html         # 🧙 设置向导页面 / Setup wizard page
├── scripts/
│   ├── package.js         # 📦 打包脚本 / Packaging script
│   ├── prepare-vendor.sh  # 准备 vendor 依赖 / Prepare vendor deps
│   ├── start.sh           # Linux/Mac 启动脚本 / Start script (Unix)
│   ├── start.bat          # Windows 启动脚本 / Start script (Windows)
│   └── start.command      # macOS 启动脚本 / Start script (macOS)
├── resources/
│   ├── SantiaoTalk.apk    # 三条 App 安装包
│   └── AdbIME.apk         # ADB 输入法安装包
├── uploads/               # 上传的图片 / Uploaded images
├── vendor/                # 打包时内嵌的运行时 / Bundled runtime (Node.js, ADB)
├── dist/                  # 打包输出 / Package output
├── 启动.command           # macOS 一键启动 / macOS launcher
└── 启动.bat               # Windows 一键启动 / Windows launcher
```

---

## 🔌 API 接口 / API Reference

### 设备与设置 / Device & Setup

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/device` | 获取当前设备信息 / Get current device info |
| `GET` | `/api/setup/status` | 获取设置状态 / Get setup status |
| `POST` | `/api/setup/run` | 运行设置向导 / Run setup wizard |
| `GET` | `/api/events` | SSE 实时事件流 / SSE real-time event stream |

### 群聊管理 / Group Management

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/groups` | 获取所有群聊 / List all groups |
| `POST` | `/api/groups/scan` | 扫描手机群聊 / Scan groups from phone |
| `DELETE` | `/api/groups/:id` | 删除群聊 / Delete a group |

### 任务管理 / Task Management

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/tasks` | 获取所有任务 / List all tasks |
| `POST` | `/api/tasks` | 创建新任务 / Create a task |
| `PUT` | `/api/tasks/:id` | 更新任务 / Update a task |
| `DELETE` | `/api/tasks/:id` | 删除任务 / Delete a task |
| `POST` | `/api/tasks/:id/run` | 立即执行任务 / Execute task immediately |

### 消息模板 / Templates

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/templates` | 获取所有模板 / List all templates |
| `POST` | `/api/templates` | 创建模板 / Create a template |
| `PUT` | `/api/templates/:id` | 更新模板 / Update a template |
| `DELETE` | `/api/templates/:id` | 删除模板 / Delete a template |

### 日志 / Logs

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/logs` | 获取执行日志 / Get execution logs |
| `DELETE` | `/api/logs` | 清空日志 / Clear logs |

### 图片上传 / Image Upload

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/upload` | 上传图片 / Upload image (multipart/form-data) |

---

## 🛡️ 安全与备份 / Security & Backup

### 安全注意事项 / Security Notes

- ⚠️ 本工具仅在 **localhost** 上运行，不对外暴露端口
- ⚠️ USB 调试模式有较高权限，使用完毕建议关闭
- ⚠️ 不要在公共网络环境下对外开放 3456 端口

### 数据备份 / Backup

所有数据存储在项目根目录的 JSON 文件中，备份只需复制以下文件：

```bash
# 备份关键数据
cp tasks.json tasks.json.bak
cp groups.json groups.json.bak
cp templates.json templates.json.bak
cp setup.json setup.json.bak
```

如需备份上传的图片，同时备份 `uploads/` 目录。

---

## 📦 打包分发 / Distribution

使用内置打包脚本，可生成零配置的分发包：

```bash
# 1. 准备 vendor 依赖（Node.js、ADB 二进制）
bash scripts/prepare-vendor.sh

# 2. 执行打包
npm run package
```

打包输出位于 `dist/` 目录，包含：
- ✅ 内嵌 Node.js 运行时
- ✅ 内嵌 ADB 工具
- ✅ 三条 App + ADB IME APK
- ✅ 一键启动脚本 (`启动.command` / `启动.bat`)

用户双击启动脚本即可使用，无需安装任何开发工具。

---

## 🔧 技术原理 / How It Works

1. **UI 元素检测**: 通过 `uiautomator dump` 和 `dumpsys activity top` 获取当前界面元素
2. **屏幕自适应**: 使用比例坐标系统 (ratio-based)，而非固定像素坐标，自动适配不同分辨率
3. **中文输入**: 通过 ADB IME 输入法，将文本经 Base64 编码后通过 `am broadcast` 发送
4. **定时调度**: 使用 `node-cron` 库解析 cron 表达式，精确触发任务
5. **实时通信**: 服务端通过 SSE (Server-Sent Events) 推送任务状态更新到前端
6. **原子存储**: JSON 文件使用先写入临时文件再重命名的原子写入策略，防止数据损坏

---

## 🤝 贡献指南 / Contributing

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支: `git checkout -b feature/amazing-feature`
3. 提交改动: `git commit -m 'Add amazing feature'`
4. 推送分支: `git push origin feature/amazing-feature`
5. 发起 Pull Request

---

## 📄 License

[ISC License](./LICENSE) - Copyright (c) esmatcm
