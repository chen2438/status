package com.example.devicestatus

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import okhttp3.*
import org.json.JSONObject
import org.json.JSONArray
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.net.wifi.WifiManager
import android.telephony.TelephonyManager
import java.util.concurrent.TimeUnit
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import java.io.ByteArrayOutputStream

class StatusService : Service() {

    private val CHANNEL_ID = "StatusServiceChannel"
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .build()
    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false
    private var isWsConnected = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastForegroundPackage: String = ""
    private var lastSentForegroundApp: String = ""
    private var foregroundAppStartTime: Long = System.currentTimeMillis()
    private var lastSentIconPackage: String = ""
    private var cachedIconBase64: String? = null
    private var locationManager: LocationManager? = null
    private var lastTxBytes: Long = TrafficStats.getTotalTxBytes()
    private var lastRxBytes: Long = TrafficStats.getTotalRxBytes()
    private var lastTrafficTimestamp: Long = System.currentTimeMillis()
    private var cachedWifiSsid: String = ""



    private val updateRunnable = object : Runnable {
        override fun run() {
            if (isRunning) {
                if (!isWsConnected) {
                    startWebSocket()
                } else {
                    sendDeviceUpdate()
                }
                handler.postDelayed(this, 2000)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("Device Status")
                .setContentText("Syncing with Dashboard...")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .build()
        } else {
            Notification.Builder(this)
                .setContentTitle("Device Status")
                .setContentText("Syncing with Dashboard...")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .build()
        }

        startForeground(1, notification)
        
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "StatusService::WakeLock")
        wakeLock?.acquire()
        
        startWebSocket()

        isRunning = true
        handler.post(updateRunnable)

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        handler.removeCallbacks(updateRunnable)
        webSocket?.close(1000, "Service stopped")
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startWebSocket() {
        // NOTE: Uses 10.0.2.2 for Android Emulator to host localhost. 
        // If testing on real device on same network, user needs to change this IP.
//        val request = Request.Builder().url("ws://10.0.2.2:8080").build()
//        val request = Request.Builder().url("ws://172.19.161.181:8080").build()
        val request = Request.Builder().url("wss://status.vayki.com/ws").build()

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("StatusService", "Connected to WS")
                isWsConnected = true
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("StatusService", "WS Closed")
                isWsConnected = false
                this@StatusService.webSocket = null
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("StatusService", "WS Error", t)
                isWsConnected = false
                this@StatusService.webSocket = null
            }
        }
        webSocket = client.newWebSocket(request, listener)
    }

    private fun sendDeviceUpdate() {
        if (webSocket == null) return

        val batteryLevel = getBatteryLevel()
        val isCharging = isBatteryCharging()
        val batteryCurrent = getBatteryCurrent()
        val isScreenLocked = isScreenLocked()
        val foregroundPackage = if (isScreenLocked) "" else getForegroundPackage()
        val foregroundApp = if (isScreenLocked) "Screen Locked" else getAppName(foregroundPackage)

        // Only regenerate icon when the foreground package changes
        val foregroundAppIcon: String? = if (isScreenLocked) {
            null
        } else if (foregroundPackage != lastSentIconPackage) {
            val icon = getAppIconBase64(foregroundPackage)
            lastSentIconPackage = foregroundPackage
            cachedIconBase64 = icon
            icon
        } else {
            cachedIconBase64
        }

        // Track duration
        val now = System.currentTimeMillis()
        if (foregroundApp != lastSentForegroundApp) {
            lastSentForegroundApp = foregroundApp
            foregroundAppStartTime = now
        }
        val durationSecs = (now - foregroundAppStartTime) / 1000

        val state = JSONObject().apply {
            put("battery", batteryLevel)
            put("isCharging", isCharging)
            put("batteryCurrent", batteryCurrent)
            put("isScreenLocked", isScreenLocked)
            put("foregroundApp", foregroundApp)
            put("foregroundAppDuration", durationSecs)
            if (foregroundAppIcon != null) {
                put("foregroundAppIcon", foregroundAppIcon)
            }
            val location = getCurrentLocation()
            location?.let { loc ->
                put("location", JSONObject().apply {
                    put("lat", loc.latitude)
                    put("lng", loc.longitude)
                })
            }
            val networkInfo = getNetworkInfo()
            put("network", networkInfo)

            val topUsageApps = getTopUsageApps()
            put("topUsageApps", topUsageApps)
        }

        val payload = JSONObject().apply {
            put("type", "device_update")
            put("deviceId", "android")
            put("state", state)
        }

        webSocket?.send(payload.toString())
    }

    private fun getBatteryLevel(): Int {
        val batteryManager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }

    private fun getBatteryCurrent(): Int {
        val batteryManager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val microAmps = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
        return microAmps / 1000 // Convert to milliAmperes
    }

    private fun isScreenLocked(): Boolean {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        return !powerManager.isInteractive
    }

    private fun isBatteryCharging(): Boolean {
        val batteryManager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val status = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS)
            status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        } else {
            false // fallback for older versions
        }
    }

    private fun getCurrentLocation(): Location? {
        return try {
            val gpsLocation = locationManager?.getLastKnownLocation(LocationManager.GPS_PROVIDER)
            val networkLocation = locationManager?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            // Prefer the more recent one
            when {
                gpsLocation != null && networkLocation != null ->
                    if (gpsLocation.time >= networkLocation.time) gpsLocation else networkLocation
                gpsLocation != null -> gpsLocation
                networkLocation != null -> networkLocation
                else -> null
            }
        } catch (e: SecurityException) {
            Log.e("StatusService", "Location permission denied", e)
            null
        }
    }

    private fun getNetworkInfo(): JSONObject {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork
        val caps = if (network != null) cm.getNetworkCapabilities(network) else null

        var networkType = "none"
        var networkName = ""

        if (caps != null) {
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                networkType = "wifi"
                try {
                    // Modern approach: get WifiInfo from TransportInfo (Android 12+, API 29+)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        val transportInfo = caps.transportInfo
                        if (transportInfo is android.net.wifi.WifiInfo) {
                            val ssid = transportInfo.ssid?.replace("\"", "") ?: ""
                            if (ssid.isNotEmpty() && ssid != "<unknown ssid>") {
                                networkName = ssid
                                cachedWifiSsid = ssid
                            }
                        }
                    }
                    // Fallback: try deprecated WifiManager
                    if (networkName.isEmpty()) {
                        val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                        val wifiInfo = wifiManager.connectionInfo
                        val ssid = wifiInfo.ssid?.replace("\"", "") ?: ""
                        if (ssid.isNotEmpty() && ssid != "<unknown ssid>") {
                            networkName = ssid
                            cachedWifiSsid = ssid
                        }
                    }
                    // Last resort: use cache
                    if (networkName.isEmpty() && cachedWifiSsid.isNotEmpty()) {
                        networkName = cachedWifiSsid
                    }
                    if (networkName.isEmpty()) networkName = "Unknown"
                } catch (e: Exception) {
                    networkName = if (cachedWifiSsid.isNotEmpty()) cachedWifiSsid else "Unknown"
                }
            } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                networkType = "cellular"
                try {
                    val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                    // Use the data SIM's subscription for dual-SIM phones
                    val dataSubId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        android.telephony.SubscriptionManager.getDefaultDataSubscriptionId()
                    } else {
                        -1
                    }
                    val dataTm = if (dataSubId > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        tm.createForSubscriptionId(dataSubId)
                    } else {
                        tm
                    }
                    val operatorName = dataTm.networkOperatorName ?: ""
                    val simName = dataTm.simOperatorName ?: ""
                    networkName = when {
                        operatorName.isNotEmpty() -> operatorName
                        simName.isNotEmpty() -> simName
                        else -> "Unknown"
                    }
                } catch (e: Exception) {
                    networkName = "Unknown"
                }
            }
        }

        // Calculate speed
        val now = System.currentTimeMillis()
        val currentTx = TrafficStats.getTotalTxBytes()
        val currentRx = TrafficStats.getTotalRxBytes()
        val elapsed = (now - lastTrafficTimestamp).coerceAtLeast(1)

        val txSpeed = ((currentTx - lastTxBytes) * 1000 / elapsed) // bytes per second
        val rxSpeed = ((currentRx - lastRxBytes) * 1000 / elapsed) // bytes per second

        lastTxBytes = currentTx
        lastRxBytes = currentRx
        lastTrafficTimestamp = now

        return JSONObject().apply {
            put("type", networkType)
            put("name", networkName)
            put("txSpeed", txSpeed)
            put("rxSpeed", rxSpeed)
        }
    }

    private fun getForegroundPackage(): String {
        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val time = System.currentTimeMillis()
        val events = usageStatsManager.queryEvents(time - 1000 * 60 * 5, time) // last 5 minutes
        var currentPackage = ""

        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                currentPackage = event.packageName
            }
        }

        // If a foreground package was found, cache it for future use
        if (currentPackage.isNotEmpty()) {
            lastForegroundPackage = currentPackage
        }

        // Fall back to cached value if no recent ACTIVITY_RESUMED events found
        return currentPackage.ifEmpty { lastForegroundPackage }
    }

    private fun getTopUsageApps(): JSONArray {
        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val timeNow = System.currentTimeMillis()
        val timeStart = timeNow - 1000 * 60 * 60 * 24L

        val events = usageStatsManager.queryEvents(timeStart, timeNow)
        val event = UsageEvents.Event()
        
        val appUsageMap = mutableMapOf<String, Long>()
        val appStartTimes = mutableMapOf<String, Long>()

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val pkg = event.packageName
            val eventTime = event.timeStamp
            
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                // Pin the start time to the beginning of our 24h window if the event happened before
                appStartTimes[pkg] = maxOf(eventTime, timeStart)
            } else if (event.eventType == UsageEvents.Event.ACTIVITY_PAUSED || 
                       event.eventType == UsageEvents.Event.ACTIVITY_STOPPED) {
                appStartTimes[pkg]?.let { startTime ->
                    val duration = eventTime - startTime
                    if (duration > 0) {
                        appUsageMap[pkg] = (appUsageMap[pkg] ?: 0L) + duration
                    }
                    appStartTimes.remove(pkg)
                }
            }
        }
        
        // Handle apps that are still currently running (RESUMED but no PAUSED event yet)
        appStartTimes.forEach { (pkg, startTime) ->
            val duration = timeNow - startTime
            if (duration > 0) {
                appUsageMap[pkg] = (appUsageMap[pkg] ?: 0L) + duration
            }
        }

        val nameToDurationMap = mutableMapOf<String, Long>()
        appUsageMap.forEach { (pkg, durationMs) ->
            if (durationMs > 60_000) { // More than 1 minute
                val appName = getAppName(pkg)
                if (appName != "Unknown") {
                    nameToDurationMap[appName] = (nameToDurationMap[appName] ?: 0L) + durationMs
                }
            }
        }
        
        val topApps = nameToDurationMap.entries.sortedByDescending { it.value }.take(5)
        
        val jsonArray = JSONArray()
        topApps.forEach { (name, timeInMillis) ->
            jsonArray.put(JSONObject().apply {
                put("name", name)
                put("duration", timeInMillis / 1000) // in seconds
            })
        }
        return jsonArray
    }

    private fun getAppName(packageName: String): String {
        if (packageName.isEmpty()) return "Unknown"
        return try {
            val pm = packageManager
            val info = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(info).toString()
        } catch (e: PackageManager.NameNotFoundException) {
            packageName.split(".").last().replaceFirstChar { it.uppercase() }
        }
    }

    private fun getAppIconBase64(packageName: String): String? {
        if (packageName.isEmpty()) return null
        return try {
            val pm = packageManager
            val iconDrawable = pm.getApplicationIcon(packageName)
            val bitmap = drawableToBitmap(iconDrawable)
            val scaledBitmap = Bitmap.createScaledBitmap(bitmap, 64, 64, true)
            val outputStream = ByteArrayOutputStream()
            scaledBitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream)
            val byteArray = outputStream.toByteArray()
            Base64.encodeToString(byteArray, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e("StatusService", "Error getting app icon", e)
            null
        }
    }

    private fun drawableToBitmap(drawable: Drawable): Bitmap {
        if (drawable is BitmapDrawable) {
            return drawable.bitmap
        }
        val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 64
        val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 64
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        return bitmap
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "Device Status Service",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }
}
