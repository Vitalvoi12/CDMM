package ru.vitalvoi.cdmm.wear

import android.app.PendingIntent
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.CountUpTimeReference
import androidx.wear.watchface.complications.data.TimeDifferenceComplicationText
import androidx.wear.watchface.complications.data.TimeDifferenceStyle
import java.time.Instant
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import ru.vitalvoi.cdmm.core.Format
import ru.vitalvoi.cdmm.core.Store

/**
 * Watch-face slot: when the current block ends, or when the next one starts.
 * Short: "15:20" over "Math"; long: "Math · until 15:20".
 */
class NextComplicationService : SuspendingComplicationDataSourceService() {

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        build(type, "Math", "14:30", "Math · 14:30")

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val store = Store(this)
        if (store.token == null) return build(request.complicationType, "CDMM", "—", "CDMM · подключите часы")
        val now = System.currentTimeMillis()
        val glance = FocusRepository(this).glance()
        val current = glance.current(now)
        val next = glance.next(now)
        return when {
            current?.live == true -> {
                val timer = TimeDifferenceComplicationText.Builder(TimeDifferenceStyle.STOPWATCH,
                    CountUpTimeReference(Instant.ofEpochMilli(current.start))).build()
                val tap = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                val description = PlainComplicationText.Builder("${current.title} · идёт занятие").build()
                when (request.complicationType) {
                    ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(timer, description)
                        .setTitle(PlainComplicationText.Builder(current.title.take(7)).build()).setTapAction(tap).build()
                    ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(
                        TimeDifferenceComplicationText.Builder(TimeDifferenceStyle.STOPWATCH,
                            CountUpTimeReference(Instant.ofEpochMilli(current.start))).setText("${current.title} · ^1").build(), description)
                        .setTapAction(tap).build()
                    else -> null
                }
            }
            current != null ->
                build(request.complicationType, current.title, Format.time(current.end!!), "${current.title} · до ${Format.time(current.end!!)}")
            next != null ->
                build(request.complicationType, next.title, Format.time(next.start), "${next.title} · ${Format.whenLabel(next.start, now)}")
            else -> build(request.complicationType, "CDMM", "—", "Нет планов")
        }
    }

    private fun build(type: ComplicationType, title: String, short: String, long: String): ComplicationData? {
        val tap = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val description = PlainComplicationText.Builder(long).build()
        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(PlainComplicationText.Builder(short).build(), description)
                .setTitle(PlainComplicationText.Builder(title.take(7)).build())
                .setTapAction(tap)
                .build()
            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(PlainComplicationText.Builder(long).build(), description)
                .setTapAction(tap)
                .build()
            else -> null
        }
    }
}
