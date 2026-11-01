package ru.vitalvoi.cdmm

import android.app.Application
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import ru.vitalvoi.cdmm.core.Cdmm
import ru.vitalvoi.cdmm.core.Device
import ru.vitalvoi.cdmm.core.Signals
import ru.vitalvoi.cdmm.widget.Widgets

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Cdmm.device = Device.PHONE
        Cdmm.onUpdated = { context -> scope.launch { Widgets.redraw(context) } }
        Signals.ensureChannels(this)
        Cdmm.startSync(this)
    }

    companion object {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    }
}
