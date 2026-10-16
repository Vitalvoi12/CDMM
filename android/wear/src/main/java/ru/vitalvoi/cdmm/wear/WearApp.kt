package ru.vitalvoi.cdmm.wear

import android.app.Application
import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import ru.vitalvoi.cdmm.core.Cdmm
import ru.vitalvoi.cdmm.core.Device
import ru.vitalvoi.cdmm.core.Signals

class WearApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Cdmm.device = Device.WATCH
        Cdmm.onUpdated = ::redraw
        Signals.ensureChannels(this)
        Cdmm.startSync(this)
    }

    companion object {
        /** New snapshot or a block edge: refresh the tile and the complication. */
        fun redraw(context: Context) {
            TileService.getUpdater(context).requestUpdate(NowTileService::class.java)
            ComplicationDataSourceUpdateRequester
                .create(context, ComponentName(context, NextComplicationService::class.java))
                .requestUpdateAll()
        }
    }
}
