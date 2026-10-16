package ru.vitalvoi.cdmm.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.vitalvoi.cdmm.core.Api
import ru.vitalvoi.cdmm.core.Cdmm
import ru.vitalvoi.cdmm.core.Format
import ru.vitalvoi.cdmm.core.Glance
import ru.vitalvoi.cdmm.core.Store

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        setContent {
            MaterialTheme {
                AppScaffold { Root() }
            }
        }
    }
}

@Composable
private fun Root() {
    val context = LocalContext.current
    val store = remember { Store(context) }
    var signedIn by remember { mutableStateOf(store.token != null) }
    if (signedIn) Home(store, onSignedOut = { signedIn = false })
    else Pairing(store, onPaired = { signedIn = true })
}

/** Shows a code to type into CDMM Settings on any signed-in device. */
@Composable
private fun Pairing(store: Store, onPaired: () -> Unit) {
    val context = LocalContext.current
    var code by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }

    LaunchedEffect(attempt) {
        error = null
        code = null
        val api = Api(store)
        try {
            val pairing = withContext(Dispatchers.IO) { api.startPairing() }
            code = pairing.code
            while (true) {
                delay(3000)
                val result = withContext(Dispatchers.IO) { api.pollPairing(pairing.pairId) } ?: continue
                store.setSession(result.first, result.second)
                Cdmm.refresh(context)
                onPaired()
                return@LaunchedEffect
            }
        } catch (e: Exception) {
            error = if (e.message == "Code expired") "Code expired" else "No connection"
        }
    }

    ScreenScaffold {
        Column(
            Modifier.fillMaxSize().padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Pair CDMM", style = MaterialTheme.typography.titleMedium)
            when {
                error != null -> {
                    Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp))
                    Button(onClick = { attempt++ }) { Text("Try again") }
                }
                code == null -> Text("…", modifier = Modifier.padding(8.dp))
                else -> {
                    Text(
                        code!!.chunked(3).joinToString(" "),
                        fontSize = 34.sp,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(vertical = 6.dp),
                    )
                    Text(
                        "Enter in CDMM → Settings → Phone & watch",
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun Home(store: Store, onSignedOut: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var glance by remember { mutableStateOf(store.glance()) }
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    val listState = rememberScalingLazyListState()

    LaunchedEffect(Unit) {
        while (true) {
            Cdmm.refresh(context)
            if (store.token == null) {
                onSignedOut()
                return@LaunchedEffect
            }
            glance = store.glance()
            now = System.currentTimeMillis()
            delay(60_000)
        }
    }

    ScreenScaffold(scrollState = listState) { padding ->
        ScalingLazyColumn(state = listState, contentPadding = padding, modifier = Modifier.fillMaxSize()) {
            item { NowCard(glance, now) }
            item { NextCard(glance, now) }
            item { ListHeader { Text("Todo · ${glance.todos.size}") } }
            if (glance.todos.isEmpty()) {
                item { Text("All done", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            items(glance.todos, key = { it.id }) { todo ->
                Button(
                    onClick = {
                        scope.launch {
                            glance = glance.copy(todos = glance.todos - todo)
                            try {
                                store.glanceJson = withContext(Dispatchers.IO) { Api(store).setTodoDone(todo.id, true) }
                                Cdmm.changed(context)
                            } catch (_: Exception) {
                                Cdmm.refreshSoon(context)
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.filledTonalButtonColors(),
                    label = { Text(todo.title, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                    secondaryLabel = Format.due(todo, now)?.let { due -> { Text(due) } },
                )
            }
            item {
                Button(
                    onClick = {
                        store.clearSession()
                        Cdmm.changed(context)
                        onSignedOut()
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(),
                    border = ButtonDefaults.outlinedButtonBorder(enabled = true),
                    label = { Text("Sign out") },
                )
            }
        }
    }
}

@Composable
private fun NowCard(glance: Glance, now: Long) {
    val current = glance.current(now)
    val next = glance.next(now)
    Slot(
        label = if (current?.live == true) "FOCUS" else "NOW",
        title = current?.title ?: "Free",
        detail = when {
            current == null -> next?.let { "until ${Format.time(it.start)}" } ?: "Nothing planned"
            current.live -> "since ${Format.time(current.start)}"
            else -> "until ${Format.time(current.end!!)}"
        },
        color = current?.color,
    )
}

@Composable
private fun NextCard(glance: Glance, now: Long) {
    val next = glance.next(now) ?: return
    Slot(
        label = "NEXT · ${Format.until(next.start, now)}",
        title = next.title,
        detail = "${Format.whenLabel(next.start, now)}–${Format.time(next.end)}",
        color = next.color,
    )
}

@Composable
private fun Slot(label: String, title: String, detail: String, color: Int?) {
    Card(onClick = {}, modifier = Modifier.fillMaxWidth()) {
        Box {
            Column {
                Text(label, style = MaterialTheme.typography.labelSmall, color = color?.let { Color(it) } ?: MaterialTheme.colorScheme.primary)
                Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
