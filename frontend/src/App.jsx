import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Battery, BatteryCharging, Cpu, HardDrive, AppWindow, Wifi, WifiOff, Lock } from 'lucide-react';
import BatteryChart from './BatteryChart';
import LocationMap from './LocationMap';

function App() {
  const [deviceStates, setDeviceStates] = useState({});
  const [androidBatteryHistory, setAndroidBatteryHistory] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  useEffect(() => {
    let ws;
    let reconnectTimer;

    const connect = () => {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnectionStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'state_update') {
            setDeviceStates(data.states);
            if (data.batteryHistory && data.batteryHistory.android) {
              setAndroidBatteryHistory(data.batteryHistory.android);
            }
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        reconnectTimer = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleTimeString();
  };

  const isStale = (timestamp) => {
    if (!timestamp) return true;
    return Date.now() - timestamp > 30000; // 30 seconds
  };

  const formatDuration = (seconds) => {
    if (seconds == null) return '';
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const m = Math.floor(seconds / 60) % 60;
    const h = Math.floor(seconds / 3600);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="dashboard-container">
      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>

      <header className="glass-header">
        <div className="logo-section">
          <div className="logo-icon">
            <Monitor size={28} />
            <Smartphone size={20} className="logo-phone-icon" />
          </div>
          <h1>Ecosystem Dashboard</h1>
        </div>
        <div className={`status-badge ${connectionStatus}`}>
          {connectionStatus === 'connected' ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span>{connectionStatus === 'connected' ? 'Server Online' : 'Server Offline'}</span>
        </div>
      </header>

      <main className="devices-grid">
        {/* macOS Card */}
        <div className="device-card glass-panel group">
          <div className="card-header">
            <div className="device-title">
              <div className="icon-wrapper blue">
                <Monitor size={24} className="device-icon" color="#3b82f6" />
              </div>
              <div>
                <h2>macOS Workstation</h2>
                <div className="device-status-text">
                  <div className={`status-dot ${deviceStates.macos && !isStale(deviceStates.macos.timestamp) ? 'active' : 'inactive'}`}></div>
                  {deviceStates.macos && !isStale(deviceStates.macos.timestamp) ? 'Online' : 'Offline'}
                </div>
              </div>
            </div>

          </div>

          <div className="card-body">
            {!deviceStates.macos ? (
              <div className="empty-state">Waiting for device data...</div>
            ) : (
              <div className="metrics-layout">
                <div className="metric-row full">
                  <div className="metric">
                    <div className="metric-label"><Battery size={16} /> Battery</div>
                    <div className="metric-value">
                      <div className="progress-bar-bg">
                        <div className="progress-bar fill-blue" style={{ width: `${deviceStates.macos.battery}%` }}></div>
                      </div>
                      <span className="value-text">{deviceStates.macos.battery}% {deviceStates.macos.powerPlugged && <BatteryCharging size={14} />}</span>
                    </div>
                  </div>
                </div>

                <div className="gauges-row">
                  <div className="metric-gauge">
                    <div className="metric-label"><Cpu size={16} /> CPU</div>
                    <div className="circular-progress">
                      <svg viewBox="0 0 36 36" className="circular-chart blue">
                        <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="circle" strokeDasharray={`${deviceStates.macos.cpuPercent || 0}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <span className="percentage">{deviceStates.macos.cpuPercent || 0}%</span>
                    </div>
                  </div>

                  <div className="metric-gauge">
                    <div className="metric-label"><HardDrive size={16} /> Memory</div>
                    <div className="circular-progress">
                      <svg viewBox="0 0 36 36" className="circular-chart purple">
                        <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="circle" strokeDasharray={`${deviceStates.macos.memoryUsedPercent || 0}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <span className="percentage">{deviceStates.macos.memoryUsedPercent || 0}%</span>
                    </div>
                  </div>
                </div>

                <div className="app-focus-card mac-theme">
                  <div className="app-label"><AppWindow size={14} /> Active Application</div>
                  <div className="app-info">
                    {deviceStates.macos.foregroundAppIcon && (
                      <img
                        src={`data:image/png;base64,${deviceStates.macos.foregroundAppIcon}`}
                        alt="App Icon"
                        className="app-icon"
                      />
                    )}
                    <span className="app-name">{deviceStates.macos.foregroundApp || 'Unknown'}</span>
                  </div>
                </div>

                <div className="last-updated">
                  Last Update: {formatDate(deviceStates.macos.timestamp)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Android Card */}
        <div className="device-card glass-panel group">
          <div className="card-header">
            <div className="device-title">
              <div className="icon-wrapper green">
                <Smartphone size={24} className="device-icon" color="#10b981" />
              </div>
              <div>
                <h2>Android Phone</h2>
                <div className="device-status-text">
                  <div className={`status-dot ${deviceStates.android && !isStale(deviceStates.android.timestamp) ? 'active' : 'inactive'}`}></div>
                  {deviceStates.android && !isStale(deviceStates.android.timestamp) ? 'Online' : 'Offline'}
                </div>
              </div>
            </div>

          </div>

          <div className="card-body">
            {!deviceStates.android ? (
              <div className="empty-state">Waiting for device data...</div>
            ) : (
              <div className="metrics-layout">
                <BatteryChart
                  battery={deviceStates.android.battery}
                  isCharging={deviceStates.android.isCharging}
                  batteryCurrent={deviceStates.android.batteryCurrent}
                  timestamp={deviceStates.android.timestamp}
                  initialHistory={androidBatteryHistory}
                />

                <div className={`app-focus-card ${deviceStates.android.isScreenLocked ? 'locked-theme' : 'android-theme'}`}>
                  <div className="app-label"><AppWindow size={14} /> Foreground App</div>
                  <div className="app-info">
                    {deviceStates.android.isScreenLocked ? (
                      <Lock size={24} className="lock-icon" />
                    ) : (
                      deviceStates.android.foregroundAppIcon && (
                        <img
                          src={`data:image/png;base64,${deviceStates.android.foregroundAppIcon}`}
                          alt="App Icon"
                          className="app-icon"
                        />
                      )
                    )}
                    <div className="app-name-container">
                      <span className="app-name highlight-text">{deviceStates.android.foregroundApp || 'None'}</span>
                      {deviceStates.android.foregroundAppDuration != null && (
                        <span className="app-duration">
                          Time spent: {formatDuration(deviceStates.android.foregroundAppDuration)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <LocationMap location={deviceStates.android.location} />

                <div className="last-updated">
                  Last Update: {formatDate(deviceStates.android.timestamp)}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
