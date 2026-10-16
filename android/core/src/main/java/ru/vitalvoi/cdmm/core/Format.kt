package ru.vitalvoi.cdmm.core

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

object Format {
    private val hm = DateTimeFormatter.ofPattern("HH:mm")
    private val day = DateTimeFormatter.ofPattern("EEE d MMM")

    fun time(ms: Long): String = hm.format(Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()))

    /** "14:30", "Tomorrow 09:00" or "Fri 17 Oct 09:00". */
    fun whenLabel(ms: Long, now: Long = System.currentTimeMillis()): String {
        val zone = ZoneId.systemDefault()
        val d = Instant.ofEpochMilli(ms).atZone(zone).toLocalDate()
        val today = LocalDate.now(zone)
        return when (d) {
            today -> time(ms)
            today.plusDays(1) -> "Tomorrow ${time(ms)}"
            else -> "${day.format(d)} ${time(ms)}"
        }
    }

    /** "in 5 min", "in 1 h 20 min". */
    fun until(ms: Long, now: Long = System.currentTimeMillis()): String {
        val min = ((ms - now + 59_999) / 60_000).coerceAtLeast(0)
        return when {
            min < 60 -> "in $min min"
            min % 60 == 0L -> "in ${min / 60} h"
            else -> "in ${min / 60} h ${min % 60} min"
        }
    }

    /** "Due today", "Due Fri 17 Oct", "Overdue". */
    fun due(todo: GlanceTodo, now: Long = System.currentTimeMillis()): String? {
        val due = todo.due ?: return null
        val zone = ZoneId.systemDefault()
        val d = Instant.ofEpochMilli(due).atZone(zone).toLocalDate()
        val today = LocalDate.now(zone)
        val overdue = if (todo.dueHasTime) due < now else d.isBefore(today)
        return when {
            overdue -> "Overdue"
            d == today -> if (todo.dueHasTime) "Due ${time(due)}" else "Due today"
            d == today.plusDays(1) -> "Due tomorrow"
            else -> "Due ${day.format(d)}"
        }
    }
}
