package ru.vitalvoi.cdmm.core

import android.content.Context
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
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Entry point shared by the phone and the watch app. Each app sets [device]
 * and [onUpdated] (redraw widgets / tiles) in its Application.onCreate.
 */
object Cdmm {
    lateinit var device: Device
    var onUpdated: (Context) -> Unit = {}

    /** Fetch the snapshot, reschedule signals, redraw. Returns false when offline or signed out. */
    suspend fun refresh(context: Context): Boolean = withContext(Dispatchers.IO) {
        val store = Store(context)
        if (store.token == null) return@withContext false
        val ok = try {
            store.glanceJson = Api(store).glance()
            true
        } catch (_: UnauthorizedException) {
            store.clearSession()
            false
        } catch (_: Exception) {
            false
        }
        changed(context)
        ok
    }

    /** Local state changed (new snapshot, sign-in/out): reschedule and redraw. */
    fun changed(context: Context) {
        Signals.schedule(context)
        onUpdated(context)
    }

    /** Periodic refresh, plus one right now. */
    fun startSync(context: Context) {
        val wm = WorkManager.getInstance(context)
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        wm.enqueueUniquePeriodicWork(
            "cdmm-refresh",
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<RefreshWorker>(15, TimeUnit.MINUTES).setConstraints(net).build(),
        )
        refreshSoon(context)
    }

    fun refreshSoon(context: Context) {
        val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "cdmm-refresh-now",
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<RefreshWorker>().setConstraints(net).build(),
        )
    }
}

class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        Cdmm.refresh(applicationContext)
        return Result.success()
    }
}
