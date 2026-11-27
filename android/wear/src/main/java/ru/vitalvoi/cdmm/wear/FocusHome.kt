package ru.vitalvoi.cdmm.wear

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.vitalvoi.cdmm.core.Format
import ru.vitalvoi.cdmm.core.Glance
import java.util.Locale
import java.time.LocalDate

private data class FocusUi(val glance: Glance, val pending: Int, val rating: String?, val error: String?)
private fun FocusRepository.ui() = FocusUi(glance(), pending, rating, error)

internal fun elapsed(start: Long, now: Long): String {
    val seconds = (now - start).coerceAtLeast(0) / 1000
    return String.format(Locale.ROOT, "%02d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60)
}

@Composable
internal fun FocusHome(repository: FocusRepository, lifecycle: Lifecycle, onReconnect: () -> Unit, onSignedOut: () -> Unit) {
    val scope = rememberCoroutineScope()
    var ui by remember { mutableStateOf(repository.ui()) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var page by rememberSaveable { mutableStateOf("home") }
    var busy by remember { mutableStateOf(false) }
    var online by remember { mutableStateOf<Boolean?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    val listState = rememberScalingLazyListState()
    val session = ui.glance.session

    fun act(action: () -> Unit) {
        if (busy) return
        busy = true
        scope.launch {
            try {
                withContext(Dispatchers.IO) { action() }
                actionError = null
                ui = repository.ui()
                page = "home"
                busy = false
                online = repository.sync()
                ui = repository.ui()
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { actionError = "Не удалось сохранить. Попробуйте ещё раз." }
            finally { busy = false }
        }
    }

    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch {
                while (true) {
                    now = System.currentTimeMillis()
                    ui = repository.ui()
                    delay(1000)
                }
            }
            launch {
                while (true) {
                    online = repository.sync()
                    ui = repository.ui()
                    delay(if (ui.glance.session != null || ui.pending > 0) 10_000 else 20_000)
                }
            }
        }
    }
    LaunchedEffect(page, ui.rating) { listState.scrollToItem(0) }
    BackHandler(page != "home") { page = "home" }

    ScreenScaffold(scrollState = listState) { padding ->
        ScalingLazyColumn(state = listState, contentPadding = padding,
            modifier = Modifier.fillMaxSize().background(Color.Black),
            horizontalAlignment = Alignment.CenterHorizontally) {
            item { ListHeader { Text(if (ui.rating != null) "Как прошло?" else "CDMM · Фокус") } }
            if (ui.glance.fetchedAt > 0 && !ui.glance.focusSupported) item {
                CenterText("Обновите сервер CDMM, чтобы управлять занятиями с часов")
            }
            if (repository.needsPairing) item { Action("Подключить заново", onClick = onReconnect) }
            if (actionError != null || ui.error != null) item {
                Card(onClick = { repository.dismissError(); actionError = null; ui = repository.ui() }, modifier = Modifier.fillMaxWidth()) {
                    Text(actionError ?: ui.error.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    Text("Нажмите, чтобы скрыть", style = MaterialTheme.typography.labelSmall)
                }
            }
            if (ui.rating != null) {
                item { CenterText(if (ui.pending > 0) "Занятие завершено на часах" else "Занятие сохранено") }
                item { CenterText("Оцените концентрацию") }
                item { Action("Отвлекался", enabled = !busy) { act { repository.rate(1) } } }
                item { Action("Нормально", enabled = !busy) { act { repository.rate(2) } } }
                item { Action("Глубоко", enabled = !busy) { act { repository.rate(3) } } }
                item { Action("Пропустить", enabled = !busy, secondary = true) { act { repository.rate(null) } } }
            } else if (page == "settings") {
                item { CenterText(repository.store.username ?: "CDMM") }
                item { Action("Обновить", enabled = !busy, secondary = true) { act { } } }
                item { Action("Отключить часы", enabled = !busy && ui.pending == 0, secondary = true) {
                    if (!busy) {
                        busy = true
                        scope.launch {
                            try {
                                withContext(Dispatchers.IO) { repository.signOut() }
                                onSignedOut()
                            } finally { busy = false }
                        }
                    }
                } }
                item { Action("Назад", secondary = true) { page = "home" } }
            } else if (page == "finish" && session != null) {
                item { CenterText(session.title) }
                item { Timer(session.start, now) }
                item { CenterText("Сохранить занятие в календарь?") }
                item { Action("Завершить", enabled = !busy && ui.glance.focusSupported) { act { repository.finish(session) } } }
                item { Action("Продолжить", secondary = true) { page = "home" } }
            } else if (page == "subjects" && session == null) {
                item { CenterText("Выберите предмет") }
                if (ui.glance.subjects.isEmpty()) item { CenterText("Добавьте предмет в CDMM на телефоне") }
                items(ui.glance.subjects, key = { it.id }) { subject ->
                    Action(subject.name, enabled = !busy && repository.canStart) { act { repository.start(subject) } }
                }
                item { Action("Назад", secondary = true) { page = "home" } }
            } else {
                if (session != null) {
                    item { CenterText("ИДЁТ ЗАНЯТИЕ", accent = true) }
                    item { CenterText(session.title, color = session.color?.let { Color(it) }) }
                    item { Timer(session.start, now) }
                    item { Action("Завершить", enabled = !busy && session.id.isNotEmpty() && ui.glance.focusSupported) { page = "finish" } }
                } else {
                    item { CenterText("Время сосредоточиться", accent = true) }
                    val planned = ui.glance.events.filter { it.plan && it.start <= now && now < it.end }.minByOrNull { it.end }
                    val subject = ui.glance.subjects.firstOrNull { it.id == planned?.subjectId }
                    if (planned != null) {
                        item { InfoCard("СЕЙЧАС · до ${Format.time(planned.end)}", planned.title, planned.color) }
                        if (subject != null) item {
                            Action("Начать ${subject.name}", enabled = !busy && repository.canStart) { act { repository.start(subject) } }
                        }
                    }
                    item { Action(if (subject == null) "Начать занятие" else "Другой предмет",
                        enabled = !busy && repository.canStart, secondary = subject != null) { page = "subjects" } }
                }
                val next = ui.glance.events.filter { it.plan && it.start > now }.minByOrNull { it.start }
                if (next != null) item { InfoCard("ДАЛЬШЕ · ${Format.whenLabel(next.start, now)}", next.title, next.color) }
                val tasks = ui.glance.dayTasks.filter { session == null || it.subjectId.isEmpty() || it.subjectId == session.subjectId }
                if (ui.glance.taskDate == LocalDate.now().toString() && tasks.isNotEmpty()) {
                    item { ListHeader { Text("Задачи на сегодня") } }
                    items(tasks, key = { "task-${it.id}" }) { task ->
                        Action("${if (task.done) "✓" else "○"} ${task.text}", enabled = !busy, secondary = true) {
                            act { repository.toggleTask(task, ui.glance.taskDate) }
                        }
                    }
                }
                item { Action("Подключение", secondary = true) { page = "settings" } }
            }
            item { CenterText(when {
                ui.pending > 0 -> "На часах · к отправке: ${ui.pending}"
                online == false -> "Без связи · данные сохранены"
                online == null -> "Подключаемся…"
                else -> "Синхронизировано"
            }) }
        }
    }
}

@Composable
private fun Timer(start: Long, now: Long) {
    Text(elapsed(start, now), fontSize = 30.sp, fontFamily = FontFamily.Monospace,
        color = MaterialTheme.colorScheme.primary, maxLines = 1, modifier = Modifier.padding(vertical = 8.dp))
}

@Composable
private fun CenterText(text: String, accent: Boolean = false, color: Color? = null) {
    Text(text, textAlign = TextAlign.Center,
        color = color ?: if (accent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
}

@Composable
private fun Action(text: String, enabled: Boolean = true, secondary: Boolean = false, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth(),
        colors = if (secondary) ButtonDefaults.filledTonalButtonColors() else ButtonDefaults.buttonColors(),
        label = { Text(text, maxLines = 2, overflow = TextOverflow.Ellipsis) })
}

@Composable
private fun InfoCard(label: String, title: String, color: Int?) {
    Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = color?.let { Color(it) } ?: MaterialTheme.colorScheme.primary)
        Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}
