package com.baobabproxy.bproxy.plugin

import android.provider.Settings
import android.annotation.SuppressLint
import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.net.TrafficStats
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import libXray.LibXray
import java.util.concurrent.Executors

@InvokeArg
class InvokeCoreArgs {
    lateinit var request: String
}

@InvokeArg
class StartArgs {
    lateinit var config: String
    var notifyDisconnect: Boolean = false
}

/**
 * Мост между интерфейсом (Tauri) и Android: libXray в процессе приложения
 * и VPN через BProxyVpnService.
 */
@TauriPlugin
class BProxyPlugin(private val activity: Activity) : Plugin(activity) {

    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newCachedThreadPool()
    private var pendingStart: Invoke? = null

    init {
        BProxyVpnService.listener = { state -> main.post { onVpnState(state) } }
    }

    /** Прямой вызов libXray: разбор ссылок, пинг, версия ядра. */
    @Command
    fun invokeCore(invoke: Invoke) {
        val args = invoke.parseArgs(InvokeCoreArgs::class.java)
        io.execute {
            try {
                val response = LibXray.invoke(args.request)
                invoke.resolve(JSObject().apply { put("result", response) })
            } catch (e: Throwable) {
                invoke.reject(e.message ?: "Ошибка ядра Xray")
            }
        }
    }

    /** Разрешение на VPN: системный диалог при первом подключении. */
    /** Приложения с рабочего стола: название, пакет и маленький значок (PNG base64) — для «VPN по приложениям». */
    @Command
    fun listApps(invoke: Invoke) {
        Thread {
            try {
                val pm = activity.packageManager
                val launcher = android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_LAUNCHER)
                val seen = HashSet<String>()
                val apps = app.tauri.plugin.JSArray()
                for (info in pm.queryIntentActivities(launcher, 0)) {
                    val pkg = info.activityInfo.packageName
                    if (pkg == activity.packageName || !seen.add(pkg)) continue
                    val item = JSObject()
                    item.put("id", pkg)
                    item.put("name", info.loadLabel(pm).toString())
                    try {
                        val icon = info.loadIcon(pm)
                        val size = 72
                        val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
                        val canvas = android.graphics.Canvas(bmp)
                        icon.setBounds(0, 0, size, size)
                        icon.draw(canvas)
                        val out = java.io.ByteArrayOutputStream()
                        bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out)
                        item.put("icon", "data:image/png;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP))
                    } catch (_: Throwable) {
                    }
                    apps.put(item)
                }
                val ret = JSObject()
                ret.put("apps", apps)
                invoke.resolve(ret)
            } catch (e: Throwable) {
                invoke.reject(e.message ?: "Не удалось получить список приложений")
            }
        }.start()
    }

    /**
     * Системные настройки VPN: там «Постоянная VPN» и «Блокировать соединения без VPN» —
     * настоящий kill switch Android, приложение включить его само не может.
     */
    @Command
    fun openVpnSettings(invoke: Invoke) {
        try {
            activity.startActivity(android.content.Intent(Settings.ACTION_VPN_SETTINGS).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
            invoke.resolve()
        } catch (e: Throwable) {
            invoke.reject(e.message ?: "Не удалось открыть настройки VPN")
        }
    }

    /** Папка баз geoip/geosite: служба VPN в том же процессе, ей хватает filesDir. */
    @Command
    fun geoDir(invoke: Invoke) {
        val dir = java.io.File(activity.filesDir, "geo").apply { mkdirs() }
        val ret = JSObject()
        ret.put("path", dir.absolutePath)
        invoke.resolve(ret)
    }

    /** Сырой идентификатор устройства для HWID (хэширует Rust) и сведения о системе. */
    @Command
    fun deviceInfo(invoke: Invoke) {
        @SuppressLint("HardwareIds")
        val androidId = Settings.Secure.getString(activity.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        val model = if (Build.MODEL.startsWith(Build.MANUFACTURER, ignoreCase = true)) Build.MODEL
        else "${Build.MANUFACTURER} ${Build.MODEL}"
        val ret = JSObject()
        // ANDROID_ID не меняется при переустановке (для того же ключа подписи) — HWID стабилен.
        ret.put("id", "$androidId|${Build.MANUFACTURER}|${Build.MODEL}|${Build.BRAND}")
        ret.put("os", "Android")
        ret.put("osVersion", Build.VERSION.RELEASE ?: "")
        ret.put("model", model.replaceFirstChar { it.uppercase() })
        invoke.resolve(ret)
    }

    @Command
    fun prepare(invoke: Invoke) {
        // Уведомление о работе VPN на Android 13+ требует отдельного разрешения.
        if (Build.VERSION.SDK_INT >= 33 &&
            activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7002)
        }
        val intent = VpnService.prepare(activity)
        if (intent == null) {
            invoke.resolve(JSObject().apply { put("granted", true) })
        } else {
            startActivityForResult(invoke, intent, "onVpnPermission")
        }
    }

    @ActivityCallback
    private fun onVpnPermission(invoke: Invoke, result: ActivityResult) {
        invoke.resolve(JSObject().apply { put("granted", result.resultCode == Activity.RESULT_OK) })
    }

    /** Запуск туннеля. Ответ приходит, когда ядро запустилось или упало. */
    @Command
    fun start(invoke: Invoke) {
        val args = invoke.parseArgs(StartArgs::class.java)
        pendingStart?.reject("Подключение начато заново")
        pendingStart = invoke
        BProxyVpnService.start(activity, args.config, args.notifyDisconnect)
    }

    @Command
    fun stop(invoke: Invoke) {
        BProxyVpnService.stop(activity)
        invoke.resolve()
    }

    /** Ядро работает в нашем процессе, поэтому трафик VPN — это трафик приложения. */
    @Command
    fun stats(invoke: Invoke) {
        val running = BProxyVpnService.state == "connected"
        val uid = Process.myUid()
        invoke.resolve(JSObject().apply {
            put("running", running)
            put("rx", TrafficStats.getUidRxBytes(uid).coerceAtLeast(0))
            put("tx", TrafficStats.getUidTxBytes(uid).coerceAtLeast(0))
        })
    }

    private fun onVpnState(state: String) {
        trigger("state", JSObject().apply {
            put("state", state)
            BProxyVpnService.lastError?.let { if (state == "disconnected") put("error", it) }
        })
        val pending = pendingStart ?: return
        when (state) {
            "connected" -> {
                pendingStart = null
                pending.resolve()
            }
            "disconnected" -> {
                pendingStart = null
                pending.reject(BProxyVpnService.lastError ?: "Не удалось подключиться")
            }
        }
    }
}
