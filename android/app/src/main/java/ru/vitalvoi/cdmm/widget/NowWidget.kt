package ru.vitalvoi.cdmm.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import ru.vitalvoi.cdmm.MainActivity
import ru.vitalvoi.cdmm.core.Format
import ru.vitalvoi.cdmm.core.Glance
import ru.vitalvoi.cdmm.core.Store

/** "Now" and "Next": the current block or live session and the one after it. */
class NowWidget : GlanceAppWidget() {
    override val stateDefinition = PreferencesGlanceStateDefinition
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = Store(context)
        provideContent {
            val tick = currentState(Widgets.TICK)
            val glance = remember(tick) { store.glance() }
            NowContent(glance, signedIn = store.token != null)
        }
    }
}

class NowWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget = NowWidget()
}

@Composable
private fun NowContent(glance: Glance, signedIn: Boolean) {
    val now = System.currentTimeMillis()
    Column(
        GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(20.dp)
            .background(Widgets.bg).padding(14.dp)
            .clickable(actionStartActivity<MainActivity>()),
    ) {
        if (!signedIn) {
            Text("Open CDMM to sign in", style = TextStyle(color = Widgets.muted, fontSize = 14.sp))
            return@Column
        }
        val current = glance.current(now)
        val next = glance.next(now)
        Slot(
            label = if (current?.live == true) "FOCUS" else "NOW",
            title = current?.title ?: "Free",
            detail = when {
                current == null -> next?.let { "until ${Format.time(it.start)}" } ?: "Nothing planned"
                current.live -> "since ${Format.time(current.start)}"
                else -> "${Format.time(current.start)}–${Format.time(current.end!!)}"
            },
            color = current?.let { Widgets.color(it.color) },
            big = true,
        )
        Spacer(GlanceModifier.height(10.dp))
        Slot(
            label = "NEXT",
            title = next?.title ?: "—",
            detail = next?.let { "${Format.whenLabel(it.start, now)}–${Format.time(it.end)}" } ?: "",
            color = next?.let { Widgets.color(it.color) },
            big = false,
        )
    }
}

@Composable
private fun Slot(label: String, title: String, detail: String, color: androidx.glance.unit.ColorProvider?, big: Boolean) {
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            GlanceModifier.width(4.dp).height(if (big) 48.dp else 36.dp).cornerRadius(2.dp)
                .background(color ?: Widgets.surface),
        ) {}
        Spacer(GlanceModifier.width(10.dp))
        Column(GlanceModifier.defaultWeight()) {
            Text(label, style = TextStyle(color = Widgets.muted, fontSize = 10.sp, fontWeight = FontWeight.Medium))
            Text(
                title,
                maxLines = 1,
                style = TextStyle(color = Widgets.text, fontSize = if (big) 18.sp else 15.sp, fontWeight = FontWeight.Medium),
            )
            if (detail.isNotEmpty()) {
                Text(detail, maxLines = 1, style = TextStyle(color = Widgets.muted, fontSize = 12.sp))
            }
        }
    }
}
