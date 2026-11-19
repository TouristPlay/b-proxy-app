package com.baobabproxy.bproxy.plugin

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Плитка «B-Proxy» в быстрых настройках (шторка): включить и выключить VPN, не открывая приложение.
 * Подключается с последним конфигом, с которым VPN запускали из приложения. Если его нет или
 * система ещё не дала разрешение на VPN — открывает приложение.
 */
class BProxyTileService : TileService() {

    companion object {
        /** Обновить плитку после смены состояния VPN (даже если шторка закрыта). */
        fun refresh(context: Context) {
            try {
                requestListeningState(context, ComponentName(context, BProxyTileService::class.java))
            } catch (_: Throwable) {
            }
        }
    }

    override fun onStartListening() {
        super.onStartListening()
        BProxyVpnService.tileListener = { draw() }
        draw()
    }

    override fun onStopListening() {
        BProxyVpnService.tileListener = null
        super.onStopListening()
    }

    override fun onClick() {
        super.onClick()
        when (BProxyVpnService.state) {
            "connected", "connecting" -> BProxyVpnService.stop(this)
            "disconnecting" -> {}
            else -> {
                val last = BProxyVpnService.lastStart(this)
                if (last == null || VpnService.prepare(this) != null) {
                    openApp()
                    return
                }
                BProxyVpnService.start(this, last.first, last.second)
            }
        }
        draw()
    }

    private fun draw() {
        val tile = qsTile ?: return
        val state = BProxyVpnService.state
        tile.state = when (state) {
            "connected" -> Tile.STATE_ACTIVE
            else -> Tile.STATE_INACTIVE
        }
        tile.label = "B-Proxy"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.subtitle = when (state) {
                "connected" -> BProxyVpnService.serverName ?: "Подключено"
                "connecting" -> "Подключаемся…"
                "disconnecting" -> "Отключаемся…"
                else -> "Не подключено"
            }
        }
        tile.updateTile()
    }

    private fun openApp() {
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) ?: return
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE))
        } else {
            @Suppress("DEPRECATION", "StartActivityAndCollapseDeprecated")
            startActivityAndCollapse(launch)
        }
    }
}
