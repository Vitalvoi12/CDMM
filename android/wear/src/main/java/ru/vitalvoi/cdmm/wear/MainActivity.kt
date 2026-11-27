package ru.vitalvoi.cdmm.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.CancellationException
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import ru.vitalvoi.cdmm.core.Api
import ru.vitalvoi.cdmm.core.Cdmm
import ru.vitalvoi.cdmm.core.Store

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        setContent {
            MaterialTheme {
                AppScaffold { Root(lifecycle) }
            }
        }
    }
}

@Composable
private fun Root(lifecycle: Lifecycle) {
    val context = LocalContext.current
    val store = remember { Store(context) }
    var signedIn by remember { mutableStateOf(store.token != null) }
    if (signedIn) FocusHome(remember { FocusRepository(context) }, lifecycle,
        onReconnect = { signedIn = false }, onSignedOut = { signedIn = false })
    else Pairing(store, onPaired = { signedIn = true })
}

/** Shows a code to type into CDMM Settings on any signed-in device. */
@Composable
private fun Pairing(store: Store, onPaired: () -> Unit) {
    val context = LocalContext.current
    var code by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }

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
                FocusRepository(context).acceptPairing(result.first, result.second)
                Cdmm.refresh(context)
                onPaired()
                return@LaunchedEffect
            }
        } catch (e: CancellationException) { throw e } catch (e: Exception) {
            error = when {
                e.message == "Code expired" -> "Код истёк"
                e is IllegalStateException -> e.message
                else -> "Нет соединения"
            }
        }
    }

    ScreenScaffold {
        Column(
            Modifier.fillMaxSize().padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Подключить CDMM", style = MaterialTheme.typography.titleMedium)
            when {
                error != null -> {
                    Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(vertical = 8.dp))
                    Button(onClick = { attempt++ }) { Text("Повторить") }
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
                        "Введите код в CDMM → Настройки → Телефон и часы",
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}
