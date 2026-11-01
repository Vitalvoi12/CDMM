package ru.vitalvoi.cdmm.core

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class UnauthorizedException : IOException("Signed out")

/** The few CDMM endpoints the native apps use. Blocking: call off the main thread. */
class Api(private val store: Store) {

    fun glance(): String = request("GET", "/api/glance")

    fun setTodoDone(id: String, done: Boolean): String =
        request("POST", "/api/glance/todo", JSONObject().put("id", id).put("completed", done))

    data class Pairing(val pairId: String, val code: String)

    fun startPairing(): Pairing {
        val o = JSONObject(request("POST", "/api/pair/start", JSONObject(), auth = false))
        return Pairing(o.getString("pairId"), o.getString("code"))
    }

    /** Token and username once the code was entered; null while waiting. */
    fun pollPairing(pairId: String): Pair<String, String>? {
        val (status, body) = raw("POST", "/api/pair/poll", JSONObject().put("pairId", pairId), auth = false)
        return when (status) {
            200 -> JSONObject(body).let { it.getString("token") to it.optString("username") }
            202 -> null
            else -> throw IOException("Code expired")
        }
    }

    private fun request(method: String, path: String, body: JSONObject? = null, auth: Boolean = true): String {
        val (status, text) = raw(method, path, body, auth)
        if (status == 401) throw UnauthorizedException()
        if (status !in 200..299) throw IOException("HTTP $status")
        return text
    }

    private fun raw(method: String, path: String, body: JSONObject?, auth: Boolean): Pair<Int, String> {
        val conn = URL(store.server + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("Accept", "application/json")
            if (auth) store.token?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val status = conn.responseCode
            val stream = if (status >= 400) conn.errorStream else conn.inputStream
            return status to (stream?.bufferedReader()?.use { it.readText() } ?: "")
        } finally {
            conn.disconnect()
        }
    }
}
