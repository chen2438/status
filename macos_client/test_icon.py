import subprocess
import os
import plistlib
import base64

app_path = "/Applications/Antigravity.app"
info_plist_path = os.path.join(app_path, "Contents", "Info.plist")
if os.path.exists(info_plist_path):
    with open(info_plist_path, 'rb') as f:
        plist = plistlib.load(f)
        icon_file = plist.get('CFBundleIconFile')
        if icon_file:
            if not icon_file.endswith('.icns'):
                icon_file += '.icns'
            icns_path = os.path.join(app_path, "Contents", "Resources", icon_file)
            print("icns path:", icns_path)
            if os.path.exists(icns_path):
                png_path = "/tmp/device_status_app_icon.png"
                subprocess.check_call(['sips', '-s', 'format', 'png', icns_path, '--out', png_path, '-z', '64', '64'])
                print("Converted successfully")
