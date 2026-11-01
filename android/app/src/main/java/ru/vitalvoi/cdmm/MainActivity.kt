package ru.vitalvoi.cdmm

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import ru.vitalvoi.cdmm.core.Cdmm
import ru.vitalvoi.cdmm.core.Store

/**
 * The CDMM web app in a WebView. The UI stays on the server, so it updates
 * with every deploy; this shell only adds what a browser can't do: widgets,
 * alarms and the watch, fed through the `CDMMAndroid` bridge.
 */
class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private lateinit var store: Store

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))

        val root = FrameLayout(this)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.userAgentString = settings.userAgentString + " CDMMAndroid/1"
            setBackgroundColor(getColor(R.color.cdmm_bg))
            addJavascriptInterface(Bridge(), "CDMMAndroid")
            webViewClient = Client()
        }
        root.addView(web)
        setContentView(root)

        // Edge to edge: keep the page clear of the bars and the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        if (savedInstanceState == null) web.loadUrl(store.server) else web.restoreState(savedInstanceState)
        askForNotifications()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        Cdmm.refreshSoon(this)
    }

    private fun askForNotifications() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    /** Stay on the CDMM server; anything else opens in the browser. */
    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.host == Uri.parse(store.server).host) return false
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
            return true
        }
    }

    /**
     * Called from page JavaScript, on a binder thread. Only the CDMM page can
     * call it: navigation never leaves the server's host.
     */
    private inner class Bridge {
        @JavascriptInterface
        fun setSession(token: String, username: String) {
            if (token == store.token) return
            store.setSession(token, username)
            Cdmm.refreshSoon(applicationContext)
        }

        @JavascriptInterface
        fun clearSession() {
            store.clearSession()
            Cdmm.changed(applicationContext)
        }

        @JavascriptInterface
        fun dataChanged() {
            Cdmm.refreshSoon(applicationContext)
        }
    }
}
