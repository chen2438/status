const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const MAX_BATTERY_HISTORY = 1440; // 24 hours at 1-minute sampling
const SAMPLE_INTERVAL_MS = 60 * 1000; // 1 minute
const OFFLINE_THRESHOLD_MS = 30 * 1000; // 30 seconds for stale check
const AUTO_NOTIFY_DELAY_MS = 3 * 60 * 1000; // 3 minutes

// Telegram config from environment
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
const TG_CHAT_ID = process.env.TG_CHAT_ID || '';

// Track auto-notify timers per device
const offlineTimers = {};
// Track last notified time per device (to avoid spam)
const lastNotifiedOffline = {};

function sendTelegramMessage(text) {
  return new Promise((resolve, reject) => {
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
      return reject(new Error('Telegram bot token or chat ID not configured'));
    }
    const payload = JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'HTML' });
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${TG_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(body));
        else reject(new Error(`Telegram API error ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function checkDeviceOffline(deviceId) {
  const state = deviceStates[deviceId];
  if (!state) return;
  const elapsed = Date.now() - state.timestamp;
  if (elapsed > OFFLINE_THRESHOLD_MS) {
    // Avoid spamming: don't re-notify within 10 minutes
    const alreadyNotified = lastNotifiedOffline[deviceId] && (Date.now() - lastNotifiedOffline[deviceId] < 10 * 60 * 1000);
    if (!alreadyNotified) {
      const mins = Math.floor(elapsed / 60000);
      const msg = `⚠️ <b>${deviceId}</b> has been offline for ${mins} minute(s).`;
      sendTelegramMessage(msg)
        .then(() => {
          console.log(`Auto TG notification sent for ${deviceId}`);
          lastNotifiedOffline[deviceId] = Date.now();
        })
        .catch((err) => console.error('Auto TG notification failed:', err.message));
    }
  }
}

function resetOfflineTimer(deviceId) {
  if (offlineTimers[deviceId]) {
    clearTimeout(offlineTimers[deviceId]);
  }
  if (TG_BOT_TOKEN && TG_CHAT_ID) {
    offlineTimers[deviceId] = setTimeout(() => {
      checkDeviceOffline(deviceId);
    }, AUTO_NOTIFY_DELAY_MS);
  }
}

// Store the latest state of devices
const deviceStates = {};

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'battery_history.json');

let batteryHistory = {};
const lastBatteryStoredTime = {};

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadBatteryHistory() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      batteryHistory = JSON.parse(data);
      console.log('Loaded battery history from file');
      for (const [deviceId, history] of Object.entries(batteryHistory)) {
        if (history && history.length > 0) {
          lastBatteryStoredTime[deviceId] = history[history.length - 1].time;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load battery history:', err);
    batteryHistory = {};
  }
}

function saveBatteryHistory() {
  try {
    fs.writeFile(DATA_FILE, JSON.stringify(batteryHistory), 'utf8', (err) => {
      if (err) console.error('Failed to save battery history to file:', err);
    });
  } catch (err) {
    console.error('Failed to trigger save:', err);
  }
}

loadBatteryHistory();

function recordBatteryHistory(deviceId, state) {
  const now = Date.now();
  if (lastBatteryStoredTime[deviceId] && now - lastBatteryStoredTime[deviceId] < SAMPLE_INTERVAL_MS) {
    return;
  }
  lastBatteryStoredTime[deviceId] = now;

  if (!batteryHistory[deviceId]) {
    batteryHistory[deviceId] = [];
  }

  batteryHistory[deviceId].push({
    battery: state.battery,
    isCharging: state.isCharging || false,
    time: now,
  });

  if (batteryHistory[deviceId].length > MAX_BATTERY_HISTORY) {
    batteryHistory[deviceId] = batteryHistory[deviceId].slice(
      batteryHistory[deviceId].length - MAX_BATTERY_HISTORY
    );
  }

  saveBatteryHistory();
}

function broadcastState() {
  const stateStr = JSON.stringify({
    type: 'state_update',
    states: deviceStates,
    batteryHistory: batteryHistory,
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(stateStr);
    }
  });
}

const server = http.createServer((req, res) => {
  // Handle POST /api/notify for manual Telegram notification
  if (req.method === 'POST' && req.url === '/api/notify') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { deviceId } = JSON.parse(body);
        if (!deviceId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'deviceId is required' }));
        }
        if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Telegram not configured on server' }));
        }
        const state = deviceStates[deviceId];
        const lastSeen = state ? new Date(state.timestamp).toLocaleString() : 'Never';
        const msg = `🔔 <b>Manual Alert</b>\nDevice <b>${deviceId}</b> appears offline.\nLast seen: ${lastSeen}`;
        sendTelegramMessage(msg)
          .then(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          })
          .catch((err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Device Status Dashboard Server');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.send(JSON.stringify({
    type: 'state_update',
    states: deviceStates,
    batteryHistory: batteryHistory,
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'device_update') {
        const { deviceId, state } = data;

        if (deviceId && state) {
          deviceStates[deviceId] = {
            ...state,
            timestamp: Date.now()
          };

          if (state.battery != null) {
            recordBatteryHistory(deviceId, state);
          }

          // Reset the offline auto-notify timer
          resetOfflineTimer(deviceId);

          console.log(`Updated state for ${deviceId}:`, state);
          broadcastState();
        }
      }
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
  if (TG_BOT_TOKEN && TG_CHAT_ID) {
    console.log('Telegram notifications enabled');
  } else {
    console.log('Telegram notifications disabled (TG_BOT_TOKEN or TG_CHAT_ID not set)');
  }
});
