package com.baobabproxy.bproxy.plugin

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
        BProxyVpnService.start(activity, args.config)
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
