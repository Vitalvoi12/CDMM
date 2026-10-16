package ru.vitalvoi.cdmm.wear

import androidx.concurrent.futures.CallbackToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.LayoutElement
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture
import ru.vitalvoi.cdmm.core.Format
import ru.vitalvoi.cdmm.core.Glance
import ru.vitalvoi.cdmm.core.Store

/**
 * Tile with the current and the next block. It carries a timeline: one entry
 * per stretch between event edges, so the tile turns over on time without the
 * app waking up.
 */
class NowTileService : TileService() {

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val store = Store(this)
        val glance = store.glance()
        val signedIn = store.token != null
        val now = System.currentTimeMillis()

        val timeline = TimelineBuilders.Timeline.Builder()
        if (!signedIn) {
            timeline.addTimelineEntry(entry(message("Open CDMM on the watch to pair"), null, null))
        } else {
            // Edges within the next 12 h cut the timeline into stretches.
            val edges = glance.events.flatMap { listOf(it.start, it.end) }
                .filter { it > now && it < now + 12 * 3600_000L }.distinct().sorted()
            var from = now
            for (to in edges + Long.MAX_VALUE) {
                timeline.addTimelineEntry(entry(layout(glance, from), if (from == now) null else from, to.takeIf { it != Long.MAX_VALUE }))
                if (to == Long.MAX_VALUE) break
                from = to
            }
        }
        val tile = TileBuilders.Tile.Builder()
            .setResourcesVersion(RES_VERSION)
            .setTileTimeline(timeline.build())
            .setFreshnessIntervalMillis(15 * 60_000L)
            .build()
        return done(tile)
    }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        done(ResourceBuilders.Resources.Builder().setVersion(RES_VERSION).build())

    private fun entry(content: LayoutElement, start: Long?, end: Long?): TimelineBuilders.TimelineEntry {
        val b = TimelineBuilders.TimelineEntry.Builder()
            .setLayout(LayoutElementBuilders.Layout.Builder().setRoot(content).build())
        if (start != null || end != null) {
            val v = TimelineBuilders.TimeInterval.Builder()
            start?.let { v.setStartMillis(it) }
            end?.let { v.setEndMillis(it) }
            b.setValidity(v.build())
        }
        return b.build()
    }

    /** The tile as it reads at moment `at`. */
    private fun layout(glance: Glance, at: Long): LayoutElement {
        val current = glance.current(at)
        val next = glance.next(at)
        val col = LayoutElementBuilders.Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        col.addContent(text(if (current?.live == true) "FOCUS" else "NOW", 11f, current?.color ?: ACCENT))
        col.addContent(text(current?.title ?: "Free", 18f, TEXT, maxLines = 2))
        col.addContent(
            text(
                when {
                    current == null -> next?.let { "until ${Format.time(it.start)}" } ?: "Nothing planned"
                    current.live -> "since ${Format.time(current.start)}"
                    else -> "until ${Format.time(current.end!!)}"
                },
                13f, MUTED,
            ),
        )
        if (next != null) {
            col.addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(10f)).build())
            col.addContent(text("NEXT · ${Format.whenLabel(next.start)}", 11f, next.color ?: ACCENT))
            col.addContent(text(next.title, 14f, TEXT))
        }
        return clickBox(col.build())
    }

    private fun message(s: String) = clickBox(text(s, 14f, TEXT, maxLines = 3))

    private fun clickBox(content: LayoutElement): LayoutElement =
        LayoutElementBuilders.Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setPadding(ModifiersBuilders.Padding.Builder().setAll(dp(24f)).build())
                    .setClickable(
                        ModifiersBuilders.Clickable.Builder()
                            .setId("open")
                            .setOnClick(
                                ActionBuilders.LaunchAction.Builder()
                                    .setAndroidActivity(
                                        ActionBuilders.AndroidActivity.Builder()
                                            .setPackageName(packageName)
                                            .setClassName(MainActivity::class.java.name)
                                            .build(),
                                    )
                                    .build(),
                            )
                            .build(),
                    )
                    .build(),
            )
            .addContent(content)
            .build()

    private fun text(s: String, size: Float, color: Int, maxLines: Int = 1): LayoutElement =
        LayoutElementBuilders.Text.Builder()
            .setText(s)
            .setMaxLines(maxLines)
            .setMultilineAlignment(LayoutElementBuilders.TEXT_ALIGN_CENTER)
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder().setSize(sp(size)).setColor(argb(color)).build(),
            )
            .build()

    private fun <T> done(value: T): ListenableFuture<T> =
        CallbackToFutureAdapter.getFuture { it.set(value); "cdmm-tile" }

    companion object {
        private const val RES_VERSION = "1"
        private const val TEXT = 0xFFF1EEE7.toInt()
        private const val MUTED = 0xFFA39C95.toInt()
        private const val ACCENT = 0xFFE9826A.toInt()
    }
}
