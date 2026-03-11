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
import android.util.Log
import okhttp3.*
import org.json.JSONObject
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import java.io.ByteArrayOutputStream

class StatusService : Service() {

    private val CHANNEL_ID = "StatusServiceChannel"
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient()
    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false

    private val updateRunnable = object : Runnable {
        override fun run() {
            if (isRunning) {
                sendDeviceUpdate()
                handler.postDelayed(this, 2000)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
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
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startWebSocket() {
        // NOTE: Uses 10.0.2.2 for Android Emulator to host localhost. 
        // If testing on real device on same network, user needs to change this IP.
//        val request = Request.Builder().url("ws://10.0.2.2:8080").build()
//        val request = Request.Builder().url("ws://172.19.161.181:8080").build()
        val request = Request.Builder().url("ws://status.vayki.com:8080").build()

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("StatusService", "Connected to WS")
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("StatusService", "WS Error", t)
            }
        }
        webSocket = client.newWebSocket(request, listener)
    }

    private fun sendDeviceUpdate() {
        if (webSocket == null) return

        val batteryLevel = getBatteryLevel()
        val isCharging = isBatteryCharging()
        val foregroundPackage = getForegroundPackage()
        val foregroundApp = getAppName(foregroundPackage)
        val foregroundAppIcon = getAppIconBase64(foregroundPackage)

        val state = JSONObject().apply {
            put("battery", batteryLevel)
            put("isCharging", isCharging)
            put("foregroundApp", foregroundApp)
            if (foregroundAppIcon != null) {
                put("foregroundAppIcon", foregroundAppIcon)
            }
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

    private fun isBatteryCharging(): Boolean {
        val batteryManager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val status = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS)
            status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        } else {
            false // fallback for older versions
        }
    }

    private fun getForegroundPackage(): String {
        val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val time = System.currentTimeMillis()
        val events = usageStatsManager.queryEvents(time - 1000 * 60, time) // last 1 minute
        var currentPackage = ""

        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                currentPackage = event.packageName
            }
        }
        return currentPackage
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
