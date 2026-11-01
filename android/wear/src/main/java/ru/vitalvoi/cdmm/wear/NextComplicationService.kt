package ru.vitalvoi.cdmm.wear

import android.app.PendingIntent
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
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
        if (store.token == null) return build(request.complicationType, "CDMM", "—", "CDMM · pair the watch")
        val now = System.currentTimeMillis()
        val glance = store.glance()
        val current = glance.current(now)
        val next = glance.next(now)
        return when {
            current?.live == true ->
                build(request.complicationType, current.title, Format.time(current.start), "${current.title} · since ${Format.time(current.start)}")
            current != null ->
                build(request.complicationType, current.title, Format.time(current.end!!), "${current.title} · until ${Format.time(current.end!!)}")
            next != null ->
                build(request.complicationType, next.title, Format.time(next.start), "${next.title} · ${Format.whenLabel(next.start, now)}")
            else -> build(request.complicationType, "CDMM", "—", "Nothing planned")
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
