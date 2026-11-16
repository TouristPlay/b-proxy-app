package com.baobabproxy.b_proxy

import android.app.Activity
import android.content.Intent
import android.net.TrafficStats
import android.net.VpnService
import android.os.Handler
import android.os.Looper
import android.os.Process
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import libXray.LibXray
import java.util.concurrent.Executors

class MainActivity : FlutterActivity() {

    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newCachedThreadPool()

    private var prepareResult: MethodChannel.Result? = null
    private var startResult: MethodChannel.Result? = null
    private var stateSink: EventChannel.EventSink? = null

    companion object {
        private const val VPN_REQUEST = 7001
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger

        // Прямой доступ к libXray: разбор подписок, пинг, версия ядра.
        MethodChannel(messenger, "b_proxy/xray").setMethodCallHandler { call, result ->
            if (call.method != "invoke") return@setMethodCallHandler result.notImplemented()
            val request = call.arguments as String
            io.execute {
                try {
                    val response = LibXray.invoke(request)
                    main.post { result.success(response) }
                } catch (e: Throwable) {
                    main.post { result.error("xray", e.message, null) }
                }
            }
        }

        MethodChannel(messenger, "b_proxy/vpn").setMethodCallHandler { call, result ->
            when (call.method) {
                "prepare" -> {
                    val intent = VpnService.prepare(this)
                    if (intent == null) {
                        result.success(true)
                    } else {
                        prepareResult = result
                        startActivityForResult(intent, VPN_REQUEST)
                    }
                }
                "start" -> {
                    val config = call.argument<String>("config")
                    if (config == null) {
                        result.error("args", "Нет конфига", null)
                    } else {
                        startResult?.error("busy", "Подключение уже идёт", null)
                        startResult = result
                        BProxyVpnService.start(this, config)
                    }
                }
                "stop" -> {
                    BProxyVpnService.stop(this)
                    result.success(null)
                }
                "stats" -> {
                    // Ядро работает в нашем процессе, поэтому трафик VPN — это трафик приложения.
                    val uid = Process.myUid()
                    result.success(
                        mapOf(
                            "rx" to TrafficStats.getUidRxBytes(uid),
                            "tx" to TrafficStats.getUidTxBytes(uid),
                        )
                    )
                }
                "state" -> result.success(BProxyVpnService.state)
                else -> result.notImplemented()
            }
        }

        EventChannel(messenger, "b_proxy/vpn/state").setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
                    stateSink = events
                    events.success(BProxyVpnService.state)
                }

                override fun onCancel(arguments: Any?) {
                    stateSink = null
                }
            }
        )

        BProxyVpnService.listener = { state -> main.post { onVpnState(state) } }
    }

    private fun onVpnState(state: String) {
        stateSink?.success(state)
        val pending = startResult ?: return
        when (state) {
            "connected" -> {
                startResult = null
                pending.success(null)
            }
            "disconnected" -> {
                startResult = null
                pending.error("vpn", BProxyVpnService.lastError ?: "Не удалось подключиться", null)
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == VPN_REQUEST) {
            prepareResult?.success(resultCode == Activity.RESULT_OK)
            prepareResult = null
        }
    }

    override fun onDestroy() {
        BProxyVpnService.listener = null
        super.onDestroy()
    }
}
