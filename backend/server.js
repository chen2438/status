const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const MAX_BATTERY_HISTORY = 1440; // 24 hours at 1-minute sampling
const SAMPLE_INTERVAL_MS = 60 * 1000; // 1 minute

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Device Status Dashboard Server');
});

const wss = new WebSocket.Server({ server });

// Store the latest state of devices
const deviceStates = {};

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'battery_history.json');

// Store battery history per device: { 'android': [ { battery, isCharging, time }, ... ] }
let batteryHistory = {};
// Track last stored time per device for 1-minute dedup
const lastBatteryStoredTime = {};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load history from file on startup
function loadBatteryHistory() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      batteryHistory = JSON.parse(data);
      console.log('Loaded battery history from file');

      // Initialize last stored time for each device to its most recent entry
      for (const [deviceId, history] of Object.entries(batteryHistory)) {
        if (history && history.length > 0) {
          lastBatteryStoredTime[deviceId] = history[history.length - 1].time;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load battery history:', err);
    // Reset if file is corrupted
    batteryHistory = {};
  }
}

// Save history to file
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
  // Only store if at least 1 minute has passed since last entry
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

  // Trim to max size
  if (batteryHistory[deviceId].length > MAX_BATTERY_HISTORY) {
    batteryHistory[deviceId] = batteryHistory[deviceId].slice(
      batteryHistory[deviceId].length - MAX_BATTERY_HISTORY
    );
  }

  // Persist to disk
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

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send current state + full battery history immediately upon connection
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

          // Record battery history (1-min dedup handled inside)
          if (state.battery != null) {
            recordBatteryHistory(deviceId, state);
          }

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
});

