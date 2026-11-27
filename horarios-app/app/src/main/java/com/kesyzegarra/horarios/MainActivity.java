package com.kesyzegarra.horarios;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import java.util.ArrayList;
import java.util.Locale;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/** Muestra la app web incluida en el APK, servida desde https://appassets.androidplatform.net */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;
    private SpeechRecognizer reconocedor;
    private TextToSpeech tts;
    private boolean ttsListo = false, escucharAlPermitir = false;
    private ValueCallback<Uri[]> archivoCb;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 21) w.setStatusBarColor(Color.parseColor("#3a4108"));

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                // enlaces externos: se abren en el navegador
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.addJavascriptInterface(new Puente(), "AndroidApp");
        Notifs.crearCanal(this);
        // selector de fotos (adjuntar una planilla al asistente)
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (archivoCb != null) archivoCb.onReceiveValue(null);
                archivoCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE)
                        .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(Intent.createChooser(i, "Elegí una foto"), 9); }
                catch (Exception e) { archivoCb = null; return false; }
                return true;
            }
        });
        tts = new TextToSpeech(this, estado -> {
            if (estado != TextToSpeech.SUCCESS) return;
            int r = tts.setLanguage(new Locale("es", "AR"));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(new Locale("es"));
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { js("window.__vozFinHabla && window.__vozFinHabla()"); }
                @Override public void onError(String id) { js("window.__vozFinHabla && window.__vozFinHabla()"); }
            });
            ttsListo = true;
        });
        setContentView(web);
        boolean abrirNotifs = "notificaciones".equals(getIntent().getStringExtra("abrir"));
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("https://" + HOST + "/index.html" + (abrirNotifs ? "#notificaciones" : ""));
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != 9 || archivoCb == null) return;
        Uri[] r = null;
        if (res == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount(); r = new Uri[n];
                for (int i = 0; i < n; i++) r[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) r = new Uri[]{data.getData()};
        }
        archivoCb.onReceiveValue(r); archivoCb = null;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == 8 && escucharAlPermitir) {
            escucharAlPermitir = false;
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) iniciarEscucha();
            else voz("error", "Permití el uso del micrófono para hablar con el asistente.");
        }
    }

    @Override
    protected void onDestroy() {
        if (reconocedor != null) reconocedor.destroy();
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    private void js(String codigo) { runOnUiThread(() -> web.evaluateJavascript(codigo, null)); }
    private void voz(String tipo, String texto) {
        js("window.__voz && window.__voz({tipo:" + org.json.JSONObject.quote(tipo) + ",texto:" + org.json.JSONObject.quote(texto == null ? "" : texto) + "})");
    }

    /** Reconocimiento de voz nativo en español (Argentina). */
    private void iniciarEscucha() {
        if (reconocedor == null) {
            reconocedor = SpeechRecognizer.createSpeechRecognizer(this);
            reconocedor.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle b) { }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float db) { }
                @Override public void onBufferReceived(byte[] b) { }
                @Override public void onEndOfSpeech() { }
                @Override public void onEvent(int t, Bundle b) { }
                @Override public void onPartialResults(Bundle b) {
                    ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (r != null && !r.isEmpty()) voz("parcial", r.get(0));
                }
                @Override public void onResults(Bundle b) {
                    ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (r != null && !r.isEmpty() && !r.get(0).trim().isEmpty()) voz("final", r.get(0));
                    else voz("error", "No te escuché. Probá de nuevo.");
                }
                @Override public void onError(int e) {
                    String m;
                    switch (e) {
                        case SpeechRecognizer.ERROR_NO_MATCH: case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: m = "No te escuché. Probá de nuevo."; break;
                        case SpeechRecognizer.ERROR_NETWORK: case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: m = "Sin conexión para reconocer la voz."; break;
                        case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: m = "Permití el uso del micrófono para hablar con el asistente."; break;
                        case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: m = "El micrófono está ocupado. Probá de nuevo."; break;
                        default: m = "No pude escucharte."; break;
                    }
                    voz("error", m);
                }
            });
        }
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-AR")
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        if (tts != null) tts.stop();
        reconocedor.startListening(i);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if ("notificaciones".equals(intent.getStringExtra("abrir")))
            web.evaluateJavascript("window.abrirNotificaciones && window.abrirNotificaciones()", null);
    }

    private void avisarToken(String t) {
        final String js = "window.__tokenPush && window.__tokenPush(" + (t.isEmpty() ? "null" : org.json.JSONObject.quote(t)) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    /** Funciones que la app web puede llamar como window.AndroidApp.* */
    private class Puente {
        @JavascriptInterface
        public String permiso() {
            if (Notifs.permitido(MainActivity.this)) return "granted";
            if (Build.VERSION.SDK_INT >= 33 && !getSharedPreferences(Notifs.PREFS, MODE_PRIVATE).getBoolean("pidio", false)) return "default";
            return "denied";
        }

        @JavascriptInterface
        public void pedirPermiso() {
            if (Build.VERSION.SDK_INT < 33) return;
            runOnUiThread(() -> {
                if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    getSharedPreferences(Notifs.PREFS, MODE_PRIVATE).edit().putBoolean("pidio", true).apply();
                    requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 7);
                }
            });
        }

        /** Token de notificaciones push; si todavía no está, lo pide y avisa con window.__tokenPush(t). */
        @JavascriptInterface
        public String tokenPush() {
            SharedPreferences p = getSharedPreferences(Notifs.PREFS, MODE_PRIVATE);
            String t = p.getString("fcmToken", "");
            if (!t.isEmpty()) return t;
            if (FirebaseApp.getApps(MainActivity.this).isEmpty()) { avisarToken(""); return ""; }
            FirebaseMessaging.getInstance().getToken()
                    .addOnSuccessListener(nuevo -> { p.edit().putString("fcmToken", nuevo).apply(); avisarToken(nuevo); })
                    .addOnFailureListener(e -> avisarToken(""));
            return "";
        }

        // ---- voz (asistente de IA) ----
        @JavascriptInterface
        public boolean vozDisponible() { return SpeechRecognizer.isRecognitionAvailable(MainActivity.this); }

        @JavascriptInterface
        public void vozEscuchar() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    escucharAlPermitir = true;
                    requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, 8);
                } else iniciarEscucha();
            });
        }

        @JavascriptInterface
        public void vozDetener() { runOnUiThread(() -> { if (reconocedor != null) reconocedor.cancel(); }); }

        @JavascriptInterface
        public void vozHablar(String texto) {
            if (!ttsListo) { js("window.__vozFinHabla && window.__vozFinHabla()"); return; }
            tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "r" + System.currentTimeMillis());
        }

        @JavascriptInterface
        public void vozCallar() { if (tts != null) tts.stop(); }

        @JavascriptInterface
        public void notificar(String id, String titulo, String texto) {
            Notifs.mostrar(MainActivity.this, id, titulo, texto);
        }

        /** Guarda (o borra) la sesión para revisar cambios en segundo plano. */
        @JavascriptInterface
        public void guardarSesion(String json) {
            Context c = getApplicationContext();
            SharedPreferences p = c.getSharedPreferences(Notifs.PREFS, MODE_PRIVATE);
            WorkManager wm = WorkManager.getInstance(c);
            if (json == null || json.isEmpty()) {
                p.edit().remove("sesion").apply();
                wm.cancelUniqueWork("revisar-cambios");
                return;
            }
            p.edit().putString("sesion", json).apply();
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(RevisarCambiosWorker.class, 15, TimeUnit.MINUTES)
                    .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build();
            wm.enqueueUniquePeriodicWork("revisar-cambios", ExistingPeriodicWorkPolicy.UPDATE, req);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
