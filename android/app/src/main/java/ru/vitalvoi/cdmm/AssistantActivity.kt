package ru.vitalvoi.cdmm

import android.media.MediaPlayer
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.BulletSpan
import android.text.style.StyleSpan
import java.io.File
import java.io.FileInputStream
import android.Manifest
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import org.json.JSONObject
import ru.vitalvoi.cdmm.core.*
import java.util.Locale
import java.util.UUID
import kotlin.math.*

private val ink = Color.rgb(241, 238, 231)
private val muted = Color.rgb(169, 165, 156)
private val coral = Color.rgb(233, 130, 106)
private val surface = Color.rgb(32, 32, 29)
private fun Context.dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()

private class VoiceMeter(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = coral }
    private var level = 0f
    var target = 0f
        set(value) { field = value.coerceIn(0f, 1f); invalidate() }

    override fun onDraw(canvas: Canvas) {
        level += (target - level) * 0.32f
        val unit = resources.displayMetrics.density
        for (i in -8..8) {
            val center = width / 2f + i * unit * 5
            val height = unit * (1.5f + level * (1f - abs(i) / 10f) * (5f + 9f * abs(cos(i * 1.9)).toFloat()))
            paint.alpha = 240 - abs(i) * 15
            canvas.drawRoundRect(center - unit * 1.5f, this.height / 2f - height,
                center + unit * 1.5f, this.height / 2f + height, 3 * unit, 3 * unit, paint)
        }
        if (abs(target - level) > 0.01f) postInvalidateOnAnimation()
    }
}

class AssistantActivity : ComponentActivity() {
    private lateinit var input: EditText
    private lateinit var status: TextView
    private lateinit var caption: TextView
    private lateinit var mic: ImageButton
    private lateinit var mode: ImageButton
    private lateinit var meter: VoiceMeter
    private var typing = false
    private var busy = false
    private var pendingText: String? = null
    private var requestId: String? = null
    private var recording: CommandRecording? = null
    private var transcriptionGeneration = 0
    private var recognizer: SpeechRecognizer? = null
    private var speech: TextToSpeech? = null
    private var playback: MediaPlayer? = null
    private var speechGeneration = 0
    private var speechReady = false
    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { allowed ->
        if (allowed) listen() else {
            edit(true)
            status.text = "Для диктовки разреши доступ к микрофону."
        }
    }

    private fun rounded(color: Int, radius: Int, stroke: Boolean = false) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(radius).toFloat()
        if (stroke) setStroke(dp(1), Color.rgb(57, 55, 50))
    }

    private fun label(size: Float, color: Int) = TextView(this).apply {
        textSize = size
        setTextColor(color)
        typeface = resources.getFont(R.font.inter)
    }

    private fun button(icon: Int, description: String, accent: Boolean = false, action: () -> Unit) = ImageButton(this).apply {
        background = RippleDrawable(ColorStateList.valueOf(0x38ffffff), rounded(if (accent) coral else surface, 24), null)
        setImageResource(icon)
        setColorFilter(if (accent) Color.rgb(11, 11, 10) else ink)
        contentDescription = description
        setOnClickListener { action() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(9), dp(18), dp(14))
            background = rounded(Color.rgb(20, 20, 20), 30, true)
            isFocusableInTouchMode = true
        }
        val grip = View(this).apply { background = rounded(Color.rgb(81, 78, 71), 3) }
        panel.addView(grip, LinearLayout.LayoutParams(dp(38), dp(3)).apply { gravity = Gravity.CENTER_HORIZONTAL })
        val header = FrameLayout(this)
        var dragStart = 0f
        header.setOnTouchListener { view, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    panel.animate().cancel()
                    dragStart = event.rawY
                }
                MotionEvent.ACTION_MOVE -> panel.translationY = ((event.rawY - dragStart) * 0.6f).coerceAtLeast(0f)
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (event.actionMasked == MotionEvent.ACTION_UP && panel.translationY > dp(40)) finish()
                    else {
                        panel.animate().translationY(0f).setDuration(180).start()
                        if (event.actionMasked == MotionEvent.ACTION_UP) view.performClick()
                    }
                }
            }
            true
        }
        header.addView(label(18f, ink).apply {
            text = "CDMM"
            letterSpacing = -0.04f
            setTypeface(typeface, Typeface.BOLD)
        }, FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.CENTER))
        header.addView(button(R.drawable.panel_close, "Закрыть") { finish() },
            FrameLayout.LayoutParams(dp(44), dp(44), Gravity.END or Gravity.CENTER_VERTICAL))
        panel.addView(header, MATCH_PARENT, dp(52))
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = rounded(surface, 18)
            setPadding(dp(16), dp(14), dp(16), dp(16))
        }
        caption = label(12f, coral).apply { text = "Помощник" }
        card.addView(caption)
        status = label(18f, ink).apply {
            text = savedInstanceState?.getCharSequence("status") ?: "Чем помочь?"
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        val scroll = ScrollView(this).apply {
            addView(status)
            isVerticalScrollBarEnabled = true
        }
        // Let short replies hug their content and long replies scroll inside the panel.
        val viewport = object : FrameLayout(this) {
            override fun onMeasure(w: Int, h: Int) {
                val cap = min(dp(220), resources.displayMetrics.heightPixels / 4)
                super.onMeasure(w, MeasureSpec.makeMeasureSpec(cap, MeasureSpec.AT_MOST))
            }
        }
        viewport.addView(scroll, MATCH_PARENT, WRAP_CONTENT)
        card.addView(viewport, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(6) })
        input = EditText(this).apply {
            typeface = resources.getFont(R.font.inter)
            setTextColor(ink)
            setHintTextColor(muted)
            textSize = 17f
            background = null
            setSingleLine(true)
            hint = "Напиши команду"
            imeOptions = EditorInfo.IME_ACTION_SEND
            setText(savedInstanceState?.getString("input"))
            setOnEditorActionListener { _, id, _ ->
                if (id == EditorInfo.IME_ACTION_SEND) { send(); true } else false
            }
            visibility = View.GONE
        }
        card.addView(input)
        panel.addView(card, MATCH_PARENT, WRAP_CONTENT)
        val controls = FrameLayout(this)
        mic = button(R.drawable.panel_mic, "Говорить", true) {
            val active = recording
            if (active != null) active.stop() else if (recognizer != null) recognizer?.stopListening() else listen()
        }
        mode = button(R.drawable.panel_keyboard, "Ввести текст") { if (typing) send() else edit(true) }
        meter = VoiceMeter(this)
        controls.addView(meter, FrameLayout.LayoutParams(dp(100), dp(44), Gravity.CENTER))
        controls.addView(mic, FrameLayout.LayoutParams(dp(48), dp(48), Gravity.START or Gravity.CENTER_VERTICAL))
        controls.addView(mode, FrameLayout.LayoutParams(dp(48), dp(48), Gravity.END or Gravity.CENTER_VERTICAL))
        panel.addView(controls, LinearLayout.LayoutParams(MATCH_PARENT, dp(52)).apply { topMargin = dp(10) })
        setContentView(panel)
        window.setGravity(Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL)
        window.attributes = window.attributes.apply { y = dp(10) }
        window.setLayout(min(resources.displayMetrics.widthPixels - dp(20), dp(480)), WRAP_CONTENT)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN)
        setFinishOnTouchOutside(true)
        pendingText = savedInstanceState?.getString("pendingText")
        requestId = savedInstanceState?.getString("requestId")
        speech = TextToSpeech(this) { result ->
            if (result == TextToSpeech.SUCCESS) speechReady = (speech?.setLanguage(Locale.forLanguageTag("ru-RU")) ?: -1) >= 0
        }
        if (savedInstanceState?.getBoolean("typing") == true) edit(true)
        if (savedInstanceState == null && intent.action == Intent.ACTION_ASSIST) panel.post { listen() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == Intent.ACTION_ASSIST) window.decorView.post { listen() }
    }

    private fun edit(enabled: Boolean) {
        if (enabled) { stopSpeech(); releaseRecognizer() }
        typing = enabled
        input.visibility = if (enabled) View.VISIBLE else View.GONE
        mode.setImageResource(if (enabled) R.drawable.panel_send else R.drawable.panel_keyboard)
        mode.contentDescription = if (enabled) "Отправить" else "Ввести текст"
        val keyboard = getSystemService(InputMethodManager::class.java)
        if (enabled) {
            input.requestFocus()
            input.post { keyboard.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT) }
        } else keyboard.hideSoftInputFromWindow(input.windowToken, 0)
    }

    private fun unlocked(): Boolean {
        if (!getSystemService(KeyguardManager::class.java).isDeviceLocked) return true
        status.text = "Разблокируй телефон перед выполнением команды"
        return false
    }

    private fun releaseRecognizer() {
        recording?.close()
        recording = null
        val current = recognizer
        recognizer = null
        current?.cancel()
        current?.destroy()
        mic.setImageResource(R.drawable.panel_mic)
        mic.contentDescription = "Говорить"
        meter.target = 0f
        caption.text = "Помощник"
    }

    private fun listen() {
        if (busy || isFinishing || recording != null || recognizer != null || !unlocked()) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            permission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        val capture = if (android.os.Build.VERSION.SDK_INT >= 33) {
            runCatching { CommandRecording() }.getOrNull()
        } else null
        if (capture == null && !SpeechRecognizer.isRecognitionAvailable(this)) {
            edit(true)
            status.text = "Диктовка недоступна. Введи команду текстом."
            return
        }
        stopSpeech()
        edit(false)
        recording = capture
        val current = if (SpeechRecognizer.isRecognitionAvailable(this)) SpeechRecognizer.createSpeechRecognizer(this) else null
        var androidText: String? = null
        recognizer = current
        caption.text = "Диктовка"
        status.text = "Слушаю…"
        mic.setImageResource(R.drawable.panel_stop)
        mic.contentDescription = "Завершить диктовку"
        current?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) { if (recognizer === current) meter.target = (rmsdB + 2) / 12 }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() { if (recognizer === current) meter.target = 0f }
            override fun onEvent(eventType: Int, params: Bundle?) {}
            override fun onPartialResults(results: Bundle?) {
                if (recognizer !== current) return
                results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let {
                    androidText = it
                    status.text = it
                }
            }
            override fun onResults(results: Bundle?) {
                if (recognizer !== current) return
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                if (capture != null) { androidText = text ?: androidText; return }
                releaseRecognizer()
                if (text.isNullOrBlank()) { status.text = "Не расслышал. Повтори команду."; return }
                input.setText(text)
                send()
            }
            override fun onError(error: Int) {
                if (recognizer !== current) return
                if (capture != null) return
                releaseRecognizer()
                status.text = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Не расслышал. Повтори команду."
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Проверь соединение и повтори команду."
                    else -> "Диктовка прервалась. Повтори или введи текст."
                }
            }
        })
        current?.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            if (capture == null) {
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, CommandRecording.END_SILENCE_MS)
            }
            if (capture != null && android.os.Build.VERSION.SDK_INT >= 33) {
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, capture.audioSource)
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, CommandRecording.ENCODING)
                putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, CommandRecording.RATE)
            }
        })
        capture?.start(
            level = { value -> runOnUiThread { if (recording === capture) meter.target = value } },
            finished = { pcm -> runOnUiThread {
                if (recording === capture && !isFinishing) {
                    releaseRecognizer()
                    transcribe(pcm, androidText)
                }
            } },
        )
    }

    private fun transcribe(pcm: ByteArray, androidText: String?) {
        if (pcm.isEmpty() && androidText.isNullOrBlank()) {
            status.text = "Не расслышал. Повтори команду."
            return
        }
        busy = true
        mic.isEnabled = false
        mode.isEnabled = false
        caption.text = "Распознаю…"
        val generation = ++transcriptionGeneration
        Thread {
            val text = if (pcm.isEmpty()) null else runCatching { Api(Store(this)).transcribe(pcm) }.getOrNull()
            runOnUiThread {
                if (generation != transcriptionGeneration || isFinishing || isDestroyed) return@runOnUiThread
                busy = false
                mic.isEnabled = true
                mode.isEnabled = true
                caption.text = "Помощник"
                if (!text.isNullOrBlank()) {
                    input.setText(text)
                    send()
                } else if (!androidText.isNullOrBlank()) {
                    status.text = "Проверь распознанный текст"
                    input.setText(androidText)
                    edit(true)
                } else {
                    status.text = "Не удалось распознать запись. Повтори или введи команду."
                }
            }
        }.start()
    }

    private fun send() {
        if (busy || !unlocked()) return
        val text = input.text.toString().trim()
        if (text.isEmpty()) return
        stopSpeech()
        edit(false)
        val id = requestId?.takeIf { pendingText == text } ?: UUID.randomUUID().toString()
        requestId = id
        pendingText = text
        busy = true
        mode.isEnabled = false
        mic.isEnabled = false
        caption.text = "Выполняю…"
        status.text = text
        Thread {
            val result = runCatching { JSONObject(Api(Store(this)).assistant(text, id)) }
            if (result.isSuccess) Cdmm.refreshSoon(applicationContext)
            runOnUiThread {
                if (isDestroyed || isFinishing) return@runOnUiThread
                busy = false
                mode.isEnabled = true
                mic.isEnabled = true
                caption.text = "Помощник"
                result.onSuccess { reply ->
                    val message = reply.getString("message")
                    requestId = null
                    pendingText = null
                    input.text.clear()
                    status.text = formatReply(reply, message)
                    status.alpha = 0.4f
                    status.animate().alpha(1f).setDuration(200).start()
                    val route = reply.optString("clientRoute")
                    if (route.isNotEmpty()) {
                        startActivity(Intent(this, MainActivity::class.java).putExtra("cdmmAssistantRoute", route))
                        finish()
                    } else if (hasWindowFocus()) speak(id, message)
                }.onFailure { error ->
                    status.text = when (error) {
                        is UnauthorizedException -> "Войди в CDMM на телефоне."
                        is ApiException -> error.message
                        else -> "Не удалось связаться с CDMM. Повтори команду."
                    }
                }
            }
        }.start()
    }

    private fun formatReply(reply: JSONObject, message: String): CharSequence {
        val list = reply.optJSONObject("list") ?: return message
        val items = list.optJSONArray("items") ?: return message
        if (items.length() == 0) return message
        val result = SpannableStringBuilder(list.getString("title"))
        result.setSpan(StyleSpan(Typeface.BOLD), 0, result.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        for (i in 0 until items.length()) {
            val row = items.getJSONObject(i)
            val color = runCatching { Color.parseColor(row.optString("color")) }.getOrDefault(muted)
            result.append("\n")
            val start = result.length
            result.append(row.getString("text"))
            result.setSpan(BulletSpan(dp(8), color, dp(5)), start, result.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        if (list.optInt("remaining") > 0) result.append("\nЕщё: ").append(list.getInt("remaining").toString())
        return result
    }

    private fun stopSpeech() {
        speechGeneration++
        playback?.release()
        playback = null
        speech?.stop()
    }

    private fun speak(id: String, message: String) {
        stopSpeech()
        val generation = speechGeneration
        Thread {
            val result = runCatching {
                val audio = Api(Store(this)).assistantSpeech(id)
                val file = File.createTempFile("speech-", ".mp3", cacheDir)
                try {
                    file.writeBytes(audio)
                    val player = MediaPlayer()
                    try {
                        FileInputStream(file).use { player.setDataSource(it.fd) }
                        player.prepare()
                        player
                    } catch (error: Exception) {
                        player.release()
                        throw error
                    }
                } finally { file.delete() }
            }
            runOnUiThread {
                if (generation != speechGeneration || isFinishing || isDestroyed || !hasWindowFocus()) {
                    result.getOrNull()?.release()
                    return@runOnUiThread
                }
                result.onSuccess { player ->
                    playback = player
                    player.setOnCompletionListener { if (playback === it) stopSpeech() }
                    player.start()
                }.onFailure {
                    if (speechReady) speech?.speak(message, TextToSpeech.QUEUE_FLUSH, null, id)
                }
            }
        }.start()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString("input", input.text.toString())
        outState.putCharSequence("status", status.text)
        outState.putBoolean("typing", typing || busy)
        outState.putString("pendingText", pendingText)
        outState.putString("requestId", requestId)
    }

    override fun onStop() {
        super.onStop()
        if (caption.text == "Распознаю…") {
            transcriptionGeneration++
            busy = false
            mic.isEnabled = true
            mode.isEnabled = true
            caption.text = "Помощник"
            status.text = "Диктовка остановлена"
        }
        if (recognizer != null || recording != null) {
            releaseRecognizer()
            status.text = "Диктовка остановлена"
        }
        stopSpeech()
    }

    override fun onDestroy() {
        speech?.shutdown()
        super.onDestroy()
    }
}
