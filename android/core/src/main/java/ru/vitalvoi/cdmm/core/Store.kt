package ru.vitalvoi.cdmm.core

import android.content.Context
import android.content.SharedPreferences

/** Session and the last snapshot, kept for widgets and alarms. */
class Store(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("cdmm", Context.MODE_PRIVATE)

    var server: String
        get() = prefs.getString(KEY_SERVER, null) ?: DEFAULT_SERVER
        set(v) = prefs.edit().putString(KEY_SERVER, v.trimEnd('/')).apply()

    val token: String? get() = prefs.getString(KEY_TOKEN, null)
    val username: String? get() = prefs.getString(KEY_USER, null)

    fun setSession(token: String, username: String) {
        prefs.edit().putString(KEY_TOKEN, token).putString(KEY_USER, username).apply()
    }

    fun clearSession() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_USER).remove(KEY_GLANCE).apply()
    }

    var glanceJson: String?
        get() = prefs.getString(KEY_GLANCE, null)
        set(v) = prefs.edit().putString(KEY_GLANCE, v).apply()

    fun glance(): Glance = glanceJson?.let { runCatching { Glance.parse(it) }.getOrNull() } ?: Glance.EMPTY

    /** Signals already given, so a reschedule never repeats one. */
    fun wasFired(key: String): Boolean = prefs.getStringSet(KEY_FIRED, emptySet())!!.any { it.startsWith("$key@") }

    fun markFired(key: String, at: Long) {
        val cutoff = System.currentTimeMillis() - 2 * 86_400_000L
        val kept = prefs.getStringSet(KEY_FIRED, emptySet())!!
            .filter { it.substringAfterLast('@').toLongOrNull()?.let { t -> t > cutoff } == true }
            .toMutableSet()
        kept += "$key@$at"
        prefs.edit().putStringSet(KEY_FIRED, kept).apply()
    }

    companion object {
        const val DEFAULT_SERVER = "https://cdmm.vitalvoi.ru"
        private const val KEY_SERVER = "server"
        private const val KEY_TOKEN = "token"
        private const val KEY_USER = "username"
        private const val KEY_GLANCE = "glance"
        private const val KEY_FIRED = "fired"
    }
}
