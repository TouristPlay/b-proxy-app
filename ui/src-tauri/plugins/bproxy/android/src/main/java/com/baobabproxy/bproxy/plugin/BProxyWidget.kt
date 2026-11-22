package com.baobabproxy.bproxy.plugin

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.VpnService
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews

/**
 * Виджет «B-Proxy» на рабочем столе: состояние VPN, сервер, время сеанса и кнопка
 * включения. Нажатие включает VPN с последним конфигом (как плитка в шторке); если его
 * ещё нет или нет разрешения на VPN — открывает приложение.
 * Цвет акцента и флаг сервера присылает интерфейс (команда widgetState).
 */
class BProxyWidget : AppWidgetProvider() {

    companion object {
        const val ACTION_TOGGLE = "com.baobabproxy.bproxy.WIDGET_TOGGLE"
        private const val PREFS = "bproxy"
        private const val DEFAULT_ACCENT = "#F5B041"

        /** Перерисовать все виджеты (после смены состояния VPN или темы). */
        fun refresh(context: Context) {
            try {
                val manager = AppWidgetManager.getInstance(context)
                val ids = manager.getAppWidgetIds(ComponentName(context, BProxyWidget::class.java))
                if (ids.isNotEmpty()) draw(context, manager, ids)
            } catch (_: Throwable) {
            }
        }

        private fun draw(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val state = BProxyVpnService.state
            val accent = parseColor(prefs.getString("widgetAccent", null)) ?: Color.parseColor(DEFAULT_ACCENT)
            val server = BProxyVpnService.serverName ?: prefs.getString("lastServer", null)
            val flag = prefs.getString("widgetFlag", null).orEmpty()
            val on = state == "connected"

            val views = RemoteViews(context.packageName, R.layout.bproxy_widget)
            views.setTextViewText(
                R.id.widget_status,
                when (state) {
                    "connected" -> prefs.getString("widgetLabelConnected", null) ?: "Защищено"
                    "connecting", "disconnecting" -> (prefs.getString("widgetLabelConnecting", null) ?: "Подключаемся") + "…"
                    else -> prefs.getString("widgetLabelDisconnected", null) ?: "Не защищено"
                }
            )
            val place = listOf(flag, server.orEmpty()).filter { it.isNotEmpty() }.joinToString(" ")
            views.setTextViewText(R.id.widget_server, place.ifEmpty { prefs.getString("widgetLabelHint", null) ?: "Нажмите, чтобы подключить" })
            // Кружок и щит — цветом темы, когда VPN работает.
            views.setInt(R.id.widget_ring, "setColorFilter", if (on) withAlpha(accent, 0x40) else 0x26FFFFFF)
            views.setInt(R.id.widget_icon, "setColorFilter", if (on) accent else 0xB3FFFFFF.toInt())
            views.setTextColor(R.id.widget_status, if (on) accent else Color.WHITE)

            if (on) {
                val since = prefs.getLong("connectedAt", System.currentTimeMillis())
                val base = SystemClock.elapsedRealtime() - (System.currentTimeMillis() - since).coerceAtLeast(0)
                views.setChronometer(R.id.widget_timer, base, null, true)
                views.setViewVisibility(R.id.widget_timer, View.VISIBLE)
            } else {
                views.setChronometer(R.id.widget_timer, SystemClock.elapsedRealtime(), null, false)
                views.setViewVisibility(R.id.widget_timer, View.GONE)
            }

            views.setOnClickPendingIntent(R.id.widget_root, clickIntent(context))
            manager.updateAppWidget(ids, views)
        }

        /** Включить/выключить прямо из виджета или открыть приложение, если без него нельзя. */
        private fun clickIntent(context: Context): PendingIntent {
            val canToggle = BProxyVpnService.state != "disconnected" ||
                (BProxyVpnService.lastStart(context) != null && VpnService.prepare(context) == null)
            return if (canToggle) {
                PendingIntent.getBroadcast(
                    context, 0,
                    Intent(context, BProxyWidget::class.java).setAction(ACTION_TOGGLE),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            } else {
                val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
                    ?: Intent().setPackage(context.packageName)
                PendingIntent.getActivity(
                    context, 1, launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            }
        }

        private fun parseColor(hex: String?): Int? = try {
            hex?.let { Color.parseColor(it) }
        } catch (_: IllegalArgumentException) {
            null
        }

        private fun withAlpha(color: Int, alpha: Int) = (color and 0x00FFFFFF) or (alpha shl 24)
    }

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        draw(context, manager, ids)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action != ACTION_TOGGLE) return
        when (BProxyVpnService.state) {
            "connected", "connecting" -> BProxyVpnService.stop(context)
            "disconnecting" -> {}
            else -> {
                val last = BProxyVpnService.lastStart(context) ?: return refresh(context)
                if (VpnService.prepare(context) != null) return refresh(context)
                BProxyVpnService.start(context, last.first, last.second)
            }
        }
    }
}
