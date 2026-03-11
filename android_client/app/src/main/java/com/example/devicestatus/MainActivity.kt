package com.example.devicestatus

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.Manifest
import android.content.pm.PackageManager

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val btnPermissions = findViewById<Button>(R.id.btnPermissions)
        val btnBattery = findViewById<Button>(R.id.btnBattery)
        val btnStart = findViewById<Button>(R.id.btnStart)
        val btnStop = findViewById<Button>(R.id.btnStop)

        btnPermissions.setOnClickListener {
            // Request Usage Access
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
            // Request display over other apps or others if needed
        }

        val btnLocation = findViewById<Button>(R.id.btnLocation)
        btnLocation.setOnClickListener {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                1001
            )
        }

        btnBattery.setOnClickListener {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            intent.data = Uri.parse("package:$packageName")
            startActivity(intent)
        }

        btnStart.setOnClickListener {
            val serviceIntent = Intent(this, StatusService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
            findViewById<TextView>(R.id.tvStatus).text = "Status: Running"
        }

        btnStop.setOnClickListener {
            stopService(Intent(this, StatusService::class.java))
            findViewById<TextView>(R.id.tvStatus).text = "Status: Stopped"
        }
    }

    override fun onResume() {
        super.onResume()
        checkPermissions()
    }

    private fun checkPermissions() {
        val appOps = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            packageName
        )
        if (mode == AppOpsManager.MODE_ALLOWED) {
            findViewById<Button>(R.id.btnPermissions).text = "Permission Granted ✓"
            findViewById<Button>(R.id.btnPermissions).isEnabled = false
        }

        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            findViewById<Button>(R.id.btnBattery).text = "Battery Optimization Disabled ✓"
            findViewById<Button>(R.id.btnBattery).isEnabled = false
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            findViewById<Button>(R.id.btnLocation).text = "Location Permission Granted ✓"
            findViewById<Button>(R.id.btnLocation).isEnabled = false
        }
    }
}
