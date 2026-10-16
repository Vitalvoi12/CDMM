package ru.vitalvoi.cdmm.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.CheckBox
import androidx.glance.appwidget.CheckboxDefaults
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import org.json.JSONObject
import ru.vitalvoi.cdmm.MainActivity
import ru.vitalvoi.cdmm.core.Api
import ru.vitalvoi.cdmm.core.Cdmm
import ru.vitalvoi.cdmm.core.Format
import ru.vitalvoi.cdmm.core.GlanceTodo
import ru.vitalvoi.cdmm.core.Store

/** Open tasks, most pressing first; ticking one off completes it on the server. */
class TodoWidget : GlanceAppWidget() {
    override val stateDefinition = PreferencesGlanceStateDefinition
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = Store(context)
        provideContent {
            val tick = currentState(Widgets.TICK)
            val todos = remember(tick) { store.glance().todos }
            TodoContent(todos, signedIn = store.token != null)
        }
    }
}

class TodoWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget = TodoWidget()
}

private val TODO_ID = ActionParameters.Key<String>("todoId")

@Composable
private fun TodoContent(todos: List<GlanceTodo>, signedIn: Boolean) {
    Column(
        GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(20.dp)
            .background(Widgets.bg).padding(horizontal = 10.dp, vertical = 12.dp),
    ) {
        Row(
            GlanceModifier.fillMaxWidth().padding(horizontal = 4.dp).clickable(actionStartActivity<MainActivity>()),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("TODO", style = TextStyle(color = Widgets.muted, fontSize = 11.sp, fontWeight = FontWeight.Medium))
            Spacer(GlanceModifier.width(6.dp))
            Text(
                if (todos.size >= 30) "30+" else todos.size.toString(),
                style = TextStyle(color = Widgets.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold),
            )
        }
        Spacer(GlanceModifier.height(6.dp))
        when {
            !signedIn -> Hint("Open CDMM to sign in")
            todos.isEmpty() -> Hint("All done")
            else -> LazyColumn(GlanceModifier.fillMaxSize()) {
                items(todos, itemId = { it.id.hashCode().toLong() }) { TodoRow(it) }
            }
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(text, modifier = GlanceModifier.padding(4.dp), style = TextStyle(color = Widgets.muted, fontSize = 14.sp))
}

@Composable
private fun TodoRow(todo: GlanceTodo) {
    val due = Format.due(todo)
    Row(GlanceModifier.fillMaxWidth().padding(vertical = 1.dp), verticalAlignment = Alignment.CenterVertically) {
        CheckBox(
            checked = false,
            onCheckedChange = actionRunCallback<CompleteTodo>(actionParametersOf(TODO_ID to todo.id)),
            colors = CheckboxDefaults.colors(checkedColor = Widgets.accent, uncheckedColor = Widgets.muted),
        )
        Column(GlanceModifier.defaultWeight().clickable(actionStartActivity<MainActivity>())) {
            Text(
                todo.title,
                maxLines = 2,
                style = TextStyle(
                    color = Widgets.text,
                    fontSize = 14.sp,
                    fontWeight = if (todo.important) FontWeight.Medium else FontWeight.Normal,
                ),
            )
            if (due != null) {
                Text(
                    due,
                    style = TextStyle(color = if (due == "Overdue" || todo.urgent) Widgets.urgent else Widgets.muted, fontSize = 11.sp),
                )
            }
        }
    }
}

/** Tick a task off: drop it from the widget at once, then tell the server. */
class CompleteTodo : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val id = parameters[TODO_ID] ?: return
        val store = Store(context)
        store.glanceJson?.let { json ->
            val o = JSONObject(json)
            val todos = o.optJSONArray("todos")
            if (todos != null) {
                for (i in todos.length() - 1 downTo 0) if (todos.optJSONObject(i)?.optString("id") == id) todos.remove(i)
                store.glanceJson = o.toString()
            }
        }
        Widgets.redraw(context)
        try {
            store.glanceJson = Api(store).setTodoDone(id, true)
            Cdmm.changed(context)
        } catch (_: Exception) {
            // offline: the next refresh brings the task back
            Cdmm.refreshSoon(context)
        }
    }
}
