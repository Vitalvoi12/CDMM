package ru.vitalvoi.cdmm.widget

import android.content.Context
import androidx.compose.ui.graphics.Color
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.color.ColorProvider

/** Shared look and the redraw hook for the home-screen widgets. */
object Widgets {
    /** Bumped on every redraw so the widgets re-read the stored snapshot. */
    val TICK = longPreferencesKey("tick")

    // CDMM's palettes: warm paper by day, the focus room by night.
    val bg = ColorProvider(day = Color(0xFFFDF8F8), night = Color(0xFF151413))
    val surface = ColorProvider(day = Color(0xFFF3ECEA), night = Color(0xFF201E1C))
    val text = ColorProvider(day = Color(0xFF1D1B1A), night = Color(0xFFF1EEE7))
    val muted = ColorProvider(day = Color(0xFF6F6763), night = Color(0xFFA39C95))
    val accent = ColorProvider(day = Color(0xFFC4573C), night = Color(0xFFE9826A))
    val urgent = ColorProvider(day = Color(0xFFB3261E), night = Color(0xFFF2B8B5))

    fun color(argb: Int?) = argb?.let { ColorProvider(day = Color(it), night = Color(it)) } ?: accent

    suspend fun redraw(context: Context) {
        val manager = GlanceAppWidgetManager(context)
        val widgets: List<Pair<Class<out GlanceAppWidget>, GlanceAppWidget>> =
            listOf(NowWidget::class.java to NowWidget(), TodoWidget::class.java to TodoWidget())
        for ((cls, widget) in widgets) {
            for (id in manager.getGlanceIds(cls)) bump(context, id, widget)
        }
    }

    private suspend fun bump(context: Context, id: GlanceId, widget: GlanceAppWidget) {
        updateAppWidgetState(context, id) { it[TICK] = System.currentTimeMillis() }
        widget.update(context, id)
    }
}
