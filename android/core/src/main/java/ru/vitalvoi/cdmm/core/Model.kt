package ru.vitalvoi.cdmm.core

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/** One event around now, as `/api/glance` sends it. */
data class GlanceEvent(
    val id: String,
    val title: String,
    val subject: String?,
    val color: Int?,
    val plan: Boolean,
    val start: Long,
    val end: Long,
    /** Reminder leads, minutes before the start. */
    val leads: List<Int>,
)

data class GlanceTodo(
    val id: String,
    val title: String,
    val due: Long?,
    val dueHasTime: Boolean,
    val important: Boolean,
    val urgent: Boolean,
    val reminders: List<Long>,
)

/** The running focus session. */
data class GlanceSession(val title: String, val color: Int?, val start: Long)

enum class SignalKind { REMINDER, START, END, TODO }
enum class SignalMode { OFF, VIBRATE, SOUND, BOTH }
enum class VibrationPattern(val timings: LongArray) {
    SHORT(longArrayOf(0, 120)),
    LONG(longArrayOf(0, 700)),
    DOUBLE(longArrayOf(0, 180, 140, 180)),
    TRIPLE(longArrayOf(0, 150, 120, 150, 120, 150)),
}

data class DeviceSignals(val modes: Map<SignalKind, SignalMode>, val pattern: VibrationPattern) {
    fun mode(kind: SignalKind) = modes[kind] ?: SignalMode.OFF
}

data class Glance(
    val fetchedAt: Long,
    val session: GlanceSession?,
    val events: List<GlanceEvent>,
    val todos: List<GlanceTodo>,
    val signals: DeviceSignals,
) {

    /** What is happening now: the live session wins over a block in the calendar. */
    fun current(now: Long): Now? {
        session?.let { return Now(it.title, it.color, it.start, null, live = true) }
        val e = events.filter { it.start <= now && now < it.end }
            // A real event (logged time) says more than the plan under it.
            .minWithOrNull(compareBy<GlanceEvent> { it.plan }.thenBy { it.end })
            ?: return null
        return Now(e.title, e.color, e.start, e.end, live = false)
    }

    fun next(now: Long): GlanceEvent? = events.filter { it.start > now }.minByOrNull { it.start }

    /** Start or end of any event after `now`: the widget must redraw then. */
    fun nextBoundary(now: Long): Long? =
        events.flatMap { listOf(it.start, it.end) }.filter { it > now }.minOrNull()

    data class Now(val title: String, val color: Int?, val start: Long, val end: Long?, val live: Boolean)

    companion object {
        /** Same defaults as the web app and the server. */
        val DEFAULTS = DeviceSignals(
            mapOf(
                SignalKind.REMINDER to SignalMode.BOTH, SignalKind.START to SignalMode.OFF,
                SignalKind.END to SignalMode.OFF, SignalKind.TODO to SignalMode.BOTH,
            ),
            VibrationPattern.DOUBLE,
        )

        val EMPTY = Glance(0, null, emptyList(), emptyList(), DEFAULTS)

        fun parse(json: String): Glance {
            val o = JSONObject(json)
            val signals = o.optJSONObject("signals")
            return Glance(
                fetchedAt = o.optLong("now", System.currentTimeMillis()),
                session = o.optJSONObject("session")?.let {
                    GlanceSession(it.optString("title", "Focus session"), color(it.opt("color")), time(it.optString("start")) ?: 0)
                },
                events = o.optJSONArray("events").objects().mapNotNull { e ->
                    GlanceEvent(
                        id = e.optString("id"),
                        title = e.optString("title", "Event"),
                        subject = e.optStringOrNull("subject"),
                        color = color(e.opt("color")),
                        plan = e.optString("kind") == "plan",
                        start = time(e.optString("start")) ?: return@mapNotNull null,
                        end = time(e.optString("end")) ?: return@mapNotNull null,
                        leads = e.optJSONArray("leads").ints(),
                    )
                },
                todos = o.optJSONArray("todos").objects().map { t ->
                    GlanceTodo(
                        id = t.optString("id"),
                        title = t.optString("title", "Task"),
                        due = t.optStringOrNull("due")?.let(::time),
                        dueHasTime = t.optBoolean("dueHasTime"),
                        important = t.optBoolean("important"),
                        urgent = t.optBoolean("urgent"),
                        reminders = t.optJSONArray("reminders").strings().mapNotNull(::time),
                    )
                },
                signals = deviceSignals(signals?.optJSONObject("phone")),
            )
        }

        private fun deviceSignals(o: JSONObject?): DeviceSignals {
            val fallback = DEFAULTS
            if (o == null) return fallback
            val modes = SignalKind.entries.associateWith { kind ->
                enumOrNull<SignalMode>(o.optString(kind.name.lowercase())) ?: fallback.mode(kind)
            }
            return DeviceSignals(modes, enumOrNull<VibrationPattern>(o.optString("pattern")) ?: fallback.pattern)
        }

        private inline fun <reified T : Enum<T>> enumOrNull(s: String): T? =
            enumValues<T>().firstOrNull { it.name.equals(s, ignoreCase = true) }

        private fun time(iso: String?): Long? =
            iso?.takeIf { it.isNotEmpty() }?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

        /** "#e57373" → ARGB int. */
        private fun color(v: Any?): Int? {
            val s = (v as? String)?.removePrefix("#") ?: return null
            val rgb = s.toLongOrNull(16) ?: return null
            return when (s.length) {
                6 -> (0xFF000000 or rgb).toInt()
                3 -> {
                    val r = (rgb shr 8) and 0xF; val g = (rgb shr 4) and 0xF; val b = rgb and 0xF
                    (0xFF000000 or (r * 17 shl 16) or (g * 17 shl 8) or (b * 17)).toInt()
                }
                else -> null
            }
        }

        private fun JSONObject.optStringOrNull(key: String): String? =
            if (isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }

        private fun JSONArray?.objects(): List<JSONObject> =
            if (this == null) emptyList() else (0 until length()).mapNotNull { optJSONObject(it) }

        private fun JSONArray?.ints(): List<Int> =
            if (this == null) emptyList() else (0 until length()).map { optInt(it) }

        private fun JSONArray?.strings(): List<String> =
            if (this == null) emptyList() else (0 until length()).map { optString(it) }
    }
}
