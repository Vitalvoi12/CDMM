package ru.vitalvoi.cdmm.core

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Reminders and event edges, given by this device itself from the last
 * snapshot — no push service involved. Only the earliest pending moment holds
 * an alarm; when it rings, everything due is signalled and the next one is set.
 */
object Signals {
    /** A moment missed by up to this much (phone asleep, just booted) still signals. */
    private const val GRACE_MS = 5 * 60_000L
    private const val CHANNEL_SOUND = "signals_sound"
    private const val CHANNEL_SILENT = "signals_silent"

    data class Moment(
        val key: String,
        val at: Long,
        val kind: SignalKind,
        val title: String,
        val body: String,
    )

    fun moments(glance: Glance): List<Moment> {
        val out = mutableListOf<Moment>()
        for (e in glance.events) {
            val span = "${Format.time(e.start)}–${Format.time(e.end)}"
            for (lead in e.leads) {
                val body = if (lead == 0) "Starting now · $span" else "Starts in ${leadText(lead)} · $span"
                out += Moment("r|${e.id}|${e.start}|$lead", e.start - lead * 60_000L, SignalKind.REMINDER, e.title, body)
            }
            out += Moment("s|${e.id}|${e.start}", e.start, SignalKind.START, e.title, "Starts now · $span")
            out += Moment("e|${e.id}|${e.end}", e.end, SignalKind.END, e.title, "Ends now · $span")
        }
        for (t in glance.todos) for (at in t.reminders) {
            out += Moment("t|${t.id}|$at", at, SignalKind.TODO, t.title, Format.due(t) ?: "Task reminder")
        }
        return out
    }

    private fun leadText(min: Int): String {
        val d = min / 1440; val h = min % 1440 / 60; val m = min % 60
        return listOfNotNull(d.takeIf { it > 0 }?.let { "$it d" }, h.takeIf { it > 0 }?.let { "$it h" }, m.takeIf { it > 0 }?.let { "$it min" })
            .joinToString(" ")
    }

    /** Set the alarm for the next signal, or the next widget redraw if sooner. */
    fun schedule(context: Context) {
        val store = Store(context)
        val now = System.currentTimeMillis()
        val am = context.getSystemService(AlarmManager::class.java)
        val pi = alarmIntent(context)
        if (store.token == null) {
            am.cancel(pi)
            return
        }
        val glance = store.glance()
        val settings = glance.signals(Cdmm.device)
        val due = moments(glance)
            .filter { settings.mode(it.kind) != SignalMode.OFF && it.at > now - GRACE_MS && !store.wasFired(it.key) }
            .minOfOrNull { it.at }
        val next = listOfNotNull(due, glance.nextBoundary(now)).minOrNull()
        if (next == null) {
            am.cancel(pi)
            return
        }
        val at = next.coerceAtLeast(now + 1000)
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } else {
            am.setWindow(AlarmManager.RTC_WAKEUP, at, 60_000, pi)
        }
    }

    /** Signal everything due now. Called by the alarm. */
    fun fireDue(context: Context) {
        val store = Store(context)
        if (store.token == null) return
        val now = System.currentTimeMillis()
        val glance = store.glance()
        val settings = glance.signals(Cdmm.device)
        val due = moments(glance).filter {
            settings.mode(it.kind) != SignalMode.OFF && it.at <= now + 1000 && it.at > now - GRACE_MS && !store.wasFired(it.key)
        }
        // Several at once (a block ends as the next starts): one buzz, every notification.
        var buzzed = false
        for (m in due.sortedBy { it.at }) {
            val mode = settings.mode(m.kind)
            notify(context, m, sound = mode == SignalMode.SOUND || mode == SignalMode.BOTH)
            if (!buzzed && (mode == SignalMode.VIBRATE || mode == SignalMode.BOTH)) {
                vibrate(context, settings.pattern)
                buzzed = true
            }
            store.markFired(m.key, m.at)
        }
    }

    fun vibrate(context: Context, pattern: VibrationPattern) {
        val vibrator = if (Build.VERSION.SDK_INT >= 31) {
            context.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        }
        val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build()
        @Suppress("DEPRECATION")
        vibrator.vibrate(VibrationEffect.createWaveform(pattern.timings, -1), attrs)
    }

    fun ensureChannels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SOUND, "Reminders with sound", NotificationManager.IMPORTANCE_HIGH).apply {
                enableVibration(false) // the app vibrates itself, in the chosen pattern
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_SILENT, "Silent reminders", NotificationManager.IMPORTANCE_HIGH).apply {
                setSound(null, null)
                enableVibration(false)
            },
        )
    }

    private fun notify(context: Context, m: Moment, sound: Boolean) {
        ensureChannels(context)
        val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val n = NotificationCompat.Builder(context, if (sound) CHANNEL_SOUND else CHANNEL_SILENT)
            .setSmallIcon(R.drawable.ic_cdmm_notify)
            .setContentTitle(m.title)
            .setContentText(m.body)
            .setCategory(if (m.kind == SignalKind.TODO) NotificationCompat.CATEGORY_REMINDER else NotificationCompat.CATEGORY_EVENT)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open)
            // The watch app signals by its own settings; don't mirror the phone's too.
            .setLocalOnly(true)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(m.key.hashCode(), n)
        } catch (_: SecurityException) {
            // notifications not allowed: the vibration still went off
        }
    }

    private fun alarmIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context, 1,
            Intent(context, SignalReceiver::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
}

class SignalReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Signals.fireDue(context)
        Cdmm.changed(context)
    }
}

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Cdmm.changed(context)
        Cdmm.startSync(context)
    }
}
