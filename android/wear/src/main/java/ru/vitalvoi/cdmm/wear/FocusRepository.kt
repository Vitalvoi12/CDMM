package ru.vitalvoi.cdmm.wear

import android.content.Context
import android.annotation.SuppressLint
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import ru.vitalvoi.cdmm.core.Api
import ru.vitalvoi.cdmm.core.ApiException
import ru.vitalvoi.cdmm.core.Cdmm
import ru.vitalvoi.cdmm.core.FocusSubject
import ru.vitalvoi.cdmm.core.FocusTask
import ru.vitalvoi.cdmm.core.Glance
import ru.vitalvoi.cdmm.core.GlanceSession
import ru.vitalvoi.cdmm.core.Store
import ru.vitalvoi.cdmm.core.UnauthorizedException
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Durable outbox. Only acknowledged commands leave it; UI and tiles project it over the server snapshot. */
@SuppressLint("ApplySharedPref") // Outbox writes must reach disk before the UI acknowledges an action; callers use IO.
class FocusRepository(context: Context) {
    private val context = context.applicationContext
    private val prefs = this.context.getSharedPreferences("focus", Context.MODE_PRIVATE)
    val store = Store(this.context)
    private fun queue(): List<JSONObject> {
        val array = JSONArray(prefs.getString("queue", "[]"))
        return (0 until array.length()).map { array.getJSONObject(it) }
    }
    val pending: Int get() = synchronized(lock) { queue().size }
    val error: String? get() = prefs.getString("error", null)
    val rating: String? get() = prefs.getString("rating", null)
    val needsPairing: Boolean get() = prefs.getBoolean("needsPairing", false)
    val canStart: Boolean get() = synchronized(lock) {
        val view = glance()
        view.focusSupported && view.session == null && queue().none { it.optString("action") in listOf("start", "finish") }
    }

    fun acceptPairing(token: String, username: String) = synchronized(lock) {
        val owner = prefs.getString("owner", store.username)
        check(queue().isEmpty() || owner.equals(username, ignoreCase = true)) {
            "Есть неотправленные действия. Подключите прежний аккаунт: $owner"
        }
        if (!store.username.equals(username, ignoreCase = true) && queue().isEmpty()) {
            prefs.edit().clear().commit()
        }
        store.clearSession()
        store.setSession(token, username)
        prefs.edit().remove("needsPairing").remove("error").commit()
    }

    fun glance(): Glance = synchronized(lock) {
        var view = store.glance()
        for (command in queue()) when (command.getString("action")) {
            "start" -> view = view.copy(session = GlanceSession(
                command.getString("title"),
                if (command.has("color")) command.getInt("color") else null,
                Instant.parse(command.getString("at")).toEpochMilli(),
                command.getString("sessionId"), command.getString("subjectId"),
            ))
            "finish" -> if (view.session?.id == command.getString("sessionId")) view = view.copy(session = null)
            "task" -> if (view.taskDate == command.optString("day")) view = view.copy(dayTasks = view.dayTasks.map {
                if (it.id == command.getString("sessionId")) it.copy(done = command.getBoolean("completed")) else it
            })
        }
        view
    }

    private fun command(action: String, sessionId: String) = JSONObject()
        .put("action", action).put("commandId", UUID.randomUUID().toString()).put("sessionId", sessionId)
        .put("day", LocalDate.now().toString())

    fun toggleTask(task: FocusTask, day: String) = synchronized(lock) {
        check(day == LocalDate.now().toString()) { "Обновите список на сегодня" }
        val commands = queue() + command("task", task.id).put("day", day).put("completed", !task.done)
        check(prefs.edit().putString("queue", JSONArray(commands).toString()).putString("owner", store.username).commit())
        changed()
    }

    fun start(subject: FocusSubject) = synchronized(lock) {
        check(canStart) { "Дождитесь синхронизации" }
        val command = command("start", UUID.randomUUID().toString())
            .put("subjectId", subject.id).put("title", subject.name).put("color", subject.color)
            .put("at", Instant.now().toString()).put("expectedSessionAt", store.glance().sessionAt)
        check(prefs.edit().putString("queue", JSONArray(queue() + command).toString()).putString("owner", store.username).remove("error").commit())
        changed()
    }

    fun finish(session: GlanceSession) = synchronized(lock) {
        check(glance().session?.id == session.id && session.id.isNotEmpty()) { "Сессия уже изменилась" }
        val commands = queue() + command("finish", session.id).put("at", Instant.now().toString())
        check(prefs.edit().putString("queue", JSONArray(commands).toString())
            .putString("owner", store.username).putString("rating", session.id).remove("error").commit())
        changed()
    }

    fun rate(value: Int?) = synchronized(lock) {
        val id = rating ?: return@synchronized
        val commands = if (value == null) queue() else queue() + command("rate", id).put("focus", value)
        check(prefs.edit().putString("queue", JSONArray(commands).toString()).remove("rating").commit())
        changed()
    }

    fun signOut() = synchronized(lock) {
        check(queue().isEmpty())
        prefs.edit().clear().commit()
        store.clearSession()
        Cdmm.changed(context)
    }

    private fun changed() {
        WearApp.redraw(context)
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        WorkManager.getInstance(context).enqueueUniqueWork("focus-now", ExistingWorkPolicy.APPEND_OR_REPLACE,
            OneTimeWorkRequestBuilder<FocusWorker>().setConstraints(net).build())
    }

    suspend fun sync(): Boolean = withContext(Dispatchers.IO) {
        syncMutex.withLock {
            val token = store.token ?: return@withLock true
            try {
                while (true) {
                    val next = synchronized(lock) { queue().firstOrNull() } ?: break
                    try {
                        val json = Api(store).focus(next)
                        synchronized(lock) {
                            if (store.token != token) { return@withLock true }
                            // Snapshot first: replay after process death is safe on the server.
                            store.glanceJson = json
                            val remaining = queue().filter { it.getString("commandId") != next.getString("commandId") }
                            check(prefs.edit().putString("queue", JSONArray(remaining).toString()).commit())
                        }
                    } catch (e: ApiException) {
                        if (e.status == 404 && e.message == "Not found") {
                            prefs.edit().putString("error", "Обновите сервер CDMM для управления занятиями. Очередь сохранена.").commit()
                            return@withLock false
                        }
                        if (e.status !in listOf(400, 404, 409)) { throw e }
                        synchronized(lock) {
                            val id = next.getString("sessionId")
                            val remaining = queue().filter { it.getString("sessionId") != id }
                            val rejected = JSONArray(prefs.getString("rejected", "[]"))
                            queue().filter { it.getString("sessionId") == id }.forEach { rejected.put(it) }
                            val edit = prefs.edit().putString("queue", JSONArray(remaining).toString())
                                .putString("rejected", rejected.toString())
                                .putString("error", "Не удалось отправить: данные изменились на другом устройстве. Копия действия сохранена на часах.")
                            if (rating == id) { edit.remove("rating") }
                            check(edit.commit())
                        }
                    }
                }
                val json = Api(store).glance()
                synchronized(lock) {
                    if (store.token != token) { return@withLock true }
                    store.glanceJson = json
                }
                Cdmm.changed(context)
                true
            } catch (_: UnauthorizedException) {
                prefs.edit().putBoolean("needsPairing", true).putString("error", "Доступ отозван. Подключите часы заново — неотправленные действия сохранятся.").commit()
                false
            } catch (_: IOException) {
                false
            }
        }
    }

    fun dismissError() { prefs.edit().remove("error").apply() }

    companion object {
        private val lock = Any()
        private val syncMutex = Mutex()
        fun schedule(context: Context) {
            val manager = WorkManager.getInstance(context)
            // Replace the previous read-only worker on app upgrade.
            manager.cancelUniqueWork("cdmm-refresh")
            manager.cancelUniqueWork("cdmm-refresh-now")
            val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            manager.enqueueUniquePeriodicWork("focus-sync", ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<FocusWorker>(15, TimeUnit.MINUTES).setConstraints(net).build())
            FocusRepository(context).changed()
        }
    }
}

class FocusWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result =
        if (FocusRepository(applicationContext).sync()) Result.success() else Result.retry()
}
