# 设备状态仪表盘 (Device Status Dashboard)

设备状态仪表盘是一个实时监控 Web 应用，可追踪您的个人设备（包括 macOS 电脑和 Android 手机）的实时状态。前端采用 React 和 Vite 构建的现代化毛玻璃 UI (Glassmorphism)，后端为 Node.js WebSocket 服务，并搭配 macOS 和 Android 的原生客户端。

## 主要功能

- **实时指标**：查看 CPU 使用率、内存消耗、电池电量及充电状态。
- **前台应用追踪**：查看设备当前正在使用的应用程序（包括应用图标及其持续运行时间）。
- **Android 定位追踪**：在交互式迷你地图上查看您 Android 设备的实时 GPS 位置。
- **实时的充放电电流**：显示手机端目前实时的电池充放电电流。
- **电量趋势历史记录**：24小时的电量历史折线图，支持服务端重启后的数据持久化。
- **安全的自动化部署**：开箱即用的 Docker 与 Caddy 配置，全自动支持 Let's Encrypt HTTPS 和 WSS（安全的 WebSocket）。

## 系统架构

1. **后端 (Backend)**：一个轻量级的 Node.js 服务器，用于管理来自各个客户端和前端 Web 的 WebSocket 连接，并持久化保存电池历史数据。
2. **前端 (Frontend)**：使用 Vite 构建的 React 应用程序，采用自定义的毛玻璃 CSS 样式，并使用 `react-leaflet` 渲染位置地图。
3. **客户端 (Clients)**：
   - **macOS 客户端**：一个使用 `psutil` 和 AppleScript 收集系统状态和前台应用详情的 Python 脚本。
   - **Android 客户端**：一个原生 Kotlin 应用，通过运行前台服务 (Foreground Service) 来收集 `LocationManager` 的位置更新、`UsageStatsManager` 的应用统计数据等。

---

## 🚀 服务端部署 (Server Side)

本项目旨在通过 Docker Compose 和 Caddy 轻松部署在 Linux 服务器（如 Ubuntu VPS）上。

### 准备工作
- 服务器上已安装 Docker 和 Docker Compose。
- 拥有一个已解析到您服务器公网 IP 的域名（例如 `status.example.com`）。

### 部署步骤

1. **克隆代码库**：
   ```bash
   git clone <你的代码库地址>
   cd device-status-dashboard
   ```

2. **配置域名**：
   - 打开根目录的 `Caddyfile`，将 `status.vayki.com` 更改为您的实际域名。
   - 打开 `docker-compose.yml`，找到 `frontend` 服务下的 `build.args.VITE_WS_URL`，将其更改为 `wss://您的域名/ws`。

3. **启动服务**：
   ```bash
   docker compose up -d --build
   ```
   
   Docker 将拉取镜像并构建 Node.js 后端和 React 前端。Caddy 容器将自动向 Let's Encrypt 申请免费的 SSL 证书，并通过 HTTPS 提供仪表盘服务。

4. **访问仪表盘**：
   打开浏览器，访问 `https://您的域名`。

---

## 💻 macOS 客户端运行指南

macOS 客户端是一个 Python 脚本，在后台运行并向服务器发送遥测数据。

### 准备工作
- 已安装 Python 3.x。
- 确保在运行前，修改 `macos_client/client.py` 中的 `SERVER_URL`，使其与您的域名匹配（例如：`wss://您的域名/ws`）。

### 安装与运行

1. 进入 `macos_client` 目录：
   ```bash
   cd macos_client
   ```

2. 创建虚拟环境并安装依赖包：
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install websocket-client psutil
   ```

3. 运行脚本：
   ```bash
   python client.py
   ```
   
   *注意：首次运行时，macOS 系统很可能会弹出提示，要求您授予终端（或 Python）“辅助功能 (Accessibility)”和“屏幕录制 (Screen Recording)”权限。这是为了读取前台应用程序的名称和截取应用图标所必需的。*

4. **（可选）开机自启**：
   您可以将该脚本封装为一个 `.plist` 后台执行文件，并将其放置在 `~/Library/LaunchAgents` 目录下，以实现 macOS 登录时自动启动。

---

## 📱 Android 客户端运行指南

Android 客户端是一个原生 Kotlin 应用，需要授予一些系统级权限以收集遥测数据。

### 准备工作
- 已安装 Android Studio。
- 确保将 `android_client/app/src/main/java/com/example/devicestatus/StatusService.kt` 中的 WebSocket URL 更改为您的域名：
  `val request = Request.Builder().url("wss://您的域名/ws").build()`

### 安装步骤

1. 在 Android Studio 中打开 `android_client` 文件夹。
2. 编译打包 APK 并将其安装到您的 Android 设备上。

### 手机端配置

1. 在手机上打开 **Device Status** 应用。
2. **授予权限**：
   - 点击 **"Grant Usage Access"** 按钮，在系统设置中找到该应用并允许读取“使用情况访问权限”（用于前台应用追踪）。
   - 点击 **"Grant Location Permission"** 按钮，允许其读取位置信息（根据您的需要选择“始终”或“仅在使用中”）。
3. **启动服务**：
   点击 **"Start Service"**。应用将启动一个前台服务，您将在通知栏看到一条常驻通知。
4. 现在，Web 仪表盘上应该已经开始显示您手机的电池指标、位置信息以及当前正在使用的应用了！

---

## 🛠 目录结构概览

- `/backend`: Node.js WebSocket 服务脚本及其 `Dockerfile`。
- `/frontend`: 基于 React + Vite 的 Web 界面代码。包含图表、地图组件及毛玻璃样式。
- `/macos_client`: 负责桥接 macOS 系统 API 并将数据发送到服务器的 Python 脚本。
- `/android_client`: 安卓端的 Android Studio 项目。
- `docker-compose.yml`: 用于编排后端、前端和 Caddy 的 Docker 配置文件。
- `Caddyfile`: 反向代理规则和全自动 TLS (HTTPS) 证书配置。
