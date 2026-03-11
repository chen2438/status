import time
import json
import psutil
import subprocess
import websocket
import threading
import os
import plistlib
import base64

SERVER_URL = "wss://status.vayki.com/ws"
# SERVER_URL = "ws://localhost:8080"
DEVICE_ID = "macos"

last_app_path = None
last_icon_base64 = None

def get_active_app_info():
    global last_app_path, last_icon_base64
    app_name = "Unknown"
    
    try:
        script = '''
        tell application "System Events"
            set frontApp to first application process whose frontmost is true
            set appName to name of frontApp
            try
                set appPath to POSIX path of (application file of frontApp)
            on error
                set appPath to ""
            end try
            return appName & "|||" & appPath
        end tell
        '''
        result = subprocess.check_output(['osascript', '-e', script], stderr=subprocess.DEVNULL)
        output = result.decode('utf-8').strip()
        parts = output.split("|||")
        app_name = parts[0]
        app_path = parts[1] if len(parts) > 1 else ""
        
        if app_path != last_app_path:
            last_app_path = app_path
            last_icon_base64 = None
            if app_path and os.path.exists(app_path):
                info_plist_path = os.path.join(app_path, "Contents", "Info.plist")
                if os.path.exists(info_plist_path):
                    with open(info_plist_path, 'rb') as f:
                        plist = plistlib.load(f)
                        icon_file = plist.get('CFBundleIconFile')
                        if icon_file:
                            if not icon_file.endswith('.icns'):
                                icon_file += '.icns'
                            icns_path = os.path.join(app_path, "Contents", "Resources", icon_file)
                            if os.path.exists(icns_path):
                                png_path = "/tmp/device_status_app_icon.png"
                                subprocess.check_call(['sips', '-s', 'format', 'png', icns_path, '--out', png_path, '-z', '64', '64'], stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
                                with open(png_path, 'rb') as img_f:
                                    last_icon_base64 = base64.b64encode(img_f.read()).decode('utf-8')
    except Exception:
        pass
    
    return app_name, last_icon_base64

def get_system_stats():
    # Battery
    try:
        battery = psutil.sensors_battery()
        battery_percent = battery.percent if battery else 100
        power_plugged = battery.power_plugged if battery else True
    except Exception:
        battery_percent = 100
        power_plugged = True

    # CPU & Memory
    try:
        cpu_percent = psutil.cpu_percent(interval=None)
        memory = psutil.virtual_memory()
        memory_percent = memory.percent
    except Exception:
        cpu_percent = 0
        memory_percent = 0

    app_name, icon_base64 = get_active_app_info()

    return {
        "battery": round(battery_percent),
        "powerPlugged": power_plugged,
        "cpuPercent": round(cpu_percent),
        "memoryUsedPercent": round(memory_percent),
        "foregroundApp": app_name,
        "foregroundAppIcon": icon_base64
    }

def on_message(ws, message):
    pass

def on_error(ws, error):
    print("WebSocket Error:", error)

def on_close(ws, close_status_code, close_msg):
    print("WebSocket Connection Closed, reconnecting...")

def on_open(ws):
    print("Connected to server as macOS client")
    def run(*args):
        while True:
            stats = get_system_stats()
            payload = {
                "type": "device_update",
                "deviceId": DEVICE_ID,
                "state": stats
            }
            try:
                ws.send(json.dumps(payload))
            except Exception as e:
                print("Failed to send:", e)
                break
            time.sleep(2)
    threading.Thread(target=run, daemon=True).start()

def main():
    # warmup cpu percent
    psutil.cpu_percent()
    time.sleep(0.5)

    while True:
        try:
            ws = websocket.WebSocketApp(SERVER_URL,
                                      on_open=on_open,
                                      on_message=on_message,
                                      on_error=on_error,
                                      on_close=on_close)
            ws.run_forever()
        except Exception as e:
            print("Connection failed:", e)
        time.sleep(5)

if __name__ == "__main__":
    main()
