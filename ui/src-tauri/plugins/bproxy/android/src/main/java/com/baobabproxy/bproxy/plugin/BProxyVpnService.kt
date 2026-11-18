package com.baobabproxy.bproxy.plugin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import libXray.DialerController
import libXray.LibXray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * VPN-сервис: создаёт TUN через VpnService и отдаёт его дескриптор ядру Xray
 * (переменная xray.tun.fd в разделе env конфига). Ядро само разбирает пакеты —
 * tun2socks не нужен.
 */
class BProxyVpnService : VpnService() {

    companion object {
        const val ACTION_START = "com.baobabproxy.bproxy.START"
        const val ACTION_STOP = "com.baobabproxy.bproxy.STOP"
        const val EXTRA_CONFIG = "config"
        const val EXTRA_NOTIFY = "notifyDisconnect"
        private const val TAG = "BProxyVpn"
        private const val CHANNEL_ID = "vpn"
        private const val NOTIFICATION_ID = 1
        private const val ALERT_CHANNEL_ID = "alerts"
        private const val ALERT_ID = 2

        // Адреса совпадают с конфигом из ui/src/backend/xray.ts.
        private const val TUN_ADDRESS = "172.19.0.1"
        private const val TUN_PREFIX = 30
        private const val TUN_DNS = "172.19.0.2"
        private const val TUN_ADDRESS6 = "fdfe:dcba:9876::1"

        /** Текущее состояние: disconnected | connecting | connected | disconnecting. */
        @Volatile
        var state: String = "disconnected"
            private set

        @Volatile
        var lastError: String? = null

        var listener: ((String) -> Unit)? = null

        private fun setState(value: String) {
            state = value
            listener?.invoke(value)
        }

        fun start(context: Context, config: String, notifyDisconnect: Boolean) {
            val intent = Intent(context, BProxyVpnService::class.java)
                .setAction(ACTION_START)
                .putExtra(EXTRA_CONFIG, config)
                .putExtra(EXTRA_NOTIFY, notifyDisconnect)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, BProxyVpnService::class.java).setAction(ACTION_STOP)
            )
        }
    }

    private val worker = Executors.newSingleThreadExecutor()
    private var tun: ParcelFileDescriptor? = null

    /** Сообщать ли об обрыве (настройка «Уведомления → VPN отключился»). */
    @Volatile
    private var notifyDisconnect = false

    /** Отключение по команде пользователя: из приложения или кнопкой в шторке. */
    @Volatile
    private var userStop = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val config = intent.getStringExtra(EXTRA_CONFIG) ?: return START_NOT_STICKY
                notifyDisconnect = intent.getBooleanExtra(EXTRA_NOTIFY, false)
                userStop = false
                startForegroundCompat()
                worker.execute { startCore(config) }
            }
            ACTION_STOP -> {
                userStop = true
                worker.execute { stopCore(); stopSelfCompat() }
            }
            // Система перезапустила сервис без команды (например, «Постоянная VPN»).
            else -> if (state == "disconnected") stopSelfCompat()
        }
        return START_NOT_STICKY
    }

    override fun onRevoke() {
        // Включили другой VPN или отозвали разрешение — туннель оборвался не по нашей кнопке.
        if (state == "connected") alertDisconnected("Включён другой VPN или отозвано разрешение")
        worker.execute { stopCore(); stopSelfCompat() }
    }

    override fun onDestroy() {
        // Систему вынудили остановить службу, пока VPN работал.
        if (state == "connected" && !userStop) alertDisconnected("Система остановила VPN")
        stopCore()
        worker.shutdown()
        super.onDestroy()
    }

    private fun startCore(rawConfig: String) {
        if (state == "connected") stopCore()
        setState("connecting")
        lastError = null
        try {
            val config = JSONObject(rawConfig)
            val ipv6 = config.optJSONObject("dns")?.optString("queryStrategy") == "UseIP"
            val mtu = findTunMtu(config)

            val builder = Builder()
                .setSession("B-Proxy")
                .setMtu(mtu)
                .addAddress(TUN_ADDRESS, TUN_PREFIX)
                .addRoute("0.0.0.0", 0)
                .addDnsServer(TUN_DNS)
            if (ipv6) {
                builder.addAddress(TUN_ADDRESS6, 126).addRoute("::", 0)
            }
            // Трафик самого приложения (то есть ядра Xray) идёт мимо туннеля.
            builder.addDisallowedApplication(packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) builder.setMetered(false)
            builder.setConfigureIntent(openAppIntent())

            val pfd = builder.establish() ?: throw IllegalStateException("Нет разрешения на VPN")
            tun = pfd

            val env = config.optJSONObject("env") ?: JSONObject()
            env.put("xray.tun.fd", pfd.fd.toString())
            config.put("env", env)

            // Go-резолвер на Android иначе смотрит на loopback и не работает под VPN.
            LibXray.setDNS(object : DialerController {
                override fun protectFd(fd: Long): Boolean = protect(fd.toInt())
            }, "1.1.1.1:53")

            val request = JSONObject()
                .put("apiVersion", 3)
                .put("method", "runXray")
                .put("payload", JSONObject().put("xrayJson", config.toString()))
            val response = JSONObject(LibXray.invoke(request.toString()))
            if (!response.optBoolean("success")) {
                throw IllegalStateException(response.optString("error", "Ядро не запустилось"))
            }
            setState("connected")
            updateNotification("Подключено")
        } catch (e: Throwable) {
            Log.e(TAG, "start failed", e)
            lastError = e.message ?: e.toString()
            stopCore()
            stopSelfCompat()
        }
    }

    /** MTU из настроек ядра: inbound с протоколом tun. */
    private fun findTunMtu(config: JSONObject): Int {
        val inbounds = config.optJSONArray("inbounds") ?: return 1500
        for (i in 0 until inbounds.length()) {
            val inbound = inbounds.optJSONObject(i) ?: continue
            if (inbound.optString("protocol") == "tun") {
                return inbound.optJSONObject("settings")?.optInt("mtu", 1500) ?: 1500
            }
        }
        return 1500
    }

    private fun stopCore() {
        if (state == "disconnected" && tun == null) return
        setState("disconnecting")
        try {
            val request = JSONObject().put("apiVersion", 3).put("method", "stopXray")
            LibXray.invoke(request.toString())
            LibXray.resetDNS()
        } catch (e: Throwable) {
            Log.w(TAG, "stop failed", e)
        }
        try {
            tun?.close()
        } catch (_: Throwable) {
        }
        tun = null
        setState("disconnected")
    }

    private fun stopSelfCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        this, 0,
        (packageManager.getLaunchIntentForPackage(packageName) ?: Intent())
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    private fun buildNotification(text: String): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            nm.getNotificationChannel(CHANNEL_ID) == null
        ) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "VPN", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val stopIntent = PendingIntent.getService(
            this, 1,
            Intent(this, BProxyVpnService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setSmallIcon(R.drawable.ic_bproxy_vpn)
            .setContentTitle("B-Proxy")
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(openAppIntent())
            .addAction(stopAction(stopIntent))
            .build()
    }

    @Suppress("DEPRECATION")
    private fun stopAction(intent: PendingIntent): Notification.Action =
        Notification.Action.Builder(0, "Отключить", intent).build()

    private fun startForegroundCompat() {
        val notification = buildNotification("Подключаемся…")
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    /**
     * Уведомление «VPN отключился» прямо из службы: приходит, даже если интерфейс
     * приложения выгружен из памяти. Канал «Предупреждения» — со звуком, в отличие от «VPN».
     */
    private fun alertDisconnected(reason: String) {
        if (!notifyDisconnect || userStop) return
        notifyDisconnect = false // одно уведомление на обрыв
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                nm.getNotificationChannel(ALERT_CHANNEL_ID) == null
            ) {
                nm.createNotificationChannel(
                    NotificationChannel(ALERT_CHANNEL_ID, "Предупреждения", NotificationManager.IMPORTANCE_DEFAULT)
                )
            }
            val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(this, ALERT_CHANNEL_ID)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
            }
            nm.notify(
                ALERT_ID,
                builder
                    .setSmallIcon(R.drawable.ic_bproxy_vpn)
                    .setContentTitle("VPN отключился")
                    .setContentText("$reason. Откройте B-Proxy, чтобы подключиться снова")
                    .setAutoCancel(true)
                    .setContentIntent(openAppIntent())
                    .build()
            )
        } catch (e: Throwable) {
            // Нет разрешения на уведомления (Android 13+) — молча пропускаем.
            Log.w(TAG, "alert failed", e)
        }
    }

    private fun updateNotification(text: String) {
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID, buildNotification(text))
    }
}
