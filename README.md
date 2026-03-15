# Device Status Dashboard

Device Status Dashboard is a real-time monitoring web application that tracks the live status of your personal devices, including a macOS machine and an Android phone. It features a modern, glassmorphic UI built with React and Vite, a Node.js WebSocket backend, and native clients for macOS and Android.

## Features

- **Real-time Metrics**: View CPU usage, Memory consumption, Battery level, and charging status.
- **Foreground App Tracking**: See which application is currently active on your devices (including the app icon and the duration it has been active).
- **Android Location Tracking**: View the real-time GPS location of your Android device on an interactive mini-map.
- **Battery Trend History**: A 24-hour historical chart of battery levels, with persistent storage across server restarts.
- **Network Info**: View real-time network speed, connection type (Wi-Fi/Cellular), and network name.
- **Top Apps**: See the top 5 most used apps in the past 24 hours.
- **Telegram Notifications**: Get notified via Telegram Bot when a device goes offline (auto-notify after 3 minutes, or trigger manually from the dashboard).
- **Secure Deployment**: Out-of-the-box configuration for Docker and Caddy, providing automatic Let's Encrypt HTTPS and WSS (secure WebSocket) support.

## Architecture

1. **Backend**: A Lightweight Node.js server that manages WebSocket connections from clients and the frontend. It also persists battery history data.
2. **Frontend**: A React application built with Vite, styled with custom CSS (glassmorphism), and using `react-leaflet` for map rendering.
3. **Clients**:
   - **macOS Client**: A Python script that uses `psutil` and AppleScript to collect system stats and foreground app details.
   - **Android Client**: A native Kotlin application running a Foreground Service to collect intents, `LocationManager` updates, and `UsageStatsManager` data.

---

## 🚀 Deployment (Server Side)

The project is designed to be easily deployed on a Linux server (like an Ubuntu VPS) using Docker Compose and Caddy.

### Prerequisites
- Docker and Docker Compose installed on your server.
- A domain name (e.g., `status.example.com`) resolved to your server's public IP address.

### Step-by-Step Deployment

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd device-status-dashboard
   ```

2. **Configure Domain**:
   - Open `Caddyfile` and change `status.vayki.com` to your actual domain name.
   - Open `docker-compose.yml`, locate the `frontend` service `build.args.VITE_WS_URL`, and change it to `wss://your_domain.com/ws`.

3. **Configure Telegram Notifications (Optional)**:
   Open `docker-compose.yml` and edit the `backend` service environment variables:
   ```yaml
   environment:
     - TG_BOT_TOKEN=your_telegram_bot_token_here
     - TG_CHAT_ID=your_telegram_chat_id_here
   ```
   - **Get a Bot Token**: Talk to [@BotFather](https://t.me/BotFather) on Telegram, create a new bot, and copy the token.
   - **Get your Chat ID**: Send a message to your bot, then visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` to find your `chat.id`.
   - If not configured, the dashboard will work normally but without Telegram alert functionality.

4. **Start the Services**:
   ```bash
   docker compose up -d --build
   ```
   
   Docker will build the Node.js backend and the React frontend. The Caddy container will automatically request a free SSL certificate from Let's Encrypt and start serving your dashboard over HTTPS.

5. **Access the Dashboard**:
   Open a browser and navigate to `https://your_domain.com`.

---

## 💻 macOS Client Setup

The macOS client is a Python script that runs in the background and sends telemetry data to the server.

### Prerequisites
- Python 3.x installed.
- Ensure you change the `SERVER_URL` in `macos_client/client.py` to match your domain (e.g., `wss://your_domain.com/ws`).

### Installation and Execution

1. Navigate to the `macos_client` directory.
   ```bash
   cd macos_client
   ```

2. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install websocket-client psutil
   ```

3. Run the script:
   ```bash
   python client.py
   ```
   
   *Note: On the first run, macOS will likely prompt you to grant the Terminal (or Python) "Accessibility" and "Screen Recording" permissions to read the foreground application details and generate icons.*

4. **(Optional) Run on Startup**:
   You can wrap the script in a `.plist` file and place it in `~/Library/LaunchAgents` to have it start automatically when you log into macOS.

---

## 📱 Android Client Setup

The Android client is a native Kotlin app that requires several permissions to gather telemetry.

### Prerequisites
- Android Studio installed.
- Ensure you change the WebSocket URL in `android_client/app/src/main/java/com/example/devicestatus/StatusService.kt` to match your domain:
  `val request = Request.Builder().url("wss://your_domain.com/ws").build()`

### Installation

1. Open the `android_client` folder in Android Studio.
2. Build the APK and install it on your Android device.

### Configuration on Device

1. Open the **Device Status** app on your phone.
2. **Grant Permissions**:
   - Click "Grant Usage Access" and find the app in settings to allow it to read app usage (for foreground app tracking).
   - Click "Grant Location Permission" and allow it to read your location (Always or While in use, based on your preference).
3. **Start Service**:
   Click "Start Service". The app will launch a Foreground Service (you will see a persistent notification).
4. The dashboard will now start showing your phone's battery metrics, location, and the app you are currently looking at.

---

## 🛠 File Structure Overview

- `/backend`: Node.js WebSocket server script and `Dockerfile`.
- `/frontend`: React + Vite application. Contains `App.jsx`, `BatteryChart.jsx`, `LocationMap.jsx`, and styles.
- `/macos_client`: Python script for bridging macOS system APIs to the server.
- `/android_client`: Android Studio project.
- `docker-compose.yml`: Orchestration file joining the backend, frontend, and Caddy.
- `Caddyfile`: Reverse proxy rules and automatic TLS configuration.
